import { schedules } from '@trigger.dev/sdk';
import { ensureSyncJob, getSyncJob, updateSyncSchedule } from '../repositories/syncJobsRepo.js';
import { DEFAULT_SYNC_SCHEDULE } from '../config/constants.js';
import type { IntegrationProvider } from '../types/domain.js';
import { logger } from '../utils/logger.js';

const SCHEDULED_TASK_ID: Record<IntegrationProvider, string> = {
  meta: 'meta-sync-scheduled',
  google_ads: 'google-ads-sync-scheduled',
  meritto: 'meritto-sync-scheduled',
};

function defaultCronFor(provider: IntegrationProvider): string {
  const { hour, minute } = DEFAULT_SYNC_SCHEDULE[provider];
  return `${minute} ${hour} * * *`;
}

/**
 * Creates or updates the Trigger.dev schedule for a client+provider and
 * mirrors the result into sync_jobs.metadata (cronExpression/timezone/
 * triggerDevScheduleId - see repositories/syncJobsRepo.ts). Requires an
 * `integrations` row to already exist (sync_jobs.integration_id is NOT
 * NULL), so this runs at connect time, not at client-creation time - see
 * services/integrationService.ts::connectIntegration.
 *
 * deduplicationKey makes this idempotent - calling it again with a new
 * cron/timezone updates the same remote schedule instead of creating a
 * duplicate (Trigger.dev docs: "Idempotency: ... updates if reused").
 */
export async function registerOrUpdateSchedule(input: {
  clientId: string;
  integrationId: string;
  provider: IntegrationProvider;
  cronExpression?: string;
  timezone?: string;
  enabled?: boolean;
}): Promise<void> {
  const cronExpression = input.cronExpression ?? defaultCronFor(input.provider);
  const timezone = input.timezone ?? 'UTC';
  const enabled = input.enabled ?? true;

  await ensureSyncJob(input.clientId, input.integrationId, input.provider);

  const remoteSchedule = await schedules.create({
    task: SCHEDULED_TASK_ID[input.provider],
    cron: cronExpression,
    timezone,
    externalId: input.clientId,
    deduplicationKey: `${input.clientId}-${input.provider}`,
  });

  if (!enabled) {
    await schedules.deactivate(remoteSchedule.id);
  }

  await updateSyncSchedule(input.clientId, input.provider, {
    enabled,
    metadata: { cronExpression, timezone, triggerDevScheduleId: remoteSchedule.id },
  });

  logger.info({ clientId: input.clientId, provider: input.provider, cronExpression, timezone, enabled }, 'Sync schedule registered');
}

export async function setScheduleEnabled(clientId: string, provider: IntegrationProvider, enabled: boolean): Promise<void> {
  const existing = await getSyncJob(clientId, provider);
  const scheduleId = existing?.metadata.triggerDevScheduleId;
  if (!existing || !scheduleId) {
    throw new Error(`No schedule registered for client=${clientId} provider=${provider}`);
  }

  if (enabled) await schedules.activate(scheduleId);
  else await schedules.deactivate(scheduleId);

  await updateSyncSchedule(clientId, provider, { enabled, metadata: existing.metadata });
}

export async function removeSchedule(clientId: string, provider: IntegrationProvider): Promise<void> {
  const existing = await getSyncJob(clientId, provider);
  if (existing?.metadata.triggerDevScheduleId) {
    await schedules.del(existing.metadata.triggerDevScheduleId);
  }
  await updateSyncSchedule(clientId, provider, { enabled: false, metadata: {} });
}
