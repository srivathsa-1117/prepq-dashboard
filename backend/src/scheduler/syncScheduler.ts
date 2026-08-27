import cron from 'node-cron';
import { logger } from '../utils/logger.js';
import { listAllEnabledSyncJobs, type SyncJobWithClient } from '../repositories/syncJobsRepo.js';
import { getIntegration } from '../repositories/integrationsRepo.js';
import { getLatestSyncRuns, getLastSuccessfulRunOfType } from '../repositories/syncRunsRepo.js';
import { runSyncInBackground } from '../sync/syncDispatcher.js';
import { DEFAULT_SYNC_SCHEDULE, MERITTO_MAX_WAIT_MINUTES, MERITTO_BACKFILL_INTERVAL_DAYS } from '../config/constants.js';
import { isBackfillDue, isDueToday, isSameLocalDate, minutesPastScheduled, parseSimpleDailyCron } from './scheduleTime.js';
import type { IntegrationProvider, SyncRunType } from '../types/domain.js';

const TICK_CRON = '* * * * *';

let scheduledTask: ReturnType<typeof cron.schedule> | null = null;

/** Starts the in-process daily sync scheduler - safe to call more than once (no-ops if already running). */
export function startScheduler(): void {
  if (scheduledTask) return;
  scheduledTask = cron.schedule(TICK_CRON, () => {
    void tick();
  });
  logger.info('Sync scheduler started (in-process, 1-minute tick)');
}

export function stopScheduler(): void {
  scheduledTask?.stop();
  scheduledTask = null;
  logger.info('Sync scheduler stopped');
}

function resolveScheduleTime(job: SyncJobWithClient): { hour: number; minute: number; timezone: string } {
  const timezone = job.metadata.timezone ?? job.clientTimezone;
  const parsed = job.metadata.cronExpression ? parseSimpleDailyCron(job.metadata.cronExpression) : null;
  return { ...(parsed ?? DEFAULT_SYNC_SCHEDULE[job.provider]), timezone };
}

async function hasFinishedToday(clientId: string, provider: IntegrationProvider, timezone: string, now: Date): Promise<boolean> {
  const { lastRun } = await getLatestSyncRuns(clientId, provider);
  if (!lastRun || lastRun.status === 'running') return false;
  return isSameLocalDate(new Date(lastRun.completedAt ?? lastRun.startedAt), now, timezone);
}

/**
 * Meritto's lead-attribution resolution depends on Meta/Google's campaign data already existing
 * (this exact ordering bug already happened once, manually fixed earlier - see merittoSync.ts's
 * attribution comments). Rather than a fixed time offset (unreliable: real Meta/Google/Meritto
 * runs vary from minutes to 25+ minutes), this waits for each *connected and enabled* dependency
 * to actually finish today before letting Meritto proceed - skipping any dependency that isn't
 * connected/enabled for this client, so Meritto never waits forever on a provider that will never
 * run. MERITTO_MAX_WAIT_MINUTES is a safety valve: a stuck Meta/Google sync should not mean
 * Meritto silently never runs at all.
 */
async function meritoGate(
  job: SyncJobWithClient,
  clientJobs: SyncJobWithClient[],
  now: Date,
  timezone: string,
  hour: number,
  minute: number,
): Promise<{ proceed: boolean; timedOut: boolean; waitingOn?: IntegrationProvider }> {
  const waited = minutesPastScheduled(now, timezone, hour, minute);

  for (const dependency of ['meta', 'google_ads'] as const) {
    const dependencyJob = clientJobs.find((j) => j.provider === dependency);
    if (!dependencyJob || !dependencyJob.enabled) continue;

    const integration = await getIntegration(job.clientId, dependency);
    if (!integration || integration.status !== 'connected') continue;

    const done = await hasFinishedToday(job.clientId, dependency, timezone, now);
    if (!done) {
      if (waited >= MERITTO_MAX_WAIT_MINUTES) return { proceed: true, timedOut: true, waitingOn: dependency };
      return { proceed: false, timedOut: false, waitingOn: dependency };
    }
  }

  return { proceed: true, timedOut: false };
}

/**
 * Meritto's lead-list date filter is anchored to lead creation, not last-modified (see
 * constants.ts's MERITTO_BACKFILL_INTERVAL_DAYS comment) - a lead older than the daily
 * reconciliation window can never surface a disposition change through it, however wide that
 * window is. Once per MERITTO_BACKFILL_INTERVAL_DAYS, this promotes the day's Meritto run to a
 * full unfiltered backfill instead of the usual windowed reconciliation, bounding how stale any
 * lead's status can get regardless of age. Checked against sync_runs history (not sync_jobs
 * metadata) so a run that never completes successfully naturally gets retried the next day
 * instead of falsely marking the backfill as done.
 */
async function resolveMerittoRunType(clientId: string, now: Date): Promise<SyncRunType> {
  const lastBackfill = await getLastSuccessfulRunOfType(clientId, 'meritto', 'backfill');
  const lastBackfillAt = lastBackfill ? new Date(lastBackfill.completedAt ?? lastBackfill.startedAt) : null;
  return isBackfillDue(lastBackfillAt, now, MERITTO_BACKFILL_INTERVAL_DAYS) ? 'backfill' : 'scheduled';
}

async function evaluateJob(job: SyncJobWithClient, now: Date, clientJobs: SyncJobWithClient[]): Promise<void> {
  if (!job.enabled) return;

  const { hour, minute, timezone } = resolveScheduleTime(job);
  if (!isDueToday(now, timezone, hour, minute, job.lastRunAt)) return;

  const { lastRun } = await getLatestSyncRuns(job.clientId, job.provider);
  if (lastRun?.status === 'running') return; // already in flight - idempotency guard against double-firing

  let runType: SyncRunType = 'scheduled';

  if (job.provider === 'meritto') {
    const gate = await meritoGate(job, clientJobs, now, timezone, hour, minute);
    if (!gate.proceed) {
      logger.debug({ clientId: job.clientId, waitingOn: gate.waitingOn }, 'Meritto sync deferred pending Meta/Google');
      return;
    }
    if (gate.timedOut) {
      logger.warn({ clientId: job.clientId, waitingOn: gate.waitingOn }, 'Meritto proceeding without waiting further - max wait exceeded');
    }
    runType = await resolveMerittoRunType(job.clientId, now);
  }

  const log = logger.child({ clientId: job.clientId, provider: job.provider, runType });
  log.info('Scheduler firing sync');
  runSyncInBackground(job.provider, { clientId: job.clientId, integrationId: job.integrationId, runType }, log);
}

async function tick(): Promise<void> {
  let jobs: SyncJobWithClient[];
  try {
    jobs = await listAllEnabledSyncJobs();
  } catch (err) {
    logger.error({ err }, 'Scheduler tick: failed to load sync_jobs, will retry next tick');
    return;
  }

  const now = new Date();
  const byClient = new Map<string, SyncJobWithClient[]>();
  for (const job of jobs) byClient.set(job.clientId, [...(byClient.get(job.clientId) ?? []), job]);

  // Every job evaluated concurrently and independently caught - one client/provider's error or
  // slowness must never block or delay another's.
  await Promise.all(
    jobs.map((job) =>
      evaluateJob(job, now, byClient.get(job.clientId) ?? []).catch((err: unknown) => {
        logger.error({ err, clientId: job.clientId, provider: job.provider }, 'Scheduler: error evaluating job, skipped this tick');
      }),
    ),
  );
}
