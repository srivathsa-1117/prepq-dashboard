import { getDecryptedCredentials, updateIntegrationStatus, refreshIntegrationCredentials } from '../../repositories/integrationsRepo.js';
import { upsertMetaCampaigns, upsertMetaAdSets, upsertMetaAds, upsertMetaDailyMetrics } from '../../repositories/metaRepo.js';
import { syncCreativesForAds } from '../../repositories/creativesRepo.js';
import { MetaClient } from '../../integrations/meta/metaClient.js';
import { extendToLongLivedToken, type MetaCredentials } from '../../integrations/meta/metaAuth.js';
import { transformAd, transformAdSet, transformCampaign, transformCreative, transformDailyMetric } from '../../integrations/meta/metaTransform.js';
import { runTrackedSync } from '../syncRunTracker.js';
import { DEFAULT_LOOKBACK_DAYS } from '../../config/constants.js';
import { todayInTimezone } from '../../utils/dateRanges.js';
import { IntegrationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import type { SyncJobParams } from '../../types/sync.js';
import type { MetaAd, MetaAdSet, MetaCampaign } from '../../types/meta.js';

interface MetaStoredCredentials extends MetaCredentials {
  adAccountId: string;
}

/** Re-extends the long-lived token if it expires within 7 days, so a scheduled morning sync never hits an expired token mid-run. */
async function ensureFreshToken(clientId: string, creds: MetaStoredCredentials): Promise<MetaStoredCredentials> {
  if (!creds.expiresAt) return creds;

  const expiresInMs = new Date(creds.expiresAt).getTime() - Date.now();
  if (expiresInMs > 7 * 24 * 60 * 60 * 1000) return creds;

  logger.info({ clientId }, 'Meta token nearing expiry, extending');
  const extended = await extendToLongLivedToken(creds.accessToken);
  await refreshIntegrationCredentials(
    clientId,
    'meta',
    { accessToken: extended.accessToken, expiresAt: extended.expiresAt, adAccountId: creds.adAccountId },
    extended.expiresAt,
  );
  return { ...extended, adAccountId: creds.adAccountId };
}

export async function syncMetaForClient(params: SyncJobParams) {
  return runTrackedSync(
    {
      clientId: params.clientId,
      integrationId: params.integrationId,
      provider: 'meta',
      runType: params.runType,
      triggeredBy: params.triggeredBy,
    },
    async (counters) => {
      const stored = await getDecryptedCredentials<MetaStoredCredentials>(params.clientId, 'meta');
      if (!stored || !stored.integrationAccountId) {
        throw new IntegrationError('meta', 'No connected Meta ad account for this client', false);
      }

      const creds = await ensureFreshToken(params.clientId, stored.credentials);
      const client = new MetaClient(creds.accessToken, creds.adAccountId);
      const integrationAccountId = stored.integrationAccountId;

      // ---- Entities: campaigns -> ad sets -> ads ------------------------
      const allCampaigns: MetaCampaign[] = [];
      for await (const page of client.streamCampaigns()) allCampaigns.push(...page);
      counters.addFetched(allCampaigns.length);

      const { idByPlatformId: campaignIdMap, counts: campaignCounts } = await upsertMetaCampaigns(
        params.clientId,
        integrationAccountId,
        allCampaigns.map(transformCampaign),
      );
      counters.addUpsertResult(campaignCounts.created, campaignCounts.updated);

      const allAdSets: MetaAdSet[] = [];
      for await (const page of client.streamAdSets()) allAdSets.push(...page);
      counters.addFetched(allAdSets.length);

      const { idByPlatformId: adSetIdMap, counts: adSetCounts } = await upsertMetaAdSets(
        params.clientId,
        integrationAccountId,
        allAdSets.map(transformAdSet),
        campaignIdMap,
      );
      counters.addUpsertResult(adSetCounts.created, adSetCounts.updated);

      const allAds: MetaAd[] = [];
      for await (const page of client.streamAds()) allAds.push(...page);
      counters.addFetched(allAds.length);

      // meta_ads.meta_campaign_id is NOT NULL (denormalized for direct
      // querying) even though the row also carries adset_id - resolve it
      // from the ad set list already fetched above.
      const campaignPlatformIdByAdSetPlatformId = new Map(allAdSets.map((a) => [a.id, a.campaign_id]));

      // No per-ad creative sync here - this schema's `creatives` catalog
      // (concept/hook/angle) is curated by the creative-management side of
      // the product, not mirrored from Meta. meta_ads.creative_id just
      // carries Meta's raw creative id string for reference/linking.
      const { idByPlatformId: adIdMap, counts: adCounts } = await upsertMetaAds(
        params.clientId,
        integrationAccountId,
        allAds.map(transformAd),
        adSetIdMap,
        campaignPlatformIdByAdSetPlatformId,
        campaignIdMap,
      );
      counters.addUpsertResult(adCounts.created, adCounts.updated);

      // Auto-populates the creatives catalog from real ads (see creativesRepo.ts) - this app
      // has no other way for real Meta ads to ever reach the Creatives page. Batch-fetches real
      // thumbnail/image URLs per distinct creative_id so the Creatives grid shows actual assets
      // instead of the placeholder icon.
      const transformedAds = allAds.map(transformAd);
      const uniqueCreativeIds = [...new Set(transformedAds.map((a) => a.metaCreativeId).filter((id): id is string => id !== null))];
      // Same proactive pause as before getActivityCodes in merittoSync.ts: this fires right
      // after the campaigns/adsets/ads pagination burst, and live-tested, starting another
      // batch of Graph API calls with zero gap trips the same app-level rate limit.
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      const creativeDetails = await client.fetchCreativesByIds(uniqueCreativeIds);
      const normalizedCreatives = creativeDetails.map(transformCreative);
      const creativeDetailById = new Map(normalizedCreatives.map((c) => [c.metaCreativeId, c]));

      // Video ads have image_url: null on the creative itself (image_url only exists for
      // static/carousel ads) - the actual playable file lives on the separate Video node, keyed
      // by video_id. Same pacing pause as above before starting this next batch of calls.
      const uniqueVideoIds = [...new Set(normalizedCreatives.map((c) => c.videoId).filter((id): id is string => id !== null))];
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      const videoSourceById = await client.fetchVideoSources(uniqueVideoIds);

      // A handful of carousel ads in this account - their child_attachments only carry an
      // image_hash, resolved to a real URL via the account's /adimages edge.
      const uniqueImageHashes = [...new Set(normalizedCreatives.flatMap((c) => c.carouselImageHashes))];
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      const imageUrlByHash = await client.fetchImageUrlsByHashes(uniqueImageHashes);

      const metaAdsForCreativeSync = transformedAds
        .map((a) => {
          const internalId = adIdMap.get(a.metaAdId);
          if (!internalId) return null;
          const detail = a.metaCreativeId ? creativeDetailById.get(a.metaCreativeId) : undefined;
          const videoSource = detail?.videoId ? videoSourceById.get(detail.videoId) : undefined;
          const carouselImages = (detail?.carouselImageHashes ?? [])
            .map((hash) => imageUrlByHash.get(hash))
            .filter((url): url is string => Boolean(url));
          return {
            id: internalId,
            name: a.name,
            status: a.status,
            thumbnailUrl: detail?.thumbnailUrl ?? null,
            // Real playable video first (AssetPreview renders a <video> for a .mp4 URL), then a
            // carousel's first card, then the static image_url, so nothing falls back to a
            // non-playable thumbnail crop unnecessarily.
            assetUrl: videoSource ?? carouselImages[0] ?? detail?.imageUrl ?? null,
            carouselImages: carouselImages.length > 1 ? carouselImages : null,
          };
        })
        .filter((a): a is NonNullable<typeof a> => a !== null);
      await syncCreativesForAds(params.clientId, 'meta', metaAdsForCreativeSync);

      // ---- Daily performance -------------------------------------------
      const lookbackDays = params.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
      const today = todayInTimezone('UTC');
      const since = new Date(Date.now() - lookbackDays * 86_400_000).toISOString().slice(0, 10);

      const allMetricRows = [];
      for await (const page of client.streamDailyInsights(since, today)) {
        allMetricRows.push(...page);
      }
      counters.addFetched(allMetricRows.length);

      const metricsCounts = await upsertMetaDailyMetrics(params.clientId, allMetricRows.map(transformDailyMetric), adIdMap);
      counters.addUpsertResult(metricsCounts.created, metricsCounts.updated);

      await updateIntegrationStatus(params.clientId, 'meta', {
        status: 'connected',
        lastSyncAt: new Date().toISOString(),
      });
    },
  );
}
