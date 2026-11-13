import { supabaseAdmin } from '../database/supabaseClient.js';

/**
 * Batch-preloaded lookup maps for resolving Meritto's free-text attribution
 * (campaign/ad-set/creative names) to this schema's real foreign keys on
 * `leads`. Loaded once per Meritto sync run rather than per-lead, since a
 * client's campaign/ad/creative catalog is small relative to lead volume -
 * see sync/meritto/merittoSync.ts.
 *
 * A name with no match stays unresolved (the FK is left null) - the raw
 * value is still preserved in leads.raw_data for audit. Never invented.
 */
export interface AttributionMaps {
  courseIdByCode: Map<string, string>;
  /** Reverse of courseIdByCode (id -> normalized code) - lets the sync look up "what course is
   * this lead in" by code after course_id resolution, for the mode-aware fee lookup below. */
  courseCodeById: Map<string, string>;
  /**
   * Fee lookup only - NOT used to resolve a lead's course_id (see resolveCourseId's doc comment).
   * Built from the client's "EA Online"/"EA Offline"/"CPA Online"/"CPA Offline" course rows (code
   * `${BASE}_ONLINE`/`${BASE}_OFFLINE`, status 'inactive' so they never appear as a pickable course
   * - see reportingRepo.ts::getFilterOptions), added 2026-11-13 so EA/CPA revenue can be priced
   * differently by course mode while still rolling up into the one EA/CPA course total.
   */
  modeFeeByCode: Map<string, Map<'ONLINE' | 'OFFLINE', number>>;
  metaCampaignIdByName: Map<string, string>;
  /** Keyed by `${campaign}|${adset}` - see the module doc comment on why adset name alone isn't unique. */
  metaAdSetIdByCompoundKey: Map<string, string>;
  /** Keyed by `${campaign}|${adset}|${adName}` - see the module doc comment on why ad/creative name alone isn't unique. */
  metaAdIdByCompoundKey: Map<string, string>;
  googleCampaignIdByName: Map<string, string>;
  /** Keyed by `${campaign}|${adGroup}` - same reasoning as metaAdSetIdByCompoundKey. */
  googleAdGroupIdByCompoundKey: Map<string, string>;
  /** Keyed by `${campaign}|${adGroup}|${adName}` - same reasoning as metaAdIdByCompoundKey. */
  googleAdIdByCompoundKey: Map<string, string>;
  creativeIdByMetaAdId: Map<string, string>;
  creativeIdByGoogleAdId: Map<string, string>;
}

function norm(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/**
 * `|` -joined, normalized compound key. Ad-set and ad/creative names are reused across many
 * different campaigns/ad-sets by this account's own naming convention (e.g. 18 genuinely
 * different creatives are all literally named "Poster 01", one per campaign+adset) - confirmed
 * live: a bare-name lookup map can only keep the last-loaded id per name, silently merging every
 * other same-named entity's leads onto whichever one happened to load last. The full
 * (campaign, adset, name) triple was confirmed unique account-wide except for one single pair of
 * literally-cloned ads (identical campaign/adset/name at the Meta API level too - unresolvable
 * from lead data alone, since Meritto never sends a platform ad id, only these display names).
 */
function compoundKey(...parts: Array<string | null | undefined>): string {
  return parts.map(norm).join('|');
}

function toNameMap(rows: Array<{ id: string; name: string | null }>): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    if (row.name) map.set(norm(row.name), row.id);
  }
  return map;
}

function toNameById(rows: Array<{ id: string; name: string | null }>): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    if (row.name) map.set(row.id, norm(row.name));
  }
  return map;
}

// These tables are all well under PostgREST's default 1000-row response cap today (meta_ads is
// the largest at ~424), but an unpaginated read here fails *silently* once any of them crosses
// it - new ads/campaigns beyond the cap would just never resolve attribution (falls back to the
// unresolved-FK path, so it fails safe, but silently incomplete). Paginated so this keeps working
// as the account's entity catalog grows, matching the fix applied to metaRepo.ts/googleRepo.ts.
const PAGE_SIZE = 1000;

async function fetchAllRows<
  T extends 'courses' | 'meta_campaigns' | 'meta_adsets' | 'meta_ads' | 'google_campaigns' | 'google_ad_groups' | 'google_ads' | 'creatives' | 'creative_ads',
