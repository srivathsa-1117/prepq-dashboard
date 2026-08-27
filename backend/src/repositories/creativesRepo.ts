import { supabaseAdmin } from '../database/supabaseClient.js';
import { withRetry } from '../utils/retry.js';

const STATUS_MAP: Record<string, string> = {
  ACTIVE: 'active',
  ENABLED: 'active',
  PAUSED: 'paused',
  ARCHIVED: 'archived',
  REMOVED: 'archived',
  DELETED: 'archived',
};

function mapAdStatus(raw: string | null): string {
  if (!raw) return 'active';
  return STATUS_MAP[raw.toUpperCase()] ?? 'active';
}

export interface AdForCreativeSync {
  /** Internal meta_ads.id or google_ads.id (not the platform's raw ad id). */
  id: string;
  name: string | null;
  status: string | null;
  /** Real creative asset preview, when available (Meta only - fetched via MetaClient.fetchCreativesByIds). Google's search ads here are text-only, so this stays null for them. */
  thumbnailUrl?: string | null;
  assetUrl?: string | null;
  /** Resolved carousel card image URLs, in order - empty/undefined for non-carousel creatives (the vast majority). */
  carouselImages?: string[] | null;
}

/**
 * V1 simplification: one `creatives` catalog row per real ad, not grouped by Meta's reusable
 * physical creative_id (an asset can be reused across multiple ads/ad sets - future improvement).
 * This app has no creative-curation UI or API anywhere (no POST/PATCH /creatives route exists) -
 * `creatives`/`creative_ads` were previously only ever populated by hand-seeded fake data, which
 * is why the Creatives page showed nothing real. concept/hook/angle/description are intentionally
 * left null rather than guessed from the ad name - never invented, same principle as
 * attributionLookupRepo.ts's name-matching.
 *
 * Idempotent via `creative_ads`, the only place a platform ad id is actually linked to a
 * creative (the `creatives` table itself has no external-id column) - an ad already linked gets
 * its creative's name/status refreshed in place; a new ad gets a new creatives + creative_ads
 * row pair.
 */
export async function syncCreativesForAds(clientId: string, platform: 'meta' | 'google', ads: AdForCreativeSync[]): Promise<void> {
  if (ads.length === 0) return;

  // Runs at the tail end of a long provider sync (many minutes of provider-API traffic with
  // zero Supabase calls in between) - same stale-keep-alive-connection risk documented on
  // syncRunsRepo.ts's completeSyncRun, so the whole thing gets the same retry wrapper.
  await withRetry(() => syncCreativesForAdsOnce(clientId, platform, ads));
}

async function syncCreativesForAdsOnce(clientId: string, platform: 'meta' | 'google', ads: AdForCreativeSync[]): Promise<void> {
  const platformCol = platform === 'meta' ? 'meta_ad_id' : 'google_ad_id';

  // Chunked, not one .in() with every ad id at once: live-tested, a single query with ~400+
  // UUIDs (Meta's real ad volume) builds a URL long enough to fail at the connection level
  // ("fetch failed", not a clean HTTP error) - reproduced consistently across fresh processes,
  // so it's a real request-size limit, not the transient network blips seen elsewhere in this
  // codebase. Google's ~30 ads never hit this, which is why it worked first try.
  const CHUNK_SIZE = 100;
  const adIds = ads.map((a) => a.id);
  const existingLinks: Array<Record<string, unknown>> = [];
  for (let i = 0; i < adIds.length; i += CHUNK_SIZE) {
    const chunk = adIds.slice(i, i + CHUNK_SIZE);
    const { data, error: linksErr } = await supabaseAdmin
      .from('creative_ads')
      .select(`${platformCol}, creative_id`)
      .eq('client_id', clientId)
      .eq('platform', platform)
      .in(platformCol, chunk);
    if (linksErr) throw linksErr;
    existingLinks.push(...(data ?? []));
  }

  const creativeIdByAdId = new Map(existingLinks.map((l) => [l[platformCol] as string, l.creative_id as string]));

  const toUpdate: Array<{ id: string; name: string; status: string; thumbnailUrl: string | null; assetUrl: string | null; carouselImages: string[] | null }> = [];
  const toCreate: AdForCreativeSync[] = [];
  for (const ad of ads) {
    const existingCreativeId = creativeIdByAdId.get(ad.id);
    if (existingCreativeId) {
      toUpdate.push({
        id: existingCreativeId,
        name: ad.name ?? '(untitled)',
        status: mapAdStatus(ad.status),
        thumbnailUrl: ad.thumbnailUrl ?? null,
        assetUrl: ad.assetUrl ?? null,
        carouselImages: ad.carouselImages && ad.carouselImages.length > 0 ? ad.carouselImages : null,
      });
    } else {
      toCreate.push(ad);
    }
  }

  if (toUpdate.length > 0) {
    const { error } = await supabaseAdmin
      .from('creatives')
      .upsert(
        toUpdate.map((u) => ({
          id: u.id,
          client_id: clientId,
          name: u.name,
          status: u.status,
          thumbnail_url: u.thumbnailUrl,
          asset_url: u.assetUrl,
          carousel_images: u.carouselImages as never,
        })),
        { onConflict: 'id' },
      );
    if (error) throw error;
  }

  if (toCreate.length > 0) {
    // Positional match between `created` and `toCreate` (a single INSERT...VALUES...RETURNING
    // preserves input order in Postgres/PostgREST) - `creatives` has no external-id column to
    // match on by content instead.
    const { data: created, error: createErr } = await supabaseAdmin
      .from('creatives')
      .insert(
        toCreate.map((a) => ({
          client_id: clientId,
          name: a.name ?? '(untitled)',
          status: mapAdStatus(a.status),
          thumbnail_url: a.thumbnailUrl ?? null,
          asset_url: a.assetUrl ?? null,
          carousel_images: (a.carouselImages && a.carouselImages.length > 0 ? a.carouselImages : null) as never,
        })),
      )
      .select('id');
    if (createErr) throw createErr;
    if (!created || created.length !== toCreate.length) {
      throw new Error('syncCreativesForAds: creatives insert did not return one row per input ad');
    }

    const links = toCreate.map((a, i) => ({
      client_id: clientId,
      creative_id: created[i]!.id,
      platform,
      meta_ad_id: platform === 'meta' ? a.id : null,
      google_ad_id: platform === 'google' ? a.id : null,
    }));
    const { error: linkErr } = await supabaseAdmin.from('creative_ads').insert(links);
    if (linkErr) throw linkErr;
  }
}
