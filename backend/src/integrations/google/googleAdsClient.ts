import { env } from '../../config/env.js';
import { httpJson } from '../../utils/httpClient.js';
import { NotConfiguredError } from '../../utils/errors.js';
import { paginateAllStream, type Page } from '../../utils/pagination.js';
import type {
  GoogleAdGroupAdRow,
  GoogleAdGroupRow,
  GoogleAdsSearchResponse,
  GoogleCampaignRow,
  GoogleMetricsRow,
} from '../../types/google.js';

const GOOGLE_ADS_API_BASE = `https://googleads.googleapis.com/${env.GOOGLE_ADS_API_VERSION}`;

async function searchPage<T>(
  customerId: string,
  accessToken: string,
  query: string,
  pageToken: string | null,
): Promise<Page<T, string>> {
  if (!env.GOOGLE_ADS_DEVELOPER_TOKEN) {
    throw new NotConfiguredError('Google Ads integration is not configured on this server yet (missing developer token) - contact an admin.');
  }

  const response = await httpJson<GoogleAdsSearchResponse<T>>(
    `${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:search`,
    {
      method: 'POST',
      label: 'google.googleAds.search',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'developer-token': env.GOOGLE_ADS_DEVELOPER_TOKEN,
        'content-type': 'application/json',
        ...(env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ? { 'login-customer-id': env.GOOGLE_ADS_LOGIN_CUSTOMER_ID } : {}),
      },
      // No `pageSize` field - the Ads API rejects it now (INVALID_ARGUMENT /
      // PAGE_SIZE_NOT_SUPPORTED as of recent versions). search responses have
      // a fixed 10,000-row page; searchStream would avoid pagination
      // entirely but search's per-page `pageToken` model is what
      // paginateAllStream (utils/pagination.ts) already expects.
      body: JSON.stringify({
        query,
        ...(pageToken ? { pageToken } : {}),
      }),
    },
  );

  return { items: response.results, nextCursor: response.nextPageToken ?? null };
}

export class GoogleAdsClient {
  constructor(private readonly accessToken: string, private readonly customerId: string) {}

  async *streamCampaigns(): AsyncGenerator<GoogleCampaignRow[]> {
    const query = `
      SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
             campaign.start_date_time, campaign.end_date_time, campaign_budget.amount_micros
      FROM campaign
      WHERE campaign.status != 'REMOVED'
    `;
    yield* paginateAllStream<GoogleCampaignRow, string>((cursor) =>
      searchPage<GoogleCampaignRow>(this.customerId, this.accessToken, query, cursor),
    );
  }

  async *streamAdGroups(): AsyncGenerator<GoogleAdGroupRow[]> {
    const query = `
      SELECT ad_group.id, ad_group.name, ad_group.status, ad_group.type, campaign.id
      FROM ad_group
      WHERE ad_group.status != 'REMOVED'
    `;
    yield* paginateAllStream<GoogleAdGroupRow, string>((cursor) =>
      searchPage<GoogleAdGroupRow>(this.customerId, this.accessToken, query, cursor),
    );
  }

  async *streamAds(): AsyncGenerator<GoogleAdGroupAdRow[]> {
    const query = `
      SELECT ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.type, ad_group_ad.ad.final_urls,
             ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions,
             ad_group_ad.status, ad_group.id
      FROM ad_group_ad
      WHERE ad_group_ad.status != 'REMOVED'
    `;
    yield* paginateAllStream<GoogleAdGroupAdRow, string>((cursor) =>
      searchPage<GoogleAdGroupAdRow>(this.customerId, this.accessToken, query, cursor),
    );
  }

  /** Daily metrics, segmented by date, since/until inclusive (YYYY-MM-DD). */
  async *streamDailyMetrics(sinceDate: string, untilDate: string): AsyncGenerator<GoogleMetricsRow[]> {
    const query = `
      SELECT ad_group_ad.ad.id, segments.date,
             metrics.impressions, metrics.clicks, metrics.cost_micros,
             metrics.conversions, metrics.conversions_value
      FROM ad_group_ad
      WHERE segments.date BETWEEN '${sinceDate}' AND '${untilDate}'
    `;
    yield* paginateAllStream<GoogleMetricsRow, string>((cursor) =>
      searchPage<GoogleMetricsRow>(this.customerId, this.accessToken, query, cursor),
    );
  }
}
