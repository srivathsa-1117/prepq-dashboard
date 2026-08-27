import { createSyncRun, completeSyncRun } from '../repositories/syncRunsRepo.js';
import { SyncRunCounters } from '../types/sync.js';
import type { IntegrationProvider, SyncRunType } from '../types/domain.js';
import { logger } from '../utils/logger.js';

export interface TrackedSyncParams {
  clientId: string;
  integrationId: string;
  provider: IntegrationProvider;
  runType: SyncRunType;
  triggeredBy?: string | null;
  triggerDevRunId?: string | null;
}

export interface TrackedSyncResult {
  syncRunId: string;
  status: 'success' | 'partial' | 'failed';
  counters: SyncRunCounters;
}

/**
 * Wraps a provider sync executor with sync_runs bookkeeping: creates the run
 * row (resolving/creating the client's sync_jobs row for this provider along
 * the way), runs the executor with a fresh counters object the executor
 * mutates as it goes, and records success/partial/failed with duration and
 * error details no matter how the executor exits. This is the one place
 * that decides the final status, so Meta/Google/Meritto sync entrypoints
 * cannot each implement slightly different failure semantics.
 */
export async function runTrackedSync(
  params: TrackedSyncParams,
  executor: (counters: SyncRunCounters) => Promise<void>,
): Promise<TrackedSyncResult> {
  const run = await createSyncRun({
    clientId: params.clientId,
    integrationId: params.integrationId,
    provider: params.provider,
    runType: params.runType,
    triggeredBy: params.triggeredBy,
    triggerDevRunId: params.triggerDevRunId,
  });

  const counters = new SyncRunCounters();
  const log = logger.child({ syncRunId: run.id, clientId: params.clientId, provider: params.provider });
  log.info('Sync run started');

  try {
    await executor(counters);

    const status = counters.failed > 0 ? 'partial' : 'success';
    await completeSyncRun(run.id, run.syncJobId, { status, counters, startedAt: run.startedAt });
    log.info({ status, counters }, 'Sync run finished');
    return { syncRunId: run.id, status, counters };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    // Provider HTTP clients (httpClient.ts) attach the real response body as `cause.body` on
    // RetryableError/PermanentError - surface it here so a provider's actual error text (e.g.
    // Meta's error.message/code/error_subcode) lands in sync_runs.metadata instead of being
    // lost behind a bare "HTTP 403"/"HTTP 400".
    const cause = error instanceof Error ? (error.cause as { statusCode?: number; body?: unknown } | undefined) : undefined;
    const errorDetails =
      error instanceof Error
        ? { name: error.name, stack: error.stack, causeStatusCode: cause?.statusCode, causeBody: cause?.body }
        : { raw: String(error) };

    await completeSyncRun(run.id, run.syncJobId, {
      status: 'failed',
      counters,
      errorMessage,
      errorDetails,
      startedAt: run.startedAt,
    });
    log.error({ err: error, causeStatusCode: cause?.statusCode, causeBody: cause?.body }, 'Sync run failed');
    return { syncRunId: run.id, status: 'failed', counters };
  }
}
