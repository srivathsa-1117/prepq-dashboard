import { env } from '../../config/env.js';
import { httpJson } from '../../utils/httpClient.js';
import { NotConfiguredError } from '../../utils/errors.js';

const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_OAUTH_DIALOG_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_ADS_API_BASE = `https://googleads.googleapis.com/${env.GOOGLE_ADS_API_VERSION}`;
const GOOGLE_ADS_OAUTH_SCOPE = 'https://www.googleapis.com/auth/adwords';

/**
 * Builds the URL the browser is redirected to for the Google consent screen -
 * `state` is the signed token from utils/oauthState.ts. access_type=offline +
 * prompt=consent are required to get a refresh_token back (see
 * exchangeCodeForToken's check below) - Google only issues one on the first
 * consent unless prompt=consent forces re-issuance every time.
 */
export function getAuthorizationUrl(state: string): string {
  if (!env.GOOGLE_ADS_CLIENT_ID || !env.GOOGLE_ADS_OAUTH_REDIRECT_URI) {
    throw new NotConfiguredError('Google Ads integration is not configured on this server yet (missing app credentials) - contact an admin.');
  }

  const url = new URL(GOOGLE_OAUTH_DIALOG_URL);
  url.searchParams.set('client_id', env.GOOGLE_ADS_CLIENT_ID);
  url.searchParams.set('redirect_uri', env.GOOGLE_ADS_OAUTH_REDIRECT_URI);
  url.searchParams.set('state', state);
  url.searchParams.set('scope', GOOGLE_ADS_OAUTH_SCOPE);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  return url.toString();
}

export interface GoogleAdsCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: string | null;
}

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

/** Authorization-code exchange for the initial connect flow (frontend OAuth redirect). */
export async function exchangeCodeForToken(authorizationCode: string): Promise<GoogleAdsCredentials> {
  if (!env.GOOGLE_ADS_CLIENT_ID || !env.GOOGLE_ADS_CLIENT_SECRET || !env.GOOGLE_ADS_OAUTH_REDIRECT_URI) {
    throw new NotConfiguredError('Google Ads integration is not configured on this server yet (missing app credentials) - contact an admin.');
  }

  const response = await httpJson<GoogleTokenResponse>(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    label: 'google.oauth.exchange',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: authorizationCode,
      client_id: env.GOOGLE_ADS_CLIENT_ID,
      client_secret: env.GOOGLE_ADS_CLIENT_SECRET,
      redirect_uri: env.GOOGLE_ADS_OAUTH_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.refresh_token) {
    throw new Error(
      'Google did not return a refresh_token - the OAuth consent screen must request offline access (access_type=offline, prompt=consent) on the frontend',
    );
  }

  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    expiresAt: new Date(Date.now() + response.expires_in * 1000).toISOString(),
  };
}

/** Refresh flow used by every sync run - Google access tokens are short-lived (~1h). */
export async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: string }> {
  if (!env.GOOGLE_ADS_CLIENT_ID || !env.GOOGLE_ADS_CLIENT_SECRET) {
    throw new NotConfiguredError('Google Ads integration is not configured on this server yet (missing app credentials) - contact an admin.');
  }

  const response = await httpJson<GoogleTokenResponse>(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    label: 'google.oauth.refresh',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.GOOGLE_ADS_CLIENT_ID,
      client_secret: env.GOOGLE_ADS_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });

  return { accessToken: response.access_token, expiresAt: new Date(Date.now() + response.expires_in * 1000).toISOString() };
}

interface ListAccessibleCustomersResponse {
  resourceNames: string[]; // e.g. ["customers/1234567890"]
}

/**
 * Lists customer accounts the authenticated Google user can access. This is
 * the flat "accessible customers" list - resolving it into human-readable
 * names/hierarchy (for agencies operating under an MCC) requires an
 * additional customer_client GAQL query. TODO(google): implement that
 * enrichment once a real MCC login-customer-id is available to test against.
 */
export async function listAccessibleCustomers(accessToken: string): Promise<string[]> {
  if (!env.GOOGLE_ADS_DEVELOPER_TOKEN) {
    throw new NotConfiguredError('Google Ads integration is not configured on this server yet (missing developer token) - contact an admin.');
  }

  const response = await httpJson<ListAccessibleCustomersResponse>(`${GOOGLE_ADS_API_BASE}/customers:listAccessibleCustomers`, {
    method: 'GET',
    label: 'google.customers.list',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'developer-token': env.GOOGLE_ADS_DEVELOPER_TOKEN,
    },
  });

  return response.resourceNames.map((rn) => rn.replace('customers/', ''));
}

export async function testConnection(accessToken: string, customerId: string): Promise<{ ok: boolean; message?: string }> {
  try {
    if (!env.GOOGLE_ADS_DEVELOPER_TOKEN) throw new Error('GOOGLE_ADS_DEVELOPER_TOKEN is not configured');

    await httpJson(`${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:search`, {
      method: 'POST',
      label: 'google.testConnection',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'developer-token': env.GOOGLE_ADS_DEVELOPER_TOKEN,
        'content-type': 'application/json',
        ...(env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ? { 'login-customer-id': env.GOOGLE_ADS_LOGIN_CUSTOMER_ID } : {}),
      },
      body: JSON.stringify({ query: 'SELECT customer.id FROM customer LIMIT 1' }),
      retry: { maxAttempts: 1 },
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Unknown error' };
  }
}
