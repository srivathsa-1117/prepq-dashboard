import { supabaseAdmin } from '../database/supabaseClient.js';
import { upsertWithCounts, type UpsertCounts } from '../utils/upsertHelper.js';
import type { NormalizedGoogleAd, NormalizedGoogleAdGroup, NormalizedGoogleCampaign, NormalizedGoogleDailyMetric } from '../types/google.js';

// See metaRepo.ts for why this pagination exists: PostgREST caps both plain reads and
// `.upsert().select()` responses at 1000 rows, silently, so entity-id FK maps built from an
// unpaginated call start silently dropping ads (and their metrics) once an account crosses 1000
// campaigns/ad groups/ads.
const PAGE_SIZE = 1000;

async function fetchAllIds<K extends string>(
  table: 'google_campaigns' | 'google_ad_groups' | 'google_ads',
  column: K,
  integrationAccountId: string,
): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select(column)
      .eq('integration_account_id', integrationAccountId)
      .order(column, { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    for (const row of (data ?? []) as Record<string, string>[]) {
      const value = row[column];
      if (value) ids.add(value);
    }
    if (!data || data.length < PAGE_SIZE) break;
  }
  return ids;
}

async function upsertChunkedReturningIds<T extends Record<string, unknown>>(
  table: 'google_campaigns' | 'google_ad_groups' | 'google_ads',
  rows: T[],
  onConflict: string,
  idColumn: string,
  platformIdColumn: string,
): Promise<Map<string, string>> {
  const idByPlatformId = new Map<string, string>();
  for (let i = 0; i < rows.length; i += PAGE_SIZE) {
    const chunk = rows.slice(i, i + PAGE_SIZE);
    // Dynamic column list - postgrest-js can't statically parse it into a named row shape,
    // same as upsertHelper.ts's existingKeySet lookup - route through `unknown` first.
    const { data, error } = await supabaseAdmin
      .from(table)
      .upsert(chunk as never, { onConflict })
      .select(`${idColumn}, ${platformIdColumn}`);
    if (error) throw error;
    for (const row of (data ?? []) as unknown as Record<string, string>[]) {
      const platformId = row[platformIdColumn];
      const id = row[idColumn];
      if (platformId && id) idByPlatformId.set(platformId, id);
    }
  }
  return idByPlatformId;
}

export async function upsertGoogleCampaigns(
  clientId: string,
  integrationAccountId: string,
  campaigns: NormalizedGoogleCampaign[],
): Promise<{ idByPlatformId: Map<string, string>; counts: UpsertCounts }> {
  if (campaigns.length === 0) return { idByPlatformId: new Map(), counts: { created: 0, updated: 0 } };

  const existingIds = await fetchAllIds('google_campaigns', 'google_campaign_id', integrationAccountId);

  const rows = campaigns.map((c) => ({
    client_id: clientId,
    integration_account_id: integrationAccountId,
    google_campaign_id: c.googleCampaignId,
    name: c.name,
    status: c.status,
    advertising_channel_type: c.advertisingChannelType,
    // this schema stores budget as a plain numeric (account currency units), not micros
    budget: c.campaignBudgetMicros !== null ? c.campaignBudgetMicros / 1_000_000 : null,
    start_date: c.startDate,
    end_date: c.endDate,
    raw_data: c.raw as never,
  }));

  const idByPlatformId = await upsertChunkedReturningIds(
    'google_campaigns',
    rows,
    'integration_account_id,google_campaign_id',
    'id',
    'google_campaign_id',
  );
  const created = campaigns.filter((c) => !existingIds.has(c.googleCampaignId)).length;
  return { idByPlatformId, counts: { created, updated: campaigns.length - created } };
}

