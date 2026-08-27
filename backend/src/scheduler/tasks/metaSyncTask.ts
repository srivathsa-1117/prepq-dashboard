import { task, schedules, logger } from '@trigger.dev/sdk';
import { syncMetaForClient } from '../../sync/meta/metaSync.js';
import { getIntegrationIdForClientProvider } from '../../repositories/integrationsRepo.js';
import type { SyncJobParams } from '../../types/sync.js';

/**
 * The actual Meta sync unit of work. Triggered directly for manual "sync
 * now" requests from the API (src/api/routes/sync.routes.ts) and indirectly
 * by metaSyncSchedule below for the morning cron.
 */
export const metaSyncTask = task({
  id: 'meta-sync',
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 2000, maxTimeoutInMs: 60_000, randomize: true },
  run: async (payload: SyncJobParams) => {
    const result = await syncMetaForClient(payload);
    logger.info('Meta sync complete', { ...result });
    return result;
  },
});

/**
 * Morning cron entrypoint. One Trigger.dev schedule per client is created
 * imperatively (see scheduler/registerSchedules.ts) with externalId set to
 * the client id - that's how this single scheduled task fans out to every
 * client's own configured time instead of needing a schedule per client
 * hardcoded here.
 */
export const metaSyncSchedule = schedules.task({
  id: 'meta-sync-scheduled',
  run: async (payload) => {
    if (!payload.externalId) {
      throw new Error('meta-sync-scheduled requires externalId (clientId) - schedule was created without one');
    }
    const clientId = payload.externalId;

    const integrationId = await getIntegrationIdForClientProvider(clientId, 'meta');
    if (!integrationId) {
      logger.warn('Skipping scheduled Meta sync - no integration row for client', { clientId });
      return { skipped: true, reason: 'no_integration' };
    }

    return syncMetaForClient({ clientId, integrationId, runType: 'scheduled' });
  },
});
