import type { IntegrationProvider } from '../types/domain.js';

/** Default morning sync offsets (minutes after the client's configured base hour). Configurable per client via sync_schedules. */
export const DEFAULT_SYNC_SCHEDULE: Record<IntegrationProvider, { hour: number; minute: number }> = {
  meta: { hour: 6, minute: 0 },
  google_ads: { hour: 6, minute: 10 },
  meritto: { hour: 6, minute: 20 },
};

/** How many days back an incremental daily sync re-pulls, to absorb late-arriving/attributed conversions. */
export const DEFAULT_LOOKBACK_DAYS = 3;

/** Meritto reconciliation pulls a wider window nightly to self-heal missed updates. */
export const MERITTO_RECONCILIATION_LOOKBACK_DAYS = 14;

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
