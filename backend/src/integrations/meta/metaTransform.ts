import type {
  MetaAd,
  MetaAdCreative,
  MetaAdSet,
  MetaCampaign,
  MetaInsightsRow,
  NormalizedMetaAd,
  NormalizedMetaAdSet,
  NormalizedMetaCampaign,
  NormalizedMetaCreative,
  NormalizedMetaDailyMetric,
} from '../../types/meta.js';

/** Meta returns money as decimal-string minor units in the account's currency, e.g. "150.00". */
function parseMoney(value: string | undefined): number | null {
  if (value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseIntSafe(value: string | undefined): number {
  if (value === undefined || value === '') return 0;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : 0;
}

function parseFloatSafe(value: string | undefined): number | null {
  if (value === undefined || value === '') return null;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

export function transformCampaign(raw: MetaCampaign): NormalizedMetaCampaign {
  return {
    metaCampaignId: raw.id,
    name: raw.name ?? null,
    objective: raw.objective ?? null,
    status: raw.status ?? null,
    dailyBudget: parseMoney(raw.daily_budget),
    lifetimeBudget: parseMoney(raw.lifetime_budget),
    startTime: raw.start_time ?? null,
    stopTime: raw.stop_time ?? null,
    raw,
  };
}

export function transformAdSet(raw: MetaAdSet): NormalizedMetaAdSet {
  return {
    metaAdsetId: raw.id,
    metaCampaignId: raw.campaign_id,
    name: raw.name ?? null,
    status: raw.status ?? null,
    optimizationGoal: raw.optimization_goal ?? null,
    billingEvent: raw.billing_event ?? null,
    dailyBudget: parseMoney(raw.daily_budget),
    lifetimeBudget: parseMoney(raw.lifetime_budget),
    raw,
  };
}

export function transformAd(raw: MetaAd): NormalizedMetaAd {
  return {
    metaAdId: raw.id,
    metaAdsetId: raw.adset_id,
    metaCreativeId: raw.creative?.id ?? null,
    name: raw.name ?? null,
    status: raw.status ?? null,
    raw,
  };
}

export function transformCreative(raw: MetaAdCreative): NormalizedMetaCreative {
  return {
    metaCreativeId: raw.id,
    name: raw.name ?? null,
    title: raw.title ?? null,
    body: raw.body ?? null,
    thumbnailUrl: raw.thumbnail_url ?? null,
    imageUrl: raw.image_url ?? null,
    // Dynamic Creative video ads have no top-level video_id - only variants under
    // asset_feed_spec.videos[]. Using just the first variant (not resolving/showing all of
    // them, unlike the image case) is a deliberate simplification given time constraints: one
    // real, playable video beats none, and DCO ads can have many video variants.
    videoId: raw.video_id ?? raw.asset_feed_spec?.videos?.[0]?.video_id ?? null,
    objectType: raw.object_type ?? null,
    callToActionType: raw.call_to_action_type ?? null,
    // Carousel child_attachments and Dynamic Creative asset_feed_spec.images share the same
    // image_hash shape and the same resolution path (MetaClient.fetchImageUrlsByHashes) - merged
    // here so callers get one list to work with either way. For a DCO ad these are genuinely
    // multiple real variation images the ad rotates through, so showing them as a scrollable set
    // (same as a carousel) in the Creatives UI is accurate, not a hack.
    carouselImageHashes: [
      ...(raw.object_story_spec?.link_data?.child_attachments ?? []).map((a) => a.image_hash),
      ...(raw.asset_feed_spec?.images ?? []).map((i) => i.hash),
    ].filter((h): h is string => Boolean(h)),
    raw,
  };
}

/**
 * Leads are derived from the `actions` breakdown where action_type is
 * 'lead' or 'onsite_conversion.lead_grouped' (Meta uses different keys
 * depending on the lead objective/version). TODO(meta): confirm which
 * action_type this ad account's Lead Ads actually report before trusting
 * this count for anything beyond a rough sanity check against Meritto.
 */
const LEAD_ACTION_TYPES = new Set(['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead']);

export function transformDailyMetric(raw: MetaInsightsRow): NormalizedMetaDailyMetric {
  const leads = (raw.actions ?? [])
    .filter((a) => LEAD_ACTION_TYPES.has(a.action_type))
    .reduce((sum, a) => sum + parseIntSafe(a.value), 0);

  return {
    metaAdId: raw.ad_id,
    date: raw.date_start,
    impressions: parseIntSafe(raw.impressions),
    clicks: parseIntSafe(raw.clicks),
    spend: parseMoney(raw.spend) ?? 0,
    reach: raw.reach !== undefined ? parseIntSafe(raw.reach) : null,
    frequency: parseFloatSafe(raw.frequency),
    leads,
    actions: raw.actions ?? null,
    raw,
  };
}
