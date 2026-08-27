import { env } from '../../config/env.js';
import { httpJson } from '../../utils/httpClient.js';
import { NotConfiguredError } from '../../utils/errors.js';
import type { MetaAdAccount, MetaListResponse } from '../../types/meta.js';

const GRAPH_BASE = `https://graph.facebook.com/${env.META_GRAPH_API_VERSION}`;
const META_OAUTH_DIALOG_BASE = `https://www.facebook.com/${env.META_GRAPH_API_VERSION}/dialog/oauth`;
const META_OAUTH_SCOPES = 'ads_read';

/** Builds the URL the browser is redirected to for the Meta consent screen - `state` is the signed token from utils/oauthState.ts. */
export function getAuthorizationUrl(state: string): string {
  if (!env.META_APP_ID || !env.META_OAUTH_REDIRECT_URI) {
    throw new NotConfiguredError('Meta integration is not configured on this server yet (missing app credentials) - contact an admin.');
  }

  const url = new URL(META_OAUTH_DIALOG_BASE);
  url.searchParams.set('client_id', env.META_APP_ID);
  url.searchParams.set('redirect_uri', env.META_OAUTH_REDIRECT_URI);
  url.searchParams.set('state', state);
  url.searchParams.set('scope', META_OAUTH_SCOPES);
  url.searchParams.set('response_type', 'code');
  return url.toString();
}

export interface MetaTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

export interface MetaCredentials {
  accessToken: string;
  /** Long-lived tokens (~60 days) don't have a refresh token; we re-extend before expiry instead. */
  expiresAt: string | null;
}

/**
 * Exchanges a frontend OAuth authorization code for a short-lived user
 * access token, then immediately extends it to a long-lived token (~60 days).
 * TODO(meta): confirm the app is approved for `ads_read` (and `ads_management`
 * if write-back to Meta is ever needed - not required by this spec) before
 * relying on this in production; sandboxed/dev-mode apps only see test data.
 */
export async function exchangeCodeForToken(authorizationCode: string): Promise<MetaCredentials> {
  if (!env.META_APP_ID || !env.META_APP_SECRET || !env.META_OAUTH_REDIRECT_URI) {
    throw new NotConfiguredError('Meta integration is not configured on this server yet (missing app credentials) - contact an admin.');
  }

  const shortLived = await httpJson<MetaTokenResponse>(`${GRAPH_BASE}/oauth/access_token`, {
    method: 'GET',
    label: 'meta.oauth.exchange',
    query: {
      client_id: env.META_APP_ID,
      client_secret: env.META_APP_SECRET,
      redirect_uri: env.META_OAUTH_REDIRECT_URI,
      code: authorizationCode,
    },
  });

  return extendToLongLivedToken(shortLived.access_token);
}

export async function extendToLongLivedToken(shortLivedToken: string): Promise<MetaCredentials> {
  if (!env.META_APP_ID || !env.META_APP_SECRET) {
    throw new NotConfiguredError('Meta integration is not configured on this server yet (missing app credentials) - contact an admin.');
  }

  const longLived = await httpJson<MetaTokenResponse>(`${GRAPH_BASE}/oauth/access_token`, {
    method: 'GET',
    label: 'meta.oauth.extend',
    query: {
      grant_type: 'fb_exchange_token',
      client_id: env.META_APP_ID,
      client_secret: env.META_APP_SECRET,
      fb_exchange_token: shortLivedToken,
    },
  });

  const expiresAt = longLived.expires_in ? new Date(Date.now() + longLived.expires_in * 1000).toISOString() : null;

  return { accessToken: longLived.access_token, expiresAt };
}

export async function listAvailableAdAccounts(accessToken: string): Promise<MetaAdAccount[]> {
  const response = await httpJson<MetaListResponse<MetaAdAccount>>(`${GRAPH_BASE}/me/adaccounts`, {
    method: 'GET',
    label: 'meta.adaccounts.list',
    query: {
      access_token: accessToken,
      fields: 'id,account_id,name,account_status,currency,timezone_name',
      limit: 200,
    },
  });
  return response.data;
}

export async function testConnection(accessToken: string, adAccountId: string): Promise<{ ok: boolean; message?: string }> {
  try {
    await httpJson(`${GRAPH_BASE}/${adAccountId}`, {
      method: 'GET',
      label: 'meta.testConnection',
      query: { access_token: accessToken, fields: 'id,name' },
      retry: { maxAttempts: 1 },
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Unknown error' };
  }
}