export async function upsertGoogleAdGroups(
  clientId: string,
  integrationAccountId: string,
  adGroups: NormalizedGoogleAdGroup[],
  campaignIdByPlatformId: Map<string, string>,
): Promise<{ idByPlatformId: Map<string, string>; counts: UpsertCounts }> {
  if (adGroups.length === 0) return { idByPlatformId: new Map(), counts: { created: 0, updated: 0 } };

  const existingIds = await fetchAllIds('google_ad_groups', 'google_ad_group_id', integrationAccountId);

  const rows = adGroups
    .map((a) => {
      const campaignId = campaignIdByPlatformId.get(a.googleCampaignId);
      if (!campaignId) return null;
      return {
        client_id: clientId,
        integration_account_id: integrationAccountId,
        google_ad_group_id: a.googleAdGroupId,
        google_campaign_id: a.googleCampaignId,
        campaign_id: campaignId,
        name: a.name,
        status: a.status,
        type: a.type,
        raw_data: a.raw as never,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const idByPlatformId = await upsertChunkedReturningIds(
    'google_ad_groups',
    rows,
    'integration_account_id,google_ad_group_id',
    'id',
    'google_ad_group_id',
  );
  const created = rows.filter((r) => !existingIds.has(r.google_ad_group_id)).length;
  return { idByPlatformId, counts: { created, updated: rows.length - created } };
}

export async function upsertGoogleAds(
  clientId: string,
  integrationAccountId: string,
  ads: NormalizedGoogleAd[],
  adGroupIdByPlatformId: Map<string, string>,
  campaignPlatformIdByAdGroupPlatformId: Map<string, string>,
  campaignIdByPlatformId: Map<string, string>,
): Promise<{ idByPlatformId: Map<string, string>; counts: UpsertCounts }> {
  if (ads.length === 0) return { idByPlatformId: new Map(), counts: { created: 0, updated: 0 } };

  const existingIds = await fetchAllIds('google_ads', 'google_ad_id', integrationAccountId);

  const rows = ads
    .map((a) => {
      const adGroupId = adGroupIdByPlatformId.get(a.googleAdGroupId);
      const campaignPlatformId = campaignPlatformIdByAdGroupPlatformId.get(a.googleAdGroupId);
      const campaignId = campaignPlatformId ? campaignIdByPlatformId.get(campaignPlatformId) : undefined;
      if (!adGroupId || !campaignPlatformId || !campaignId) return null;
      return {
        client_id: clientId,
        integration_account_id: integrationAccountId,
        google_ad_id: a.googleAdId,
        google_campaign_id: campaignPlatformId,
        campaign_id: campaignId,
        google_ad_group_id: a.googleAdGroupId,
        ad_group_id: adGroupId,
        name: a.name,
        status: a.status,
        ad_type: a.adType,
        final_url: a.finalUrls?.[0] ?? null,
        raw_data: a.raw as never,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const idByPlatformId = await upsertChunkedReturningIds('google_ads', rows, 'integration_account_id,google_ad_id', 'id', 'google_ad_id');
  const created = rows.filter((r) => !existingIds.has(r.google_ad_id)).length;
  return { idByPlatformId, counts: { created, updated: rows.length - created } };
}

/** cost_micros / 1,000,000 -> plain numeric `cost`, matching this schema's convention (unlike the speculative design, which kept micros as-is). */
export async function upsertGoogleDailyMetrics(
  clientId: string,
  metrics: NormalizedGoogleDailyMetric[],
  adIdByPlatformId: Map<string, string>,
): Promise<UpsertCounts> {
  const rows = metrics
    .map((m) => {
      const adId = adIdByPlatformId.get(m.googleAdId);
      if (!adId) return null;
      return {
        client_id: clientId,
        google_ad_id: adId,
        date: m.date,
        cost: m.costMicros / 1_000_000,
        impressions: m.impressions,
        clicks: m.clicks,
        conversions: m.conversions,
        conversion_value: m.conversionsValue,
        video_views: 0, // TODO(google): wire up video-campaign metrics if/when this account runs video creatives
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  return upsertWithCounts({
    table: 'google_ad_daily_metrics',
    rows,
    onConflict: 'google_ad_id,date',
    keyColumns: ['google_ad_id', 'date'],
  });
}
