import { syncMetaForClient } from './meta/metaSync.js';
import { syncGoogleForClient } from './google/googleSync.js';
import { syncMerittoForClient } from './meritto/merittoSync.js';
import { logger } from '../utils/logger.js';
import type { IntegrationProvider } from '../types/domain.js';
import type { SyncJobParams } from '../types/sync.js';

const EXECUTORS: Record<IntegrationProvider, (params: SyncJobParams) => Promise<unknown>> = {
  meta: syncMetaForClient,
  google_ads: syncGoogleForClient,
  meritto: syncMerittoForClient,
};

/**
 * Fire-and-forget entrypoint shared by the scheduler (syncScheduler.ts) and the manual "Sync now"
 * endpoint (services/syncService.ts) - the one place both paths go through, so both get identical
 * error containment. Does not await the executor: syncs can run 25+ minutes (Meritto's own
 * rate-limit pacing), so callers (a cron tick, an HTTP handler) must return immediately.
 *
 * The `.catch` here is load-bearing, not defensive boilerplate: syncMetaForClient/syncGoogleForClient/
 * syncMerittoForClient are each entirely `return runTrackedSync(...)`, which already turns any
 * internal failure into a `{status:'failed'}` sync_runs row - except runTrackedSync's own
 * createSyncRun() call, which runs *before* its try block and can throw straight past it (a
 * genuine DB-error edge case, not hypothetical). Without this catch, that one case would be an
 * unhandled rejection with no sync_runs row at all to explain what happened.
 */
export function runSyncInBackground(provider: IntegrationProvider, params: SyncJobParams, log: typeof logger = logger): void {
  const executor = EXECUTORS[provider];
  void executor(params).catch((err: unknown) => {
    log.error(
      { err, clientId: params.clientId, provider, runType: params.runType },
      'Sync executor threw outside runTrackedSync - no sync_runs row may exist for this attempt',
    );
  });
}
