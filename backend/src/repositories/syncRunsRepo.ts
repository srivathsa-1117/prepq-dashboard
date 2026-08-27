import { supabaseAdmin } from '../database/supabaseClient.js';
import { ensureSyncJob, getSyncJob, updateSyncJobRunTimes } from './syncJobsRepo.js';
import { withRetry } from '../utils/retry.js';
import type { IntegrationProvider, SyncRunStatus, SyncRunType } from '../types/domain.js';
import type { SyncRun, SyncRunCounters } from '../types/sync.js';
import type { Database } from '../types/database.js';

type SyncRunRow = Database['public']['Tables']['sync_runs']['Row'];

function toSyncRun(row: SyncRunRow, provider: IntegrationProvider): SyncRun {
  return {
    id: row.id,
    clientId: row.client_id,
    syncJobId: row.sync_job_id,
    provider,
    status: row.status as SyncRunStatus,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    recordsFetched: row.records_fetched,
    recordsCreated: row.records_created,
    recordsUpdated: row.records_updated,
    recordsFailed: row.records_failed,
    errorMessage: row.error_message,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  };
}

/**
 * sync_runs has no provider column of its own (it's derived via sync_job_id
 * -> sync_jobs.job_type) - creating a run first resolves/creates the client's
 * sync_jobs row for this provider, matching the "morning sync" job registered
 * at connect time (see services/clientService.ts).
 */
export async function createSyncRun(input: {
  clientId: string;
  integrationId: string;
  provider: IntegrationProvider;
  runType: SyncRunType;
  triggeredBy?: string | null;
  triggerDevRunId?: string | null;
}): Promise<SyncRun> {
  const syncJob = await ensureSyncJob(input.clientId, input.integrationId, input.provider);

  const data = await withRetry(async () => {
    const { data, error } = await supabaseAdmin
      .from('sync_runs')
      .insert({
        sync_job_id: syncJob.id,
        client_id: input.clientId,
        status: 'running',
        metadata: {
          runType: input.runType,
          triggeredBy: input.triggeredBy ?? null,
          triggerDevRunId: input.triggerDevRunId ?? null,
        },
      })
      .select('*')
      .single();

    if (error) throw error;
    return data;
  });

  return toSyncRun(data, input.provider);
}

export async function completeSyncRun(
  syncRunId: string,
  syncJobId: string,
  result: {
    status: Extract<SyncRunStatus, 'success' | 'partial' | 'failed'>;
    counters: SyncRunCounters;
    errorMessage?: string;
    errorDetails?: Record<string, unknown>;
    startedAt: string;
  },
): Promise<void> {
  // This runs after the provider sync executor has finished (often minutes of pure
  // provider-API traffic with zero Supabase calls in between) - the pooled/keep-alive
  // connection to Supabase can go stale in that window and fail on first reuse (surfaces
  // as a generic "fetch failed" from supabase-js, see retry.ts's NETWORK_ERROR_MESSAGE_PATTERN).
  // Retrying here matters more than usual: this is the call that persists the outcome of
  // everything the executor already did, so losing it to a transient network blip would
  // discard a real result even when the sync itself succeeded.
  await withRetry(async () => {
    const completedAt = new Date().toISOString();

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('sync_runs')
      .select('metadata')
      .eq('id', syncRunId)
      .single();
    if (fetchError) throw fetchError;
    const existingMetadata = (existing.metadata as Record<string, unknown>) ?? {};

    const { error } = await supabaseAdmin
      .from('sync_runs')
      .update({
        status: result.status,
        completed_at: completedAt,
        records_fetched: result.counters.fetched,
        records_created: result.counters.created,
        records_updated: result.counters.updated,
        records_failed: result.counters.failed,
        error_message: result.errorMessage ?? null,
        metadata: { ...existingMetadata, errorDetails: result.errorDetails ?? null } as never,
      })
      .eq('id', syncRunId);
    if (error) throw error;

    await updateSyncJobRunTimes(syncJobId, completedAt, null);
  });
}

