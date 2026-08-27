import { metaSyncTask } from '../scheduler/tasks/metaSyncTask.js';
import { googleSyncTask } from '../scheduler/tasks/googleSyncTask.js';
import { merittoSyncTask } from '../scheduler/tasks/merittoSyncTask.js';
import { getLatestSyncRuns, listSyncRuns } from '../repositories/syncRunsRepo.js';
import { getIntegration, getIntegrationIdForClientProvider } from '../repositories/integrationsRepo.js';
import { getSyncJob, listSyncJobsForClient } from '../repositories/syncJobsRepo.js';
import { registerOrUpdateSchedule } from '../scheduler/registerSchedules.js';
import type { IntegrationProvider } from '../types/domain.js';
import { ValidationError } from '../utils/errors.js';

export async function getSyncStatusForClient(clientId: string, provider?: IntegrationProvider) {
  if (provider) {
    const [runs, latest, schedule] = await Promise.all([
      listSyncRuns(clientId, provider, 20),
      getLatestSyncRuns(clientId, provider),
      getSyncJob(clientId, provider),
    ]);
    return { provider, ...latest, recentRuns: runs, schedule };
  }

  const providers: IntegrationProvider[] = ['meta', 'google_ads', 'meritto'];
  const perProvider = await Promise.all(
    providers.map(async (p) => {
      const [latest, schedule] = await Promise.all([getLatestSyncRuns(clientId, p), getSyncJob(clientId, p)]);
      return { provider: p, ...latest, schedule };
    }),
  );
  return { providers: perProvider };
}

/**
 * Triggers an on-demand sync via Trigger.dev (durable, retried, not bound to
 * the HTTP request's lifetime) rather than running the sync inline in the
 * Fastify handler - a manual "sync now" click and a scheduled morning run
 * go through the exact same underlying task and code path.
 */
export async function triggerManualSync(
  clientId: string,
  provider: IntegrationProvider,
  userId: string,
  lookbackDays?: number,
): Promise<{ runId: string }> {
  const integration = await getIntegration(clientId, provider);
  if (!integration || integration.status === 'disconnected') {
    throw new ValidationError(`${provider} is not connected for this client`);
  }

  const integrationId = await getIntegrationIdForClientProvider(clientId, provider);
  if (!integrationId) {
    throw new ValidationError(`No integration record found for ${provider}`);
  }

  const payload = { clientId, integrationId, runType: 'manual' as const, lookbackDays, triggeredBy: userId };

  const handle =
    provider === 'meta'
      ? await metaSyncTask.trigger(payload)
      : provider === 'google_ads'
        ? await googleSyncTask.trigger(payload)
        : await merittoSyncTask.trigger(payload);

  return { runId: handle.id };
}

export async function updateClientSchedule(input: {
  clientId: string;
  provider: IntegrationProvider;
  cronExpression: string;
  timezone: string;
  enabled: boolean;
}): Promise<void> {
  const integrationId = await getIntegrationIdForClientProvider(input.clientId, input.provider);
  if (!integrationId) {
    throw new ValidationError(`${input.provider} is not connected for this client - connect it before configuring a schedule`);
  }
  await registerOrUpdateSchedule({ ...input, integrationId });
}

export async function listSchedules(clientId: string) {
  return listSyncJobsForClient(clientId);
}
