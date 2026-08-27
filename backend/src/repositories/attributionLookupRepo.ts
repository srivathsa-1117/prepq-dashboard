import { supabaseAdmin } from '../database/supabaseClient.js';

/**
 * Batch-preloaded name -> uuid lookup maps for resolving Meritto's free-text
 * attribution (campaign/ad-set/creative names, UTM values) to this schema's
 * real foreign keys on `leads`. Loaded once per Meritto sync run rather than
 * per-lead, since a client's campaign/ad/creative catalog is small relative
 * to lead volume - see sync/meritto/merittoSync.ts.
 *
 * A name with no match stays unresolved (the FK is left null) - the raw
 * value is still preserved in leads.raw_data for audit. Never invented.
 */
export interface AttributionMaps {
  courseIdByCode: Map<string, string>;
  metaCampaignIdByName: Map<string, string>;
  metaAdSetIdByName: Map<string, string>;
  metaAdIdByName: Map<string, string>;
  googleCampaignIdByName: Map<string, string>;
  googleAdGroupIdByName: Map<string, string>;
  googleAdIdByName: Map<string, string>;
  creativeIdByName: Map<string, string>;
}

function toNameMap(rows: Array<{ id: string; name: string | null }>): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    if (row.name) map.set(row.name.trim().toLowerCase(), row.id);
  }
  return map;
}

// These tables are all well under PostgREST's default 1000-row response cap today (meta_ads is
// the largest at ~424), but an unpaginated read here fails *silently* once any of them crosses
// it - new ads/campaigns beyond the cap would just never resolve attribution (falls back to the
// unresolved-FK path, so it fails safe, but silently incomplete). Paginated so this keeps working
// as the account's entity catalog grows, matching the fix applied to metaRepo.ts/googleRepo.ts.
const PAGE_SIZE = 1000;

async function fetchAllRows<T extends 'courses' | 'meta_campaigns' | 'meta_adsets' | 'meta_ads' | 'google_campaigns' | 'google_ad_groups' | 'google_ads' | 'creatives'>(
  table: T,
  columns: string,
  clientId: string,
): Promise<Record<string, string | null>[]> {
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

export async function loadAttributionMaps(clientId: string): Promise<AttributionMaps> {
  const [courses, metaCampaigns, metaAdSets, metaAds, googleCampaigns, googleAdGroups, googleAds, creatives] = await Promise.all([
    fetchAllRows('courses', 'id, code', clientId),
    fetchAllRows('meta_campaigns', 'id, name', clientId),
    fetchAllRows('meta_adsets', 'id, name', clientId),
    fetchAllRows('meta_ads', 'id, name', clientId),
    fetchAllRows('google_campaigns', 'id, name', clientId),
    fetchAllRows('google_ad_groups', 'id, name', clientId),
    fetchAllRows('google_ads', 'id, name', clientId),
    fetchAllRows('creatives', 'id, name', clientId),
  ]);

  return {
    courseIdByCode: new Map(
      courses.filter((c): c is { id: string; code: string } => typeof c.code === 'string').map((c) => [c.code.trim().toUpperCase(), c.id]),
    ),
    metaCampaignIdByName: toNameMap(metaCampaigns as Array<{ id: string; name: string | null }>),
    metaAdSetIdByName: toNameMap(metaAdSets as Array<{ id: string; name: string | null }>),
    metaAdIdByName: toNameMap(metaAds as Array<{ id: string; name: string | null }>),
    googleCampaignIdByName: toNameMap(googleCampaigns as Array<{ id: string; name: string | null }>),
    googleAdGroupIdByName: toNameMap(googleAdGroups as Array<{ id: string; name: string | null }>),
    googleAdIdByName: toNameMap(googleAds as Array<{ id: string; name: string | null }>),
    creativeIdByName: toNameMap(creatives as Array<{ id: string; name: string | null }>),
  };
}

function lookup(map: Map<string, string>, name: string | null): string | null {
  if (!name) return null;
  return map.get(name.trim().toLowerCase()) ?? null;
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
 * Resolves a normalized Meritto lead's free-text attribution against the
 * preloaded maps. Respects the `leads_attribution_chk` constraint: only the
 * FK columns for the detected platform are ever populated, never both.
 */
export function resolveAttribution(
  maps: AttributionMaps,
  input: { productCode: string | null; source: string | null; campaign: string | null; adSet: string | null; creative: string | null },
): ResolvedAttribution {
  const courseId = input.productCode ? (maps.courseIdByCode.get(input.productCode.trim().toUpperCase()) ?? null) : null;
  const creativeId = lookup(maps.creativeIdByName, input.creative);

  const sourceLower = (input.source ?? '').toLowerCase();
  const isMeta = sourceLower.includes('meta') || sourceLower.includes('facebook') || sourceLower.includes('instagram');
  const isGoogle = sourceLower.includes('google');

  if (isMeta) {
    return {
      courseId,
      attributionPlatform: 'meta',
      metaCampaignId: lookup(maps.metaCampaignIdByName, input.campaign),
      metaAdSetId: lookup(maps.metaAdSetIdByName, input.adSet),
      metaAdId: lookup(maps.metaAdIdByName, input.creative),
      googleCampaignId: null,
      googleAdGroupId: null,
      googleAdId: null,
      creativeId,
    };
  }

  if (isGoogle) {
    return {
      courseId,
      attributionPlatform: 'google',
      metaCampaignId: null,
      metaAdSetId: null,
      metaAdId: null,
      googleCampaignId: lookup(maps.googleCampaignIdByName, input.campaign),
      googleAdGroupId: lookup(maps.googleAdGroupIdByName, input.adSet),
      googleAdId: lookup(maps.googleAdIdByName, input.creative),
      creativeId,
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
    creativeId,
  };
}
