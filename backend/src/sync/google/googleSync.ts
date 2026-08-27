import { getDecryptedCredentials, updateIntegrationStatus, refreshIntegrationCredentials } from '../../repositories/integrationsRepo.js';
import { upsertGoogleCampaigns, upsertGoogleAdGroups, upsertGoogleAds, upsertGoogleDailyMetrics } from '../../repositories/googleRepo.js';
import { syncCreativesForAds } from '../../repositories/creativesRepo.js';
import { GoogleAdsClient } from '../../integrations/google/googleAdsClient.js';
import { refreshAccessToken, type GoogleAdsCredentials } from '../../integrations/google/googleAdsAuth.js';
import { transformAd, transformAdGroup, transformCampaign, transformDailyMetric } from '../../integrations/google/googleTransform.js';
import { runTrackedSync } from '../syncRunTracker.js';
import { DEFAULT_LOOKBACK_DAYS } from '../../config/constants.js';
import { todayInTimezone } from '../../utils/dateRanges.js';
import { IntegrationError } from '../../utils/errors.js';
import type { SyncJobParams } from '../../types/sync.js';
import type { GoogleAdGroupAdRow, GoogleAdGroupRow, GoogleCampaignRow } from '../../types/google.js';

interface GoogleStoredCredentials extends GoogleAdsCredentials {
  customerId: string;
}

async function ensureFreshToken(clientId: string, creds: GoogleStoredCredentials): Promise<GoogleStoredCredentials> {
  const expiresInMs = creds.expiresAt ? new Date(creds.expiresAt).getTime() - Date.now() : 0;
  if (expiresInMs > 5 * 60 * 1000) return creds;

  const refreshed = await refreshAccessToken(creds.refreshToken);
  const updated: GoogleStoredCredentials = { ...creds, accessToken: refreshed.accessToken, expiresAt: refreshed.expiresAt };
  await refreshIntegrationCredentials(clientId, 'google_ads', { ...updated }, refreshed.expiresAt);
  return updated;
}

export async function syncGoogleForClient(params: SyncJobParams) {
  return runTrackedSync(
    {
      clientId: params.clientId,
      integrationId: params.integrationId,
      provider: 'google_ads',
      runType: params.runType,
      triggeredBy: params.triggeredBy,
    },
    async (counters) => {
      const stored = await getDecryptedCredentials<GoogleStoredCredentials>(params.clientId, 'google_ads');
      if (!stored || !stored.integrationAccountId) {
        throw new IntegrationError('google_ads', 'No connected Google Ads account for this client', false);
      }

      const creds = await ensureFreshToken(params.clientId, stored.credentials);
      const client = new GoogleAdsClient(creds.accessToken, creds.customerId);
      const integrationAccountId = stored.integrationAccountId;

      const allCampaigns: GoogleCampaignRow[] = [];
      for await (const page of client.streamCampaigns()) allCampaigns.push(...page);
      counters.addFetched(allCampaigns.length);

      const { idByPlatformId: campaignIdMap, counts: campaignCounts } = await upsertGoogleCampaigns(
        params.clientId,
        integrationAccountId,
        allCampaigns.map((c) => transformCampaign(c, creds.customerId)),
      );
      counters.addUpsertResult(campaignCounts.created, campaignCounts.updated);

      const allAdGroups: GoogleAdGroupRow[] = [];
      for await (const page of client.streamAdGroups()) allAdGroups.push(...page);
      counters.addFetched(allAdGroups.length);

      const { idByPlatformId: adGroupIdMap, counts: adGroupCounts } = await upsertGoogleAdGroups(
        params.clientId,
        integrationAccountId,
        allAdGroups.map(transformAdGroup),
        campaignIdMap,
      );
      counters.addUpsertResult(adGroupCounts.created, adGroupCounts.updated);

      const allAds: GoogleAdGroupAdRow[] = [];
      for await (const page of client.streamAds()) allAds.push(...page);
      counters.addFetched(allAds.length);

      // google_ads.google_campaign_id is NOT NULL (denormalized for direct
      // querying) even though the row also carries ad_group_id - resolve it
      // from the ad group list already fetched above.
      const campaignPlatformIdByAdGroupPlatformId = new Map(allAdGroups.map((a) => [a.adGroup.id, a.campaign.id]));

      const { idByPlatformId: adIdMap, counts: adCounts } = await upsertGoogleAds(
        params.clientId,
        integrationAccountId,
        allAds.map(transformAd),
        adGroupIdMap,
        campaignPlatformIdByAdGroupPlatformId,
        campaignIdMap,
      );
      counters.addUpsertResult(adCounts.created, adCounts.updated);

      // Auto-populates the creatives catalog from real ads (see creativesRepo.ts) - this app
      // has no other way for real Google ads to ever reach the Creatives page.
      const googleAdsForCreativeSync = allAds
        .map(transformAd)
        .map((a) => {
          const internalId = adIdMap.get(a.googleAdId);
          return internalId ? { id: internalId, name: a.name, status: a.status } : null;
        })
        .filter((a): a is NonNullable<typeof a> => a !== null);
      await syncCreativesForAds(params.clientId, 'google', googleAdsForCreativeSync);

      const lookbackDays = params.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
      const today = todayInTimezone('UTC');
      const since = new Date(Date.now() - lookbackDays * 86_400_000).toISOString().slice(0, 10);

      const allMetricRows = [];
      for await (const page of client.streamDailyMetrics(since, today)) {
        allMetricRows.push(...page);
      }
      counters.addFetched(allMetricRows.length);

      const metricsCounts = await upsertGoogleDailyMetrics(params.clientId, allMetricRows.map(transformDailyMetric), adIdMap);
      counters.addUpsertResult(metricsCounts.created, metricsCounts.updated);

      await updateIntegrationStatus(params.clientId, 'google_ads', {
        status: 'connected',
        lastSyncAt: new Date().toISOString(),
      });
    },
  );
}
