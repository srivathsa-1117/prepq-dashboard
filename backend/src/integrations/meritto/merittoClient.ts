/**
 * Meritto (formerly NoPaperForms) CRM API client.
 *
 * Confirmed against the real developer docs (developer.nopaperforms.com) and
 * live-tested against this account's real credentials/data - paths, auth
 * headers, pagination, and field keys below are the actual contract, not a
 * placeholder.
 */
import { env } from '../../config/env.js';
import { httpJson } from '../../utils/httpClient.js';
import { NotConfiguredError } from '../../utils/errors.js';
import { PAGE_SIZE } from '../../config/constants.js';
import type { MerittoActivity, MerittoActivityCode, MerittoEnvelope, MerittoLead, MerittoPayment } from '../../types/meritto.js';

const LEADS_LIST_PATH = '/lead/v1/list';
const LEAD_METADATA_PATH = '/lead/v1/getMetaData';
const ACTIVITY_CODES_PATH = '/activity/v1/getCodesList';
const ACTIVITY_BY_DATE_RANGE_PATH = '/activity/v1/getByDateRange';

/**
 * /lead/v1/list and /activity/v1/getByDateRange (the bulk "export" endpoints)
 * are throttled far more tightly than the rest of this API - live-tested a
 * single request works fine, but a second one under ~15s later 429s. The
 * generic httpClient retry (500ms-4s exponential backoff) is much too fast
 * for that and just burns through more attempts inside the same cooldown
 * window - these two need their own, much longer, backoff, plus a fixed
 * delay between successful pagination pages so a big export doesn't trip
 * the same limit on its own.
 */
const BULK_ENDPOINT_RETRY = { maxAttempts: 3, minTimeoutMs: 16_000, maxTimeoutMs: 30_000, factor: 1.3 };
const BULK_ENDPOINT_PAGE_DELAY_MS = 16_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fields requested from every lead - matches what merittoTransform.ts::transformLead actually reads. Extend both together. */
const MERITTO_LEAD_FIELDS = [
  'name',
  'email',
  'mobile',
  'course',
  'source',
  'medium',
  'campaign',
  'lead_stage',
  'lead_status',
  'previous_lead_stage',
  'owner',
  'lead_age',
  'cf_ad_name',
  'cf_ad_set_name',
  'cf_campaign_name',
  'total_outbound',
  'outbound_success',
];

/** Activity date-range API caps at 30 days per call (documented) - splits a wider range into consecutive <=30-day windows. */
export function chunkIntoWindows(fromDate: Date, toDate: Date, maxDays = 30): Array<{ from: Date; to: Date }> {
  const windows: Array<{ from: Date; to: Date }> = [];
  let cursor = new Date(fromDate);
  const maxMs = maxDays * 86_400_000;

  while (cursor < toDate) {
    const windowEnd = new Date(Math.min(cursor.getTime() + maxMs, toDate.getTime()));
    windows.push({ from: new Date(cursor), to: windowEnd });
    cursor = windowEnd;
  }

  return windows;
}

export interface MerittoCredentials {
  apiKey: string;
  apiSecret: string;
}

export class MerittoClient {
  private readonly baseUrl: string;

  constructor(private readonly credentials: MerittoCredentials, baseUrl?: string) {
    this.baseUrl = baseUrl ?? env.MERITTO_API_BASE_URL ?? '';
    if (!this.baseUrl) {
      throw new NotConfiguredError('Meritto integration is not configured on this server yet (missing API base URL) - contact an admin.');
    }
    // MERITTO_API_BASE_URL already ends in /lead/v1/ in this account's config (see .env.example) -
    // strip that back to the bare host so LEADS_LIST_PATH etc. above don't double up the segment.
    this.baseUrl = this.baseUrl.replace(/\/lead\/v1\/?$/, '');
  }

  private authHeaders(): Record<string, string> {
    return {
      'access-key': this.credentials.apiKey,
      'secret-key': this.credentials.apiSecret,
      'content-type': 'application/json',
      accept: 'application/json',
    };
  }

  private async post<T>(path: string, body: unknown, label: string, retry?: Parameters<typeof httpJson>[1]['retry']): Promise<MerittoEnvelope<T>> {
    return httpJson<MerittoEnvelope<T>>(`${this.baseUrl}${path}`, {
      method: 'POST',
      label,
      headers: this.authHeaders(),
      body: JSON.stringify(body),
      ...(retry ? { retry } : {}),
    });
  }

