import { task, schedules, logger } from '@trigger.dev/sdk';
import { syncMerittoForClient } from '../../sync/meritto/merittoSync.js';
import { getIntegrationIdForClientProvider } from '../../repositories/integrationsRepo.js';
import type { SyncJobParams } from '../../types/sync.js';

export const merittoSyncTask = task({
  id: 'meritto-sync',
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 2000, maxTimeoutInMs: 60_000, randomize: true },
  run: async (payload: SyncJobParams) => {
    const result = await syncMerittoForClient(payload);
    logger.info('Meritto sync complete', { ...result });
    return result;
  },
});

export const merittoSyncSchedule = schedules.task({
  id: 'meritto-sync-scheduled',
  run: async (payload) => {
    if (!payload.externalId) {
      throw new Error('meritto-sync-scheduled requires externalId (clientId) - schedule was created without one');
    }
    const clientId = payload.externalId;

    const integrationId = await getIntegrationIdForClientProvider(clientId, 'meritto');
    if (!integrationId) {
      logger.warn('Skipping scheduled Meritto sync - no integration row for client', { clientId });
      return { skipped: true, reason: 'no_integration' };
    }

    return syncMerittoForClient({ clientId, integrationId, runType: 'scheduled' });
  },
});