>(table: T, columns: string, clientId: string): Promise<Record<string, string | null>[]> {
  const rows: Record<string, string | null>[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select(columns)
      .eq('client_id', clientId)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as Record<string, string | null>[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

interface CourseFeeRow {
  id: string;
  code: string | null;
  fee: number | null;
}

/** Separate from fetchAllRows above since `fee` is numeric, not the string-only shape that generic helper assumes. */
async function fetchAllCourseRows(clientId: string): Promise<CourseFeeRow[]> {
  const rows: CourseFeeRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from('courses')
      .select('id, code, fee')
      .eq('client_id', clientId)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as CourseFeeRow[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

/**
 * Parses an Online/Offline fee-reference course's code (e.g. "EA_ONLINE") into its base code and
 * mode, for modeFeeByCode. Returns null for any other code shape (the 3 real courses, or anything
 * else) - this is purely a naming convention for the fee-reference rows, not enforced by schema.
 */
function parseVariantCode(code: string): { base: string; mode: 'ONLINE' | 'OFFLINE' } | null {
  const match = /^(.+)_(ONLINE|OFFLINE)$/.exec(code);
  if (!match) return null;
  return { base: match[1]!, mode: match[2] as 'ONLINE' | 'OFFLINE' };
}

export async function loadAttributionMaps(clientId: string): Promise<AttributionMaps> {
  const [courses, metaCampaigns, metaAdSets, metaAds, googleCampaigns, googleAdGroups, googleAds, creativeAds] = await Promise.all([
    fetchAllCourseRows(clientId),
    fetchAllRows('meta_campaigns', 'id, name', clientId),
    fetchAllRows('meta_adsets', 'id, name, campaign_id', clientId),
    fetchAllRows('meta_ads', 'id, name, campaign_id, adset_id', clientId),
    fetchAllRows('google_campaigns', 'id, name', clientId),
    fetchAllRows('google_ad_groups', 'id, name, campaign_id', clientId),
    fetchAllRows('google_ads', 'id, name, campaign_id, ad_group_id', clientId),
    fetchAllRows('creative_ads', 'creative_id, meta_ad_id, google_ad_id', clientId),
  ]);

  const metaCampaignIdByName = toNameMap(metaCampaigns as Array<{ id: string; name: string | null }>);
  const metaCampaignNameById = toNameById(metaCampaigns as Array<{ id: string; name: string | null }>);

  const metaAdSetIdByCompoundKey = new Map<string, string>();
  const metaAdSetNameById = new Map<string, string>();
  for (const row of metaAdSets as Array<{ id: string; name: string | null; campaign_id: string | null }>) {
    if (!row.name) continue;
    metaAdSetNameById.set(row.id, norm(row.name));
    const campaignName = row.campaign_id ? metaCampaignNameById.get(row.campaign_id) : undefined;
    if (campaignName) metaAdSetIdByCompoundKey.set(compoundKey(campaignName, row.name), row.id);
  }

  const metaAdIdByCompoundKey = new Map<string, string>();
  for (const row of metaAds as Array<{ id: string; name: string | null; campaign_id: string | null; adset_id: string | null }>) {
    if (!row.name) continue;
    const campaignName = row.campaign_id ? metaCampaignNameById.get(row.campaign_id) : undefined;
    const adsetName = row.adset_id ? metaAdSetNameById.get(row.adset_id) : undefined;
    if (campaignName && adsetName) metaAdIdByCompoundKey.set(compoundKey(campaignName, adsetName, row.name), row.id);
  }

  const googleCampaignIdByName = toNameMap(googleCampaigns as Array<{ id: string; name: string | null }>);
  const googleCampaignNameById = toNameById(googleCampaigns as Array<{ id: string; name: string | null }>);

  const googleAdGroupIdByCompoundKey = new Map<string, string>();
  const googleAdGroupNameById = new Map<string, string>();
  for (const row of googleAdGroups as Array<{ id: string; name: string | null; campaign_id: string | null }>) {
    if (!row.name) continue;
    googleAdGroupNameById.set(row.id, norm(row.name));
    const campaignName = row.campaign_id ? googleCampaignNameById.get(row.campaign_id) : undefined;
    if (campaignName) googleAdGroupIdByCompoundKey.set(compoundKey(campaignName, row.name), row.id);
  }

  const googleAdIdByCompoundKey = new Map<string, string>();
  for (const row of googleAds as Array<{ id: string; name: string | null; campaign_id: string | null; ad_group_id: string | null }>) {
    if (!row.name) continue;
    const campaignName = row.campaign_id ? googleCampaignNameById.get(row.campaign_id) : undefined;
    const adGroupName = row.ad_group_id ? googleAdGroupNameById.get(row.ad_group_id) : undefined;
    if (campaignName && adGroupName) googleAdIdByCompoundKey.set(compoundKey(campaignName, adGroupName, row.name), row.id);
  }

  const creativeIdByMetaAdId = new Map<string, string>();
  const creativeIdByGoogleAdId = new Map<string, string>();
  for (const row of creativeAds as Array<{ creative_id: string; meta_ad_id: string | null; google_ad_id: string | null }>) {
    if (row.meta_ad_id) creativeIdByMetaAdId.set(row.meta_ad_id, row.creative_id);
    if (row.google_ad_id) creativeIdByGoogleAdId.set(row.google_ad_id, row.creative_id);
  }

  const validCourses = courses.filter((c): c is CourseFeeRow & { code: string } => typeof c.code === 'string');
  const courseIdByCode = new Map(validCourses.map((c) => [c.code.trim().toUpperCase(), c.id]));
  const courseCodeById = new Map(validCourses.map((c) => [c.id, c.code.trim().toUpperCase()]));

  const modeFeeByCode = new Map<string, Map<'ONLINE' | 'OFFLINE', number>>();
  for (const c of validCourses) {
    if (c.fee === null) continue;
    const variant = parseVariantCode(c.code.trim().toUpperCase());
    if (!variant) continue;
    if (!modeFeeByCode.has(variant.base)) modeFeeByCode.set(variant.base, new Map());
    modeFeeByCode.get(variant.base)!.set(variant.mode, c.fee);
  }

  return {
    courseIdByCode,
    courseCodeById,
    modeFeeByCode,
    metaCampaignIdByName,
    metaAdSetIdByCompoundKey,
    metaAdIdByCompoundKey,
    googleCampaignIdByName,
    googleAdGroupIdByCompoundKey,
    googleAdIdByCompoundKey,
    creativeIdByMetaAdId,
    creativeIdByGoogleAdId,
  };
}

function lookup(map: Map<string, string>, name: string | null): string | null {
  if (!name) return null;
  return map.get(norm(name)) ?? null;
}

export interface ResolvedAttribution {
  courseId: string | null;
  attributionPlatform: 'meta' | 'google' | null;
  metaCampaignId: string | null;
  metaAdSetId: string | null;
  metaAdId: string | null;
  googleCampaignId: string | null;
  googleAdGroupId: string | null;
  googleAdId: string | null;
  creativeId: string | null;
}

/**
 * cf_course_mode is a free-text custom field in Meritto, not a clean dropdown - live-confirmed
 * real values include "Online", "online", "Offline", "Both", "yes", "?????", and blank. Only an
 * unambiguous single mode is usable; "Both"/garbage/blank return null rather than guessing.
 * Exported for sync/meritto/merittoSync.ts's mode-aware fee lookup at enrollment time (see
 * AttributionMaps.modeFeeByCode's doc comment) - course_id resolution itself never uses this
 * (resolveCourseId below is mode-agnostic by design, per the client's 2026-11-13 request to keep
 * Online/Offline leads under the same course total).
 */
export function normalizeCourseMode(courseMode: string | null): 'ONLINE' | 'OFFLINE' | null {
  const mode = (courseMode ?? '').trim().toLowerCase();
  const hasOnline = mode.includes('online');
  const hasOffline = mode.includes('offline');
  if (hasOnline && !hasOffline) return 'ONLINE';
  if (hasOffline && !hasOnline) return 'OFFLINE';
  return null;
}

/**
 * Matches a lead's raw course text against known course codes. Tries an exact match first
 * (cheap, and correct for accounts where the field really is just the bare code), then falls
 * back to a whole-word search within a longer descriptive name - this account's real Meritto
 * data sends "Certified Public Accountant (US CPA)" / "Enrolled Agent (EA)", never the bare
 * code alone, so an exact-match-only lookup left course_id null for every single lead (verified:
 * 0/980 leads had it set). Word-boundary regex, not a plain substring check, so a short code
 * like "EA" can't false-positive match inside an unrelated longer word.
 */
function resolveCourseId(courseIdByCode: Map<string, string>, productCode: string | null): string | null {
  if (!productCode) return null;
  const normalized = productCode.trim().toUpperCase();
  if (!normalized) return null;

  const exact = courseIdByCode.get(normalized);
  if (exact) return exact;

  for (const [code, id] of courseIdByCode) {
    const pattern = new RegExp(`\\b${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    if (pattern.test(normalized)) return id;
  }
  return null;
}

/**
 * Resolves a normalized Meritto lead's free-text attribution against the
 * preloaded maps. Respects the `leads_attribution_chk` constraint: only the
 * FK columns for the detected platform are ever populated, never both.
 *
 * Ad-set, ad, and creative resolution all key off the full (campaign, adset[, adName]) chain
 * rather than a bare name - see AttributionMaps' doc comments. Campaign names are already unique
 * account-wide (confirmed), so those stay a plain name lookup.
 */
export function resolveAttribution(
  maps: AttributionMaps,
  input: { productCode: string | null; source: string | null; campaign: string | null; adSet: string | null; creative: string | null },
): ResolvedAttribution {
  // "National EA Program" is a distinct lead-gen funnel (source "National EA Webhinar"), not a
  // distinct value of Meritto's own `course` field - that field still just says "Enrolled Agent
  // (EA)" for these leads, same as regular EA leads, so it can't be told apart by productCode
  // alone. Source is the only real signal; checked before the generic productCode match below.
  // Falls through to that generic match if this account doesn't have a NATIONAL_EA course configured.
  const courseId =
    (input.source ?? '').toLowerCase().includes('national ea') && maps.courseIdByCode.has('NATIONAL_EA')
      ? maps.courseIdByCode.get('NATIONAL_EA')!
      : resolveCourseId(maps.courseIdByCode, input.productCode);

  const sourceLower = (input.source ?? '').toLowerCase();
  const isMeta = sourceLower.includes('meta') || sourceLower.includes('facebook') || sourceLower.includes('instagram');
  const isGoogle = sourceLower.includes('google');

  if (isMeta) {
    const metaAdSetId = maps.metaAdSetIdByCompoundKey.get(compoundKey(input.campaign, input.adSet)) ?? null;
    const metaAdId = maps.metaAdIdByCompoundKey.get(compoundKey(input.campaign, input.adSet, input.creative)) ?? null;
    return {
      courseId,
      attributionPlatform: 'meta',
      metaCampaignId: lookup(maps.metaCampaignIdByName, input.campaign),
      metaAdSetId,
      metaAdId,
      googleCampaignId: null,
      googleAdGroupId: null,
      googleAdId: null,
      creativeId: metaAdId ? (maps.creativeIdByMetaAdId.get(metaAdId) ?? null) : null,
    };
  }

  if (isGoogle) {
    const googleAdGroupId = maps.googleAdGroupIdByCompoundKey.get(compoundKey(input.campaign, input.adSet)) ?? null;
    const googleAdId = maps.googleAdIdByCompoundKey.get(compoundKey(input.campaign, input.adSet, input.creative)) ?? null;
    return {
      courseId,
      attributionPlatform: 'google',
      metaCampaignId: null,
      metaAdSetId: null,
      metaAdId: null,
      googleCampaignId: lookup(maps.googleCampaignIdByName, input.campaign),
      googleAdGroupId,
      googleAdId,
      creativeId: googleAdId ? (maps.creativeIdByGoogleAdId.get(googleAdId) ?? null) : null,
    };
  }

  return {
    courseId,
    attributionPlatform: null,
    metaCampaignId: null,
    metaAdSetId: null,
    metaAdId: null,
    googleCampaignId: null,
    googleAdGroupId: null,
    googleAdId: null,
    creativeId: null,
  };
}
