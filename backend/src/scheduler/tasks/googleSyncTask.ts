import { task, schedules, logger } from '@trigger.dev/sdk';
import { syncGoogleForClient } from '../../sync/google/googleSync.js';
import { getIntegrationIdForClientProvider } from '../../repositories/integrationsRepo.js';
import type { SyncJobParams } from '../../types/sync.js';

export const googleSyncTask = task({
  id: 'google-ads-sync',
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 2000, maxTimeoutInMs: 60_000, randomize: true },
  run: async (payload: SyncJobParams) => {
    const result = await syncGoogleForClient(payload);
    logger.info('Google Ads sync complete', { ...result });
    return result;
  },
});

export const googleSyncSchedule = schedules.task({
  id: 'google-ads-sync-scheduled',
  run: async (payload) => {
    if (!payload.externalId) {
      throw new Error('google-ads-sync-scheduled requires externalId (clientId) - schedule was created without one');
    }
    const clientId = payload.externalId;

    const integrationId = await getIntegrationIdForClientProvider(clientId, 'google_ads');
    if (!integrationId) {
      logger.warn('Skipping scheduled Google Ads sync - no integration row for client', { clientId });
      return { skipped: true, reason: 'no_integration' };
    }

    return syncGoogleForClient({ clientId, integrationId, runType: 'scheduled' });
  },
});
