import { env } from '../../config/env.js';
import { httpJson } from '../../utils/httpClient.js';
import { paginateAllStream, type Page } from '../../utils/pagination.js';
import { PAGE_SIZE } from '../../config/constants.js';
import type {
  MetaAd,
  MetaAdCreative,
  MetaAdSet,
  MetaCampaign,
  MetaInsightsRow,
  MetaListResponse,
} from '../../types/meta.js';

const GRAPH_BASE = `https://graph.facebook.com/${env.META_GRAPH_API_VERSION}`;

async function fetchGraphPage<T>(
  path: string,
  accessToken: string,
  fields: string,
  cursor: string | null,
  extraQuery: Record<string, string | number | undefined> = {},
  retry?: Parameters<typeof httpJson>[1]['retry'],
): Promise<Page<T, string>> {
  const response = await httpJson<MetaListResponse<T>>(`${GRAPH_BASE}${path}`, {
    method: 'GET',
    label: `meta.get${path}`,
    query: {
      access_token: accessToken,
      fields,
      limit: PAGE_SIZE.meta,
      ...(cursor ? { after: cursor } : {}),
      ...extraQuery,
    },
    ...(retry ? { retry } : {}),
  });

  return { items: response.data, nextCursor: response.paging?.cursors?.after ?? null };
}

/**
 * /insights hits Meta's app-level rate limit ("Application request limit reached", see
 * httpClient.ts's is_transient handling) far more easily than the entity endpoints - live-tested,
 * the default retry (500ms-30s over 5 attempts, ~7.5s total backoff) isn't enough room for an
 * app-level throttle Meta's own docs say to back off from. Longer, fewer attempts instead.
 */
