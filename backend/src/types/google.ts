/**
 * Google Ads API (GAQL / Google Ads Query Language) shapes.
 *
 * The Google Ads API returns results as rows of resource objects keyed by
 * the fields selected in the GAQL query, not flat objects - the shapes below
 * model the `campaign`/`ad_group`/`ad_group_ad`/`metrics` resource fragments
 * we select. TODO(google): confirm exact GAQL field availability for
 * GOOGLE_ADS_API_VERSION and this account's access level (Standard vs Test).
 * Docs: https://developers.google.com/google-ads/api/fields/latest/overview
 */

/** `results` is genuinely absent (not an empty array) when a query matches zero rows - a real, documented Google Ads API quirk, not a guess (live-tested: an incremental metrics window with no new activity omits the field entirely). */
export interface GoogleAdsSearchResponse<T> {
  results?: T[];
  nextPageToken?: string;
}

export interface GoogleCampaignRow {
  campaign: {
    id: string;
    name: string;
    status: string; // ENABLED | PAUSED | REMOVED
    advertisingChannelType: string;
    startDateTime?: string;
    endDateTime?: string;
  };
  campaignBudget?: {
    amountMicros?: string;
  };
}

export interface GoogleAdGroupRow {
  adGroup: {
    id: string;
    name: string;
    status: string;
    type: string;
  };
  campaign: {
    id: string;
  };
}

export interface GoogleAdGroupAdRow {
  adGroupAd: {
    ad: {
      id: string;
      // Almost always absent on Responsive Search Ads in practice - advertisers rarely set it
      // (it's a distinct field from the headlines) - see transformAd's headline fallback.
      name?: string;
      type: string;
      finalUrls?: string[];
      responsiveSearchAd?: {
        headlines?: Array<{ text: string }>;
        descriptions?: Array<{ text: string }>;
      };
    };
    status: string;
  };
  adGroup: {
    id: string;
  };
}

/** Daily metrics row, segmented by segments.date. */
export interface GoogleMetricsRow {
  adGroupAd: {
    ad: {
      id: string;
    };
  };
  segments: {
    date: string; // YYYY-MM-DD
  };
  metrics: {
    impressions?: string;
    clicks?: string;
    costMicros?: string;
    conversions?: string;
    conversionsValue?: string;
  };
}

/** Our internal normalized shapes, produced by integrations/google/googleTransform.ts. */
export interface NormalizedGoogleCampaign {
  googleCampaignId: string;
  googleCustomerId: string;
  name: string | null;
  status: string | null;
  advertisingChannelType: string | null;
  campaignBudgetMicros: number | null;
  startDate: string | null;
  endDate: string | null;
  raw: GoogleCampaignRow;
}

export interface NormalizedGoogleAdGroup {
  googleAdGroupId: string;
  googleCampaignId: string;
  name: string | null;
  status: string | null;
  type: string | null;
  raw: GoogleAdGroupRow;
}

export interface NormalizedGoogleAd {
  googleAdId: string;
  googleAdGroupId: string;
  name: string | null;
  status: string | null;
  adType: string | null;
  finalUrls: string[] | null;
  headlines: Array<{ text: string }> | null;
  descriptions: Array<{ text: string }> | null;
  raw: GoogleAdGroupAdRow;
}

export interface NormalizedGoogleDailyMetric {
  googleAdId: string;
  date: string;
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
  conversionsValue: number;
  raw: GoogleMetricsRow;
}
