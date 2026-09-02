import type { IntegrationProvider } from '../types/domain.js';

/**
 * Default daily morning-sync time per provider, in the client's own timezone (clients.timezone) -
 * configurable per client via sync_jobs.metadata. All three default to the same time: the
 * scheduler (scheduler/syncScheduler.ts) doesn't rely on a fixed minute offset between them to
 * sequence Meta/Google before Meritto - it explicitly waits for Meta/Google's *actual* completion
 * (checked via sync_runs), since real run durations vary far more than a fixed few minutes
 * (Meritto alone can take 25+ minutes due to its own rate-limit pacing).
 */
export const DEFAULT_SYNC_SCHEDULE: Record<IntegrationProvider, { hour: number; minute: number }> = {
  meta: { hour: 6, minute: 0 },
  google_ads: { hour: 6, minute: 0 },
  meritto: { hour: 6, minute: 0 },
};

/** How many days back an incremental daily sync re-pulls, to absorb late-arriving/attributed conversions. */
export const DEFAULT_LOOKBACK_DAYS = 3;

/** Meritto reconciliation pulls a wider window nightly to self-heal missed updates. */
export const MERITTO_RECONCILIATION_LOOKBACK_DAYS = 14;

/**
 * Meritto's lead-list date filter is anchored to lead creation/age, not last-modified (confirmed
 * empirically - a 94-day-old lead whose disposition changed to "Enrolled" was invisible to a
 * 90-day windowed pull but visible in an unfiltered one). That means the daily reconciliation
 * window above can NEVER pick up a status change on a lead older than it, no matter how wide it
 * is, since sales cycles for this account's courses regularly run well past 14 days. Rather than
 * widen the daily window indefinitely (each extra 30-day chunk adds real, rate-limited API time -
 * see merittoSync.ts), the scheduler runs one full unfiltered backfill per client at this cadence,
 * layered on top of the fast daily windowed reconciliation: recent leads stay fresh daily, and no
 * lead's status can go stale for longer than this many days regardless of age.
 */
export const MERITTO_BACKFILL_INTERVAL_DAYS = 7;

/**
 * Meta/Google's daily reconciliation only re-pulls the last DEFAULT_LOOKBACK_DAYS (3) days, to
 * absorb Meta's own delayed attribution (spend/impressions/clicks for a given day keep revising
 * for up to ~72h, sometimes longer, after the fact). That's fine in steady state, but confirmed
 * empirically to fail silently after any outage longer than 3 days: a real gap in this account's
 * Meta syncs (Aug 28 - Sept 1) left one ad's Aug 28 row frozen at a partial-day snapshot - 3-5x
 * under Meta's real numbers - because by the time syncing resumed, Aug 28 had already aged just
 * outside the 3-day window and no later sync ever looked at it again. Same failure mode as
 * Meritto's reconciliation gap above, same fix: a periodic wider-window pass layered on top of
 * the fast daily one, so a day's numbers can never freeze wrong for longer than this interval.
 */
export const AD_PLATFORM_BACKFILL_INTERVAL_DAYS = 7;

/** Lookback window used by the periodic Meta/Google backfill above - wide enough to cover any realistic outage plus Meta's own attribution-revision window, without re-pulling the account's entire history every time (unlike Meritto, these APIs need an explicit bounded date range). */
export const AD_PLATFORM_BACKFILL_LOOKBACK_DAYS = 45;

/** How long the scheduler waits for Meta+Google to finish today before running Meritto anyway (a sync with possibly-stale attribution beats no sync at all). */
export const MERITTO_MAX_WAIT_MINUTES = 180;

/** A sync_runs row still 'running' this long after it started is assumed orphaned by a process crash/redeploy, not a real long-running sync - see repositories/syncRunsRepo.ts::failStaleRunningSyncRuns. */
export const STALE_SYNC_RUN_THRESHOLD_MINUTES = 120;

export const PAGE_SIZE = {
  meta: 100,
  // No `google` entry - the Ads API's `search` endpoint rejects a client-supplied pageSize
  // (fixed 10,000-row pages as of recent versions), see integrations/google/googleAdsClient.ts.
  meritto: 100,
} as const;

export const RETRY = {
  maxAttempts: 5,
  minTimeoutMs: 500,
  maxTimeoutMs: 30_000,
  factor: 2,
};

export const RATE_LIMIT = {
  /** Sensitive endpoints: manual sync trigger, integration connect/disconnect. */
  sensitive: { max: 20, windowMs: 60_000 },
  /** General authenticated API. */
  default: { max: 300, windowMs: 60_000 },
};

export const DATE_RANGE_PRESETS = ['7d', '30d', 'mtd', 'qtd'] as const;
export type DateRangePreset = (typeof DATE_RANGE_PRESETS)[number];

export const SPEED_TO_LEAD_BUCKETS = ['<1h', '1-4h', '4-24h', '>24h'] as const;
export const UNCALLED_AGING_BUCKETS = ['<24h', '24-48h', '>48h'] as const;

export const FATIGUE_WINDOW_DAYS = 14;
export const FATIGUE_MIN_LEADS_PER_WINDOW = 10;
export const FATIGUE_STEADY_THRESHOLD_PP = 3;
