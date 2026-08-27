import type {
  GoogleAdGroupAdRow,
  GoogleAdGroupRow,
  GoogleCampaignRow,
  GoogleMetricsRow,
  NormalizedGoogleAd,
  NormalizedGoogleAdGroup,
  NormalizedGoogleCampaign,
  NormalizedGoogleDailyMetric,
} from '../../types/google.js';

function parseIntSafe(value: string | undefined): number {
  if (value === undefined || value === '') return 0;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : 0;
}

function parseFloatSafe(value: string | undefined): number {
  if (value === undefined || value === '') return 0;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

export function transformCampaign(row: GoogleCampaignRow, customerId: string): NormalizedGoogleCampaign {
  return {
    googleCampaignId: row.campaign.id,
    googleCustomerId: customerId,
    name: row.campaign.name ?? null,
    status: row.campaign.status ?? null,
    advertisingChannelType: row.campaign.advertisingChannelType ?? null,
    campaignBudgetMicros: row.campaignBudget?.amountMicros ? parseIntSafe(row.campaignBudget.amountMicros) : null,
    startDate: row.campaign.startDateTime ?? null,
    endDate: row.campaign.endDateTime ?? null,
    raw: row,
  };
}

export function transformAdGroup(row: GoogleAdGroupRow): NormalizedGoogleAdGroup {
  return {
    googleAdGroupId: row.adGroup.id,
    googleCampaignId: row.campaign.id,
    name: row.adGroup.name ?? null,
    status: row.adGroup.status ?? null,
    type: row.adGroup.type ?? null,
    raw: row,
  };
}

export function transformAd(row: GoogleAdGroupAdRow): NormalizedGoogleAd {
  // Ad-level `name` exists in the API but is rarely set by advertisers on Responsive Search Ads
  // - fall back to the first headline (what a human would recognize the ad by) rather than null.
  const fallbackName = row.adGroupAd.ad.responsiveSearchAd?.headlines?.[0]?.text ?? null;
  return {
    googleAdId: row.adGroupAd.ad.id,
    googleAdGroupId: row.adGroup.id,
    name: row.adGroupAd.ad.name ?? fallbackName,
    status: row.adGroupAd.status ?? null,
    adType: row.adGroupAd.ad.type ?? null,
    finalUrls: row.adGroupAd.ad.finalUrls ?? null,
    headlines: row.adGroupAd.ad.responsiveSearchAd?.headlines ?? null,
    descriptions: row.adGroupAd.ad.responsiveSearchAd?.descriptions ?? null,
    raw: row,
  };
}

export function transformDailyMetric(row: GoogleMetricsRow): NormalizedGoogleDailyMetric {
  return {
    googleAdId: row.adGroupAd.ad.id,
    date: row.segments.date,
    impressions: parseIntSafe(row.metrics.impressions),
    clicks: parseIntSafe(row.metrics.clicks),
    costMicros: parseIntSafe(row.metrics.costMicros),
    conversions: parseFloatSafe(row.metrics.conversions),
    conversionsValue: parseFloatSafe(row.metrics.conversionsValue),
    raw: row,
  };
}