const INSIGHTS_RETRY = { maxAttempts: 6, minTimeoutMs: 5_000, maxTimeoutMs: 60_000, factor: 2 };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MetaClient {
  constructor(private readonly accessToken: string, private readonly adAccountId: string) {}

  async *streamCampaigns(): AsyncGenerator<MetaCampaign[]> {
    const fields = 'id,name,objective,status,daily_budget,lifetime_budget,start_time,stop_time,updated_time';
    yield* paginateAllStream<MetaCampaign, string>((cursor) =>
      fetchGraphPage<MetaCampaign>(`/${this.adAccountId}/campaigns`, this.accessToken, fields, cursor),
    );
  }

  async *streamAdSets(): AsyncGenerator<MetaAdSet[]> {
    const fields = 'id,campaign_id,name,status,optimization_goal,billing_event,daily_budget,lifetime_budget,updated_time';
    yield* paginateAllStream<MetaAdSet, string>((cursor) =>
      fetchGraphPage<MetaAdSet>(`/${this.adAccountId}/adsets`, this.accessToken, fields, cursor),
    );
  }

  async *streamAds(): AsyncGenerator<MetaAd[]> {
    const fields = 'id,adset_id,name,status,creative{id},updated_time';
    yield* paginateAllStream<MetaAd, string>((cursor) =>
      fetchGraphPage<MetaAd>(`/${this.adAccountId}/ads`, this.accessToken, fields, cursor),
    );
  }

  /**
   * Creatives are fetched separately (batched by id) rather than as a connection - Meta does not
   * expose an ad-account-level creatives edge with full detail in one call. This account's real
   * ad volume (400+) means several dozen 50-id batches, all hitting the same app-level rate
   * limit as /insights (see httpClient.ts's is_transient handling and INSIGHTS_RETRY above) -
   * same generous retry, plus a pacing delay between batches so the run doesn't trip it on its
   * own the way the unpaced version of this loop would.
   */
  async fetchCreativesByIds(creativeIds: string[]): Promise<MetaAdCreative[]> {
    if (creativeIds.length === 0) return [];
    // object_story_spec{...child_attachments} and asset_feed_spec{images} cost nothing extra
    // here (same request, two more nested fields) and are how carousel ads and Dynamic Creative
    // (DCO) ads - a real, non-trivial chunk of this account's static "image_url: null" creatives
    // - expose their images instead of the plain image_url field. Both use the same image_hash
    // shape, resolved to a real URL via fetchImageUrlsByHashes below.
    const fields =
      'id,name,title,body,thumbnail_url,image_url,video_id,object_type,call_to_action_type,object_story_spec{link_data{child_attachments{image_hash}}},asset_feed_spec{images,videos}';

    // Graph API batch limit is 50 ids per call to a single edge via `ids=`.
    const chunks: string[][] = [];
    for (let i = 0; i < creativeIds.length; i += 50) chunks.push(creativeIds.slice(i, i + 50));

    const results: MetaAdCreative[] = [];
    let firstChunk = true;
    for (const chunk of chunks) {
      if (!firstChunk) await sleep(2_000);
      firstChunk = false;

      const response = await httpJson<Record<string, MetaAdCreative>>(`${GRAPH_BASE}/`, {
        method: 'GET',
        label: 'meta.creatives.batch',
        query: { access_token: this.accessToken, ids: chunk.join(','), fields },
        retry: INSIGHTS_RETRY,
      });
      results.push(...Object.values(response));
    }
    return results;
  }

  /**
   * A video ad's AdCreative.image_url is null (just a static thumbnail exists via
   * thumbnail_url) - the actual playable file lives on the separate Video node, keyed by the
   * creative's video_id. Same batching/pacing/retry shape as fetchCreativesByIds, since it hits
   * the same app-level rate limit.
   *
   * Live-tested against this account: every ad video here is Reels-format, and Meta's Graph API
   * simply omits the `source` field for those at this token's permission level (not an error,
   * not rate limiting - the field is just absent from a 200 response) - a real platform
   * restriction, not something retries or more scopes on this token fix. `permalink_url` is
   * still returned though, so falls back to Facebook's public video-embed plugin (an iframe to
   * facebook.com/plugins/video.php) for real playback via Facebook's own player instead of a
   * raw <video> tag. Returns only ids that resolved one way or the other - callers should keep
   * the thumbnail as a further fallback rather than treat a missing entry as an error.
   */
  async fetchVideoSources(videoIds: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (videoIds.length === 0) return map;

    const chunks: string[][] = [];
    for (let i = 0; i < videoIds.length; i += 50) chunks.push(videoIds.slice(i, i + 50));

    let firstChunk = true;
    for (const chunk of chunks) {
      if (!firstChunk) await sleep(2_000);
      firstChunk = false;

      const response = await httpJson<Record<string, { id: string; source?: string; permalink_url?: string }>>(`${GRAPH_BASE}/`, {
        method: 'GET',
        label: 'meta.videos.batch',
        query: { access_token: this.accessToken, ids: chunk.join(','), fields: 'id,source,permalink_url' },
        retry: INSIGHTS_RETRY,
      });
      for (const video of Object.values(response)) {
        if (video.source) {
          map.set(video.id, video.source);
        } else if (video.permalink_url) {
          const fullPermalink = `https://www.facebook.com${video.permalink_url}`;
          map.set(video.id, `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(fullPermalink)}&show_text=false`);
        }
      }
    }
    return map;
  }

  /**
   * Carousel child_attachments and Dynamic Creative asset_feed_spec.images only carry an
   * image_hash (a reference into the ad account's image library), not a usable URL - resolved
   * here via the account's /adimages edge, which takes a JSON-encoded array of hashes (not
   * comma-separated ids like the other batch endpoints) and returns each hash's real `url`.
   *
   * Live-tested at this account's real scale (~260 unique hashes, 6 chunks): unlike the other
   * rate-limited endpoints here, this one doesn't fail loudly (no 403/is_transient) when
   * throttled - it returns a normal HTTP 200 with some hashes simply missing from `data`, so the
   * generic retry-on-error path never even engages. Confirmed by re-resolving the exact same
   * hashes moments later in isolation, which succeeded - this is a request-volume throttle
   * specific to this endpoint, not permanently-unresolvable hashes. Handled with a slower base
   * pace plus an explicit "whatever's still missing after a pass, wait longer and retry just
   * those" loop, since silence isn't an error `withRetry` can react to on its own. Live-tested a
   * single extra pass wasn't always enough (262 hashes: pass 1 resolved 137, pass 2 resolved 75
   * more, some still needed a 3rd) - looping until stable (or a hard cap) instead of a fixed
   * one-shot retry.
   */
  async fetchImageUrlsByHashes(hashes: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (hashes.length === 0) return map;

    let pending = hashes;
    for (let round = 1; pending.length > 0 && round <= 5; round++) {
      if (round > 1) await sleep(15_000);
      const before = pending.length;
      await this.resolveImageHashesInto(map, pending, 5_000);
      pending = pending.filter((h) => !map.has(h));
      // No progress this round - the rest are genuinely unresolvable (e.g. a deleted image),
      // not throttled, so more rounds would just burn time waiting on a rate limit that isn't
      // actually the problem for what's left.
      if (pending.length === before) break;
    }

    return map;
  }

  private async resolveImageHashesInto(map: Map<string, string>, hashes: string[], chunkDelayMs: number): Promise<void> {
    const chunks: string[][] = [];
    for (let i = 0; i < hashes.length; i += 50) chunks.push(hashes.slice(i, i + 50));

    let firstChunk = true;
    for (const chunk of chunks) {
      if (!firstChunk) await sleep(chunkDelayMs);
      firstChunk = false;

      const response = await httpJson<{ data: Array<{ hash: string; url?: string }> }>(`${GRAPH_BASE}/${this.adAccountId}/adimages`, {
        method: 'GET',
        label: 'meta.adimages.batch',
        query: { access_token: this.accessToken, hashes: JSON.stringify(chunk), fields: 'hash,url' },
        retry: INSIGHTS_RETRY,
      });
      for (const image of response.data ?? []) {
        if (image.url) map.set(image.hash, image.url);
      }
    }
  }

  /**
   * Daily insights, one row per ad per day (time_increment=1). `datePreset`
   * or explicit since/until drives the sync window - the sync orchestrator
   * passes an explicit range so incremental syncs and backfills share this
   * one code path.
   */
  async *streamDailyInsights(sinceDate: string, untilDate: string): AsyncGenerator<MetaInsightsRow[]> {
    const fields = 'ad_id,date_start,date_stop,impressions,clicks,spend,reach,frequency,actions';
    yield* paginateAllStream<MetaInsightsRow, string>((cursor) =>
      fetchGraphPage<MetaInsightsRow>(
        `/${this.adAccountId}/insights`,
        this.accessToken,
        fields,
        cursor,
        {
          level: 'ad',
          time_increment: 1,
          time_range: JSON.stringify({ since: sinceDate, until: untilDate }),
        },
        INSIGHTS_RETRY,
      ),
    );
  }
}
