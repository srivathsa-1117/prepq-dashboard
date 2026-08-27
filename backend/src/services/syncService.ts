import { randomUUID } from 'node:crypto';
import { runSyncInBackground } from '../sync/syncDispatcher.js';
import { getLatestSyncRuns, listSyncRuns } from '../repositories/syncRunsRepo.js';
import { getIntegration, getIntegrationIdForClientProvider } from '../repositories/integrationsRepo.js';
import { ensureSyncJob, getSyncJob, listSyncJobsForClient, updateSyncSchedule } from '../repositories/syncJobsRepo.js';
import { parseSimpleDailyCron } from '../scheduler/scheduleTime.js';
import type { IntegrationProvider } from '../types/domain.js';
import { ConflictError, ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

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
 * Triggers an on-demand sync in-process (fire-and-forget - see sync/syncDispatcher.ts) rather
 * than running it inline in the Fastify handler: syncs can take 25+ minutes (Meritto's own
 * rate-limit pacing), far longer than any reasonable HTTP timeout, so this returns immediately
 * and the sync continues in the background. A manual "sync now" click and a scheduled morning run
 * (scheduler/syncScheduler.ts) go through the exact same dispatcher and underlying sync function.
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

  const { lastRun } = await getLatestSyncRuns(clientId, provider);
  if (lastRun?.status === 'running') {
    throw new ConflictError(`A ${provider} sync is already running for this client`);
  }

  // Correlation id for logs only - the real sync_runs.id is created asynchronously inside
  // runTrackedSync and isn't known yet at the time this function returns.
  const runId = randomUUID();
  const log = logger.child({ clientId, provider, runType: 'manual', dispatchId: runId });
  runSyncInBackground(provider, { clientId, integrationId, runType: 'manual', lookbackDays, triggeredBy: userId }, log);

  return { runId };
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
  if (!parseSimpleDailyCron(input.cronExpression)) {
    throw new ValidationError('cron_expression must be a daily "minute hour * * *" expression - the only pattern the in-process scheduler supports');
  }

  await ensureSyncJob(input.clientId, integrationId, input.provider);
  await updateSyncSchedule(input.clientId, input.provider, {
    enabled: input.enabled,
    metadata: { cronExpression: input.cronExpression, timezone: input.timezone },
  });
  logger.info({ ...input }, 'Sync schedule updated');
}

export async function listSchedules(clientId: string) {
  return listSyncJobsForClient(clientId);
}