  /**
   * Streams leads. `fromDate`/`toDate` (Unix epoch seconds) filter by the
   * API's own creation/update timestamp, even though that timestamp isn't
   * itself exposed on the returned lead object (see merittoTransform.ts's
   * lead_age-based approximation of createdAtSource).
   */
  async *streamLeads(fromDate?: number, toDate?: number): AsyncGenerator<MerittoLead[]> {
    let pageToken = '';
    let firstPage = true;
    for (;;) {
      if (!firstPage) await sleep(BULK_ENDPOINT_PAGE_DELAY_MS);
      firstPage = false;

      const response = await this.post<{ list: MerittoLead[]; pagination?: { next?: string } }>(
        LEADS_LIST_PATH,
        {
          page_token: pageToken,
          page_size: PAGE_SIZE.meritto,
          fields: MERITTO_LEAD_FIELDS,
          ...(fromDate && toDate ? { filter: { date_range: { from_date: fromDate, to_date: toDate } } } : {}),
        },
        'meritto.leads.list',
        BULK_ENDPOINT_RETRY,
      );

      if (response.data.list.length > 0) yield response.data.list;

      const next = response.data.pagination?.next;
      if (!next) break;
      pageToken = next;
    }
  }

  /**
   * Live-tested: this endpoint alone is fine, but calling it immediately
   * after a sustained streamLeads() pull (many paginated calls in a couple
   * minutes) 429s too - the limit appears to key off recent request volume
   * for this credential pair broadly, not purely per-endpoint. Same long
   * retry as the bulk endpoints, plus callers (merittoSync.ts) should expect
   * to call this right after streamLeads(), not concurrently with it.
   */
  async getActivityCodes(): Promise<MerittoActivityCode[]> {
    const response = await httpJson<MerittoEnvelope<{ activity_list: MerittoActivityCode[] }>>(`${this.baseUrl}${ACTIVITY_CODES_PATH}`, {
      method: 'GET',
      label: 'meritto.activity.codes',
      headers: this.authHeaders(),
      retry: BULK_ENDPOINT_RETRY,
    });
    return response.data.activity_list;
  }

  /**
   * Streams activity log entries for ALL leads within one <=30-day window
   * (the API's own limit - see chunkIntoWindows for splitting a wider range).
   */
  async *streamActivitiesInWindow(fromDate: number, toDate: number): AsyncGenerator<MerittoActivity[]> {
    let pageToken = '';
    let firstPage = true;
    for (;;) {
      if (!firstPage) await sleep(BULK_ENDPOINT_PAGE_DELAY_MS);
      firstPage = false;

      const response = await this.post<{ activity_logs: MerittoActivity[]; pagination?: { next_page_token?: string } }>(
        ACTIVITY_BY_DATE_RANGE_PATH,
        {
          page_token: pageToken,
          page_size: PAGE_SIZE.meritto,
          filter: { date_range: { from_date: fromDate, to_date: toDate }, activity_code: [] },
        },
        'meritto.activity.byDateRange',
        BULK_ENDPOINT_RETRY,
      );

      if (response.data.activity_logs.length > 0) yield response.data.activity_logs;

      const next = response.data.pagination?.next_page_token;
      if (!next) break;
      pageToken = next;
    }
  }

  /**
   * Streams activities across a wide date range by chunking into <=30-day
   * windows and querying each in turn (sequential, not parallel - stays well
   * under this account's rate limit rather than bursting several 30-day
   * pulls at once).
   */
  async *streamActivities(fromDate: Date, toDate: Date): AsyncGenerator<MerittoActivity[]> {
    let firstWindow = true;
    for (const window of chunkIntoWindows(fromDate, toDate)) {
      // Same rate-limit spacing as between pages within a window (streamActivitiesInWindow) -
      // a window boundary is just another call to the same throttled endpoint.
      if (!firstWindow) await sleep(BULK_ENDPOINT_PAGE_DELAY_MS);
      firstWindow = false;
      yield* this.streamActivitiesInWindow(Math.floor(window.from.getTime() / 1000), Math.floor(window.to.getTime() / 1000));
    }
  }

  /**
   * Payments API requires a form_id + product_id from separate Get Form
   * List / Get Payment Product List APIs we haven't wired up yet - returns
   * nothing rather than guessing. merittoSync.ts's try/catch around this
   * already treats an empty/failed payments pull as non-fatal (spec: "if
   * PrepQ collects fees through Meritto" is optional per account).
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, require-yield
  async *streamPayments(_fromDate?: number, _toDate?: number): AsyncGenerator<MerittoPayment[]> {}

  async testConnection(): Promise<{ ok: boolean; message?: string }> {
    try {
      await httpJson(`${this.baseUrl}${LEAD_METADATA_PATH}`, {
        method: 'GET',
        label: 'meritto.testConnection',
        headers: this.authHeaders(),
        retry: { maxAttempts: 1 },
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}
