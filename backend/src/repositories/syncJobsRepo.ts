import { supabaseAdmin } from '../database/supabaseClient.js';
import type { IntegrationProvider } from '../types/domain.js';

const JOB_TYPE: Record<IntegrationProvider, string> = {
  meta: 'meta_morning_sync',
  google_ads: 'google_ads_morning_sync',
  meritto: 'meritto_morning_sync',
};

export interface SyncScheduleMetadata {
  cronExpression?: string;
  timezone?: string;
  triggerDevScheduleId?: string;
}

export interface SyncJob {
  id: string;
  clientId: string;
  integrationId: string;
  jobType: string;
  frequency: 'hourly' | 'daily' | 'weekly' | 'manual';
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  metadata: SyncScheduleMetadata;
}

function toSyncJob(row: {
  id: string;
  client_id: string;
  integration_id: string;
  job_type: string;
  frequency: string;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  metadata: unknown;
}): SyncJob {
  return {
    id: row.id,
    clientId: row.client_id,
    integrationId: row.integration_id,
    jobType: row.job_type,
    frequency: row.frequency as SyncJob['frequency'],
    enabled: row.enabled,
    lastRunAt: row.last_run_at,
    nextRunAt: row.next_run_at,
    metadata: (row.metadata as SyncScheduleMetadata) ?? {},
  };
}

export async function getSyncJob(clientId: string, provider: IntegrationProvider): Promise<SyncJob | null> {
  const { data, error } = await supabaseAdmin
    .from('sync_jobs')
    .select('*')
    .eq('client_id', clientId)
    .eq('job_type', JOB_TYPE[provider])
    .maybeSingle();
  if (error) throw error;
  return data ? toSyncJob(data) : null;
}

/**
 * sync_jobs has no unique constraint beyond its primary key (unlike most
 * other tables in this schema), so this is a check-then-insert rather than
 * an upsert - fine at this data scale (one row per client per provider,
 * created once at connect time).
 */
export async function ensureSyncJob(clientId: string, integrationId: string, provider: IntegrationProvider): Promise<SyncJob> {
  const existing = await getSyncJob(clientId, provider);
  if (existing) return existing;

  const { data, error } = await supabaseAdmin
    .from('sync_jobs')
    .insert({
      client_id: clientId,
      integration_id: integrationId,
      job_type: JOB_TYPE[provider],
      frequency: 'daily',
      enabled: true,
    })
    .select('*')
    .single();
  if (error) throw error;
  return toSyncJob(data);
}

export async function updateSyncJobRunTimes(syncJobId: string, lastRunAt: string, nextRunAt: string | null): Promise<void> {
  const { error } = await supabaseAdmin
    .from('sync_jobs')
    .update({ last_run_at: lastRunAt, next_run_at: nextRunAt })
    .eq('id', syncJobId);
  if (error) throw error;
}

export async function setSyncJobEnabled(clientId: string, provider: IntegrationProvider, enabled: boolean): Promise<void> {
  const { error } = await supabaseAdmin
    .from('sync_jobs')
    .update({ enabled })
    .eq('client_id', clientId)
    .eq('job_type', JOB_TYPE[provider]);
  if (error) throw error;
}

export async function updateSyncSchedule(
  clientId: string,
  provider: IntegrationProvider,
  update: { enabled: boolean; metadata: SyncScheduleMetadata },
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('sync_jobs')
    .update({ enabled: update.enabled, metadata: update.metadata as never })
    .eq('client_id', clientId)
    .eq('job_type', JOB_TYPE[provider]);
  if (error) throw error;
}

export async function listSyncJobsForClient(clientId: string): Promise<SyncJob[]> {
  const { data, error } = await supabaseAdmin.from('sync_jobs').select('*').eq('client_id', clientId);
  if (error) throw error;
  return (data ?? []).map(toSyncJob);
}