function scopedQuery(clientId: string, syncJobId?: string) {
  let q = supabaseAdmin.from('sync_runs').select('*').eq('client_id', clientId);
  if (syncJobId) q = q.eq('sync_job_id', syncJobId);
  return q;
}

export async function getLatestSyncRuns(
  clientId: string,
  provider: IntegrationProvider,
): Promise<{ lastSuccessful: SyncRun | null; lastFailed: SyncRun | null; lastRun: SyncRun | null }> {
  const syncJob = await getSyncJob(clientId, provider);
  if (!syncJob) return { lastSuccessful: null, lastFailed: null, lastRun: null };

  const [{ data: lastRunData, error: e1 }, { data: lastSuccessData, error: e2 }, { data: lastFailedData, error: e3 }] = await Promise.all([
    scopedQuery(clientId, syncJob.id).order('started_at', { ascending: false }).limit(1).maybeSingle(),
    scopedQuery(clientId, syncJob.id).eq('status', 'success').order('started_at', { ascending: false }).limit(1).maybeSingle(),
    scopedQuery(clientId, syncJob.id).eq('status', 'failed').order('started_at', { ascending: false }).limit(1).maybeSingle(),
  ]);

  if (e1) throw e1;
  if (e2) throw e2;
  if (e3) throw e3;

  return {
    lastRun: lastRunData ? toSyncRun(lastRunData, provider) : null,
    lastSuccessful: lastSuccessData ? toSyncRun(lastSuccessData, provider) : null,
    lastFailed: lastFailedData ? toSyncRun(lastFailedData, provider) : null,
  };
}

/**
 * A sync_runs row still 'running' this long after it started was orphaned by a process
 * crash/redeploy mid-sync, not a real long-running sync - called once on startup
 * (src/index.ts) before the scheduler starts, since both the scheduler and the manual "Sync
 * now" endpoint treat a 'running' row as "don't start another one" and would otherwise be
 * permanently blocked for that client+provider. Deliberately does NOT call
 * updateSyncJobRunTimes - leaving sync_jobs.last_run_at untouched means the scheduler still
 * considers that day's sync "not done yet" and retries it on the next tick.
 */
export async function failStaleRunningSyncRuns(thresholdMinutes: number): Promise<number> {
  const cutoff = new Date(Date.now() - thresholdMinutes * 60_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('sync_runs')
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: 'Marked failed on startup - orphaned by a process restart/crash mid-sync',
    })
    .eq('status', 'running')
    .lt('started_at', cutoff)
    .select('id');
  if (error) throw error;
  return data?.length ?? 0;
}

/**
 * Most recent successful run of a specific runType (e.g. the last full Meritto backfill, as
 * opposed to a windowed reconciliation run) - used by the scheduler to decide when a periodic
 * backfill is due. sync_runs has no dedicated runType column (it lives in metadata, set at
 * createSyncRun time), so this scans the most recent successful runs in memory rather than
 * filtering on a jsonb path - 20 is comfortably more than a week of daily runs could ever produce
 * before a weekly-cadence backfill shows up in the page.
 */
export async function getLastSuccessfulRunOfType(
  clientId: string,
  provider: IntegrationProvider,
  runType: SyncRunType,
): Promise<SyncRun | null> {
  const syncJob = await getSyncJob(clientId, provider);
  if (!syncJob) return null;

  const { data, error } = await scopedQuery(clientId, syncJob.id).eq('status', 'success').order('started_at', { ascending: false }).limit(20);
  if (error) throw error;

  const match = (data ?? []).find((row) => (row.metadata as Record<string, unknown> | null)?.runType === runType);
  return match ? toSyncRun(match, provider) : null;
}

export async function listSyncRuns(clientId: string, provider: IntegrationProvider, limit = 50): Promise<SyncRun[]> {
  const syncJob = await getSyncJob(clientId, provider);
  if (!syncJob) return [];

  const { data, error } = await scopedQuery(clientId, syncJob.id).order('started_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => toSyncRun(row, provider));
}
