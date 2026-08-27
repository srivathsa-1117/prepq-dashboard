import { supabaseAdmin } from '../database/supabaseClient.js';
import { upsertWithCounts, type UpsertCounts } from '../utils/upsertHelper.js';
import type { NormalizedMetaAd, NormalizedMetaAdSet, NormalizedMetaCampaign, NormalizedMetaDailyMetric } from '../types/meta.js';

// PostgREST caps both plain reads and the `data` returned by `.upsert().select()` at 1000 rows
// per call - silent truncation, no error. Below this size, this account's entity tables (meta_ads
// etc.) are safe today but will silently start dropping FK-map entries (and therefore whole
// days of metrics, via the `if (!adId) return null` filters below) once they cross it. Same bug
// class as reportingRepo.ts::getSpendInRange, fixed the same way: explicit paged reads, and
// upserts chunked so no single `.select()` response can exceed the cap.
const PAGE_SIZE = 1000;

async function fetchAllIds<K extends string>(table: 'meta_campaigns' | 'meta_adsets' | 'meta_ads', column: K, integrationAccountId: string): Promise<Set<string>> {
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
  table: 'meta_campaigns' | 'meta_adsets' | 'meta_ads',
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

/**
 * Upserts campaigns and returns a platform-id -> internal-uuid map so the
 * ad-set upsert can resolve its campaign_id foreign key. Identity is scoped
 * by integration_account_id (one Meta ad account), not client_id directly -
 * see unique constraint meta_campaigns_integration_account_id_meta_campaign_id_key.
 */
export async function upsertMetaCampaigns(
  clientId: string,
  integrationAccountId: string,
  campaigns: NormalizedMetaCampaign[],
): Promise<{ idByPlatformId: Map<string, string>; counts: UpsertCounts }> {
  if (campaigns.length === 0) return { idByPlatformId: new Map(), counts: { created: 0, updated: 0 } };

  const existingIds = await fetchAllIds('meta_campaigns', 'meta_campaign_id', integrationAccountId);

  const rows = campaigns.map((c) => ({
    client_id: clientId,
    integration_account_id: integrationAccountId,
    meta_campaign_id: c.metaCampaignId,
    name: c.name,
    status: c.status,
    objective: c.objective,
    start_time: c.startTime,
    stop_time: c.stopTime,
    raw_data: c.raw as never,
  }));

  const idByPlatformId = await upsertChunkedReturningIds(
    'meta_campaigns',
    rows,
    'integration_account_id,meta_campaign_id',
    'id',
    'meta_campaign_id',
  );
  const created = campaigns.filter((c) => !existingIds.has(c.metaCampaignId)).length;

  return { idByPlatformId, counts: { created, updated: campaigns.length - created } };
}

export async function upsertMetaAdSets(
  clientId: string,
  integrationAccountId: string,
  adSets: NormalizedMetaAdSet[],
  campaignIdByPlatformId: Map<string, string>,
): Promise<{ idByPlatformId: Map<string, string>; counts: UpsertCounts }> {
  if (adSets.length === 0) return { idByPlatformId: new Map(), counts: { created: 0, updated: 0 } };

  const existingIds = await fetchAllIds('meta_adsets', 'meta_adset_id', integrationAccountId);

  const rows = adSets
    .map((a) => {
      const campaignId = campaignIdByPlatformId.get(a.metaCampaignId);
      if (!campaignId) return null; // campaign wasn't in this sync batch (shouldn't happen, campaigns sync first)
      return {
        client_id: clientId,
        integration_account_id: integrationAccountId,
        meta_adset_id: a.metaAdsetId,
        meta_campaign_id: a.metaCampaignId,
        campaign_id: campaignId,
        name: a.name,
        status: a.status,
        optimization_goal: a.optimizationGoal,
        billing_event: a.billingEvent,
        daily_budget: a.dailyBudget,
        lifetime_budget: a.lifetimeBudget,
        raw_data: a.raw as never,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const idByPlatformId = await upsertChunkedReturningIds(
    'meta_adsets',
    rows,
    'integration_account_id,meta_adset_id',
    'id',
    'meta_adset_id',
  );
  const created = rows.filter((r) => !existingIds.has(r.meta_adset_id)).length;

  return { idByPlatformId, counts: { created, updated: rows.length - created } };
}

/**
 * Note: this schema does not have a per-Meta-account creatives table - the
 * ad row just carries the platform's raw creative_id string (see
 * NormalizedMetaAd). Linking an ad to this backend's own `creatives` catalog
 * (concept/hook/angle, used for creative-performance reporting) happens via
 * the `creative_ads` join table, populated by the creative-management side
 * of the product, not by this sync - see ARCHITECTURE.md.
 */
export async function upsertMetaAds(
  clientId: string,
  integrationAccountId: string,
  ads: NormalizedMetaAd[],
  adSetIdByPlatformId: Map<string, string>,
  campaignPlatformIdByAdSetPlatformId: Map<string, string>,
  campaignIdByPlatformId: Map<string, string>,
): Promise<{ idByPlatformId: Map<string, string>; counts: UpsertCounts }> {
  if (ads.length === 0) return { idByPlatformId: new Map(), counts: { created: 0, updated: 0 } };

  const existingIds = await fetchAllIds('meta_ads', 'meta_ad_id', integrationAccountId);

  const rows = ads
    .map((a) => {
      const adSetId = adSetIdByPlatformId.get(a.metaAdsetId);
      const campaignPlatformId = campaignPlatformIdByAdSetPlatformId.get(a.metaAdsetId);
      // campaign_id is the internal FK the reporting SQL joins on (fn_campaign_performance_range
      // etc.) - meta_campaign_id alone (the platform string id) isn't enough. Live-tested: leaving
      // this unset (as this used to) collapsed every Meta campaign into a single "(unknown)"
      // row in the Campaigns page, since the join had nothing to match on. Same bug class as
      // googleRepo.ts::upsertGoogleAds, fixed earlier the same way.
      const campaignId = campaignPlatformId ? campaignIdByPlatformId.get(campaignPlatformId) : undefined;
      if (!adSetId || !campaignPlatformId || !campaignId) return null;
      return {
        client_id: clientId,
        integration_account_id: integrationAccountId,
        meta_ad_id: a.metaAdId,
        meta_campaign_id: campaignPlatformId,
        campaign_id: campaignId,
        meta_adset_id: a.metaAdsetId,
        adset_id: adSetId,
        creative_id: a.metaCreativeId,
        name: a.name,
        status: a.status,
        raw_data: a.raw as never,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const idByPlatformId = await upsertChunkedReturningIds('meta_ads', rows, 'integration_account_id,meta_ad_id', 'id', 'meta_ad_id');
  const created = rows.filter((r) => !existingIds.has(r.meta_ad_id)).length;

  return { idByPlatformId, counts: { created, updated: rows.length - created } };
}

/**
 * meta_ad_daily_metrics has no `leads`/`actions`/`raw` columns in this
 * schema (spend/impressions/reach/clicks/link_clicks/video_* only) - lead
 * counts come from Meritto, not from Meta's on-platform action counts, so
 * dropping them here is not a loss of the data this backend actually needs.
 * TODO(meta): video_views/video_25/50/75/100 are written as 0 - wiring up
 * video engagement requires requesting video_play_actions /
 * video_pN_watched_actions fields from the Insights API and isn't done yet.
 */
export async function upsertMetaDailyMetrics(
  clientId: string,
  metrics: NormalizedMetaDailyMetric[],
  adIdByPlatformId: Map<string, string>,
): Promise<UpsertCounts> {
  const rows = metrics
    .map((m) => {
      const adId = adIdByPlatformId.get(m.metaAdId);
      if (!adId) return null;
      return {
        client_id: clientId,
        meta_ad_id: adId,
        date: m.date,
        spend: m.spend,
        impressions: m.impressions,
        reach: m.reach ?? 0,
        clicks: m.clicks,
        link_clicks: m.clicks,
        video_views: 0,
        video_25: 0,
        video_50: 0,
        video_75: 0,
        video_100: 0,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  return upsertWithCounts({
    table: 'meta_ad_daily_metrics',
    rows,
    onConflict: 'meta_ad_id,date',
    keyColumns: ['meta_ad_id', 'date'],
  });
}

/** Fetches the full platform-id -> uuid map for ads in an account (used when a metrics-only incremental sync doesn't re-sync entities). */
export async function getMetaAdIdMap(integrationAccountId: string): Promise<Map<string, string>> {
  const idByPlatformId = new Map<string, string>();
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from('meta_ads')
      .select('id, meta_ad_id')
      .eq('integration_account_id', integrationAccountId)
      .order('meta_ad_id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    for (const row of data ?? []) idByPlatformId.set(row.meta_ad_id, row.id);
    if (!data || data.length < PAGE_SIZE) break;
  }
  return idByPlatformId;
}
