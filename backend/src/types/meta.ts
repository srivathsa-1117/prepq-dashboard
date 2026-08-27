/**
 * Meta Marketing API (Graph API) shapes.
 *
 * Field lists below reflect the documented Graph API fields as of the pinned
 * META_GRAPH_API_VERSION. TODO(meta): re-verify field availability/permission
 * scopes for this specific app + ad account before go-live - Meta gates some
 * fields (e.g. certain `actions` breakdowns) behind Advanced Access review.
 * Docs: https://developers.facebook.com/docs/marketing-api/reference
 */

export interface MetaPagingCursors {
  before?: string;
  after?: string;
}

export interface MetaPaging {
  cursors?: MetaPagingCursors;
  next?: string;
  previous?: string;
}

export interface MetaListResponse<T> {
  data: T[];
  paging?: MetaPaging;
}

export interface MetaAdAccount {
  id: string; // "act_123456789"
  account_id: string;
  name: string;
  account_status: number;
  currency: string;
  timezone_name: string;
}

export interface MetaCampaign {
  id: string;
  name: string;
  objective: string;
  status: string; // ACTIVE | PAUSED | ARCHIVED | DELETED
  daily_budget?: string; // Meta returns budgets as strings, in account currency minor units
  lifetime_budget?: string;
  start_time?: string;
  stop_time?: string;
  updated_time?: string;
}

export interface MetaAdSet {
  id: string;
  campaign_id: string;
  name: string;
  status: string;
  optimization_goal?: string;
  billing_event?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  updated_time?: string;
}

export interface MetaAdCreative {
  id: string;
  name?: string;
  title?: string;
  body?: string;
  thumbnail_url?: string;
  image_url?: string;
  video_id?: string;
  object_type?: string;
  call_to_action_type?: string;
  /** Only present for carousel ads - each entry's image_hash needs resolving to a real URL via MetaClient.fetchImageUrlsByHashes. */
  object_story_spec?: {
    link_data?: {
      child_attachments?: Array<{ image_hash?: string }>;
    };
  };
  /** Dynamic Creative (DCO) ads have no single image_url/video_id - they assemble ads at serve-time from a pool of image/video/text variations here instead. Images use the same hash-resolution as carousel child_attachments; videos use the same video_id resolution as the top-level video_id field. */
  asset_feed_spec?: {
    images?: Array<{ hash?: string }>;
    videos?: Array<{ video_id?: string }>;
  };
}

export interface MetaAd {
  id: string;
  adset_id: string;
  name: string;
  status: string;
  creative?: { id: string };
  updated_time?: string;
}

/** One row of the Insights API, day-granular (time_increment=1). */
export interface MetaInsightsRow {
  ad_id: string;
  date_start: string; // YYYY-MM-DD
  date_stop: string;
  impressions?: string;
  clicks?: string;
  spend?: string;
  reach?: string;
  frequency?: string;
  actions?: Array<{ action_type: string; value: string }>;
}

/** Our internal normalized shape, produced by integrations/meta/metaTransform.ts. */
export interface NormalizedMetaCampaign {
  metaCampaignId: string;
  name: string | null;
  objective: string | null;
  status: string | null;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  startTime: string | null;
  stopTime: string | null;
  raw: MetaCampaign;
}

export interface NormalizedMetaAdSet {
  metaAdsetId: string;
  metaCampaignId: string;
  name: string | null;
  status: string | null;
  optimizationGoal: string | null;
  billingEvent: string | null;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  raw: MetaAdSet;
}

export interface NormalizedMetaAd {
  metaAdId: string;
  metaAdsetId: string;
  metaCreativeId: string | null;
  name: string | null;
  status: string | null;
  raw: MetaAd;
}

export interface NormalizedMetaCreative {
  metaCreativeId: string;
  name: string | null;
  title: string | null;
  body: string | null;
  thumbnailUrl: string | null;
  imageUrl: string | null;
  videoId: string | null;
  objectType: string | null;
  callToActionType: string | null;
  /** image_hash values for a carousel ad's per-card images (empty for everything else) - still needs resolving to real URLs via MetaClient.fetchImageUrlsByHashes. */
  carouselImageHashes: string[];
  raw: MetaAdCreative;
}

export interface NormalizedMetaDailyMetric {
  metaAdId: string;
  date: string;
  impressions: number;
  clicks: number;
  spend: number;
  reach: number | null;
  frequency: number | null;
  leads: number;
  actions: Array<{ action_type: string; value: string }> | null;
  raw: MetaInsightsRow;
}
