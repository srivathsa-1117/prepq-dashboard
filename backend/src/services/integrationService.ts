import {
  getIntegration,
  listIntegrations,
  upsertIntegrationConnection,
  getDecryptedCredentials,
  disconnectIntegration as disconnectIntegrationRepo,
  updateIntegrationStatus,
  refreshIntegrationCredentials,
  type PublicIntegration,
} from '../repositories/integrationsRepo.js';
import { getLatestSyncRuns } from '../repositories/syncRunsRepo.js';
import { ensureSyncJob } from '../repositories/syncJobsRepo.js';
import * as metaAuth from '../integrations/meta/metaAuth.js';
import * as googleAuth from '../integrations/google/googleAdsAuth.js';
import { MerittoClient } from '../integrations/meritto/merittoClient.js';
import { assertClientAccess, assertRole } from '../auth/rbac.js';
import { signOAuthState, verifyOAuthState } from '../utils/oauthState.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';
import type { AuthContext, IntegrationConnectionPhase, IntegrationProvider } from '../types/domain.js';
import { ValidationError, IntegrationError, ForbiddenError } from '../utils/errors.js';

/**
 * Ensures this client+provider has a sync_jobs row the moment a provider finishes connecting, so
 * the in-process scheduler (scheduler/syncScheduler.ts) picks it up on its next tick - enabled by
 * default, using the client's own timezone and the provider's default time
 * (config/constants.ts::DEFAULT_SYNC_SCHEDULE) until adjusted via PATCH /api/sync/:provider/schedule.
 *
 * Deliberately non-fatal: this runs *after* the integration/account has already been saved (see
 * connectIntegration below), so a transient DB error here should not make the whole connect
 * request look like it failed when the actual connection succeeded.
 */
async function registerScheduleOnConnect(clientId: string, provider: IntegrationProvider, integrationId: string): Promise<void> {
  try {
    await ensureSyncJob(clientId, integrationId, provider);
  } catch (error) {
    logger.warn({ err: error, clientId, provider }, 'Failed to create sync_jobs row after connect - integration is still connected, sync will need to be enabled separately');
  }
}

export interface ConnectIntegrationInput {
  authorizationCode?: string;
  apiKey?: string;
  apiSecret?: string;
  externalAccountId?: string;
  externalAccountName?: string;
}

export interface AvailableAccount {
  id: string;
  name: string;
}

/**
 * The DB's `integrations.status` has no "pending account selection" value
 * (see types/domain.ts::IntegrationConnectionPhase) - a Meta/Google connect
 * that has stored credentials but no linked account still reads back as
 * 'disconnected' from the DB. This derives the richer, frontend-facing phase
 * without needing a 5th DB status value.
 */
async function computePhase(clientId: string, provider: IntegrationProvider, integration: PublicIntegration | null): Promise<IntegrationConnectionPhase> {
  if (!integration || integration.status !== 'disconnected') return integration?.status ?? 'disconnected';
  if (provider === 'meritto') return 'disconnected';

  const stored = await getDecryptedCredentials(clientId, provider);
  return stored ? 'pending_account_selection' : 'disconnected';
}

export async function getIntegrationStatus(clientId: string, provider: IntegrationProvider) {
  const [integration, syncStatus] = await Promise.all([getIntegration(clientId, provider), getLatestSyncRuns(clientId, provider)]);
  const phase = await computePhase(clientId, provider, integration);
  return { integration, phase, syncStatus };
}

export async function listIntegrationsForClient(clientId: string) {
  return listIntegrations(clientId);
}

export async function listAvailableAccounts(clientId: string, provider: IntegrationProvider): Promise<AvailableAccount[]> {
  if (provider === 'meta') {
    const stored = await getDecryptedCredentials<{ accessToken: string }>(clientId, 'meta');
    if (!stored) throw new ValidationError('Connect Meta (authorization code) before listing accounts');
    const accounts = await metaAuth.listAvailableAdAccounts(stored.credentials.accessToken);
    return accounts.map((a) => ({ id: a.id, name: a.name }));
  }

  if (provider === 'google_ads') {
    const stored = await getDecryptedCredentials<{ accessToken: string }>(clientId, 'google_ads');
    if (!stored) throw new ValidationError('Connect Google Ads (authorization code) before listing accounts');
    const customerIds = await googleAuth.listAccessibleCustomers(stored.credentials.accessToken);
    // TODO(google): enrich with descriptive_name via a customer_client GAQL query once a real MCC is available to test.
    return customerIds.map((id) => ({ id, name: id }));
  }

  // Meritto: single account per credential set, nothing to "select" from a list.
  const integration = await getIntegration(clientId, 'meritto');
  return integration?.externalAccountId
    ? [{ id: integration.externalAccountId, name: integration.externalAccountName ?? integration.externalAccountId }]
    : [];
}

/**
 * Builds the "Connect with Meta/Google" redirect URL for the frontend's
 * IntegrationsDrawer. Caller (the route) has already run
 * requireClientAccess + requireRole('manager') for clientId, so this just
 * signs that decision into `state` for completeOAuthConnect to trust later -
 * the browser round-trips through Meta/Google in between, so we can't rely
 * on request-scoped auth for the callback leg.
 */
export function createAuthorizationUrl(clientId: string, provider: IntegrationProvider, userId: string): { url: string } {
  if (provider === 'meritto') {
    throw new ValidationError('Meritto connects via API key/secret, not OAuth');
  }

  const state = signOAuthState({ clientId, provider, userId });
  const url = provider === 'meta' ? metaAuth.getAuthorizationUrl(state) : googleAuth.getAuthorizationUrl(state);
  return { url };
}

/**
 * V1 simplification: this deployment is single-tenant and only ever reports
 * on one ad account per provider, so the OAuth flow auto-finalizes to a
 * pre-configured account instead of making the user pick from a list (which
 * for an agency-sized Meta/Google Ads login can be dozens of unlabeled
 * numeric ids). Multi-account selection - listAvailableAccounts and the
 * `pending_account_selection` phase - is untouched below for when this
 * becomes a real multi-tenant SaaS; it's just not exercised while a default
 * is configured.
 */
function defaultAccountIdFor(provider: IntegrationProvider): string | undefined {
  if (provider === 'meta') return env.META_DEFAULT_AD_ACCOUNT_ID || undefined;
  if (provider === 'google_ads') return env.GOOGLE_ADS_DEFAULT_CUSTOMER_ID || undefined;
  return undefined;
}

/**
 * Completes the OAuth redirect: verifies the signed state (tamper-proof,
 * 10-minute TTL - see utils/oauthState.ts), re-asserts the initiating user
 * still has manager+ access to that client (permissions can change during
 * the round-trip through Meta/Google), then reuses the same connectIntegration
 * path the manual-code flow uses. If a default account is configured for this
 * provider, immediately finalizes the connection to it - see
 * defaultAccountIdFor above.
 */
export async function completeOAuthConnect(
  code: string,
  state: string,
  auth: AuthContext,
): Promise<{ clientId: string; provider: IntegrationProvider; integration: PublicIntegration }> {
  const decoded = verifyOAuthState(state);
  if (decoded.userId !== auth.userId) {
    throw new ForbiddenError('This OAuth connection was started by a different user session');
  }

  const { role } = await assertClientAccess(auth, decoded.clientId);
  assertRole(role, 'manager');

  await connectIntegration(decoded.clientId, decoded.provider, { authorizationCode: code }, auth.userId);

  const defaultAccountId = defaultAccountIdFor(decoded.provider);
  const integration = defaultAccountId
    ? await connectIntegration(decoded.clientId, decoded.provider, { externalAccountId: defaultAccountId }, auth.userId)
    : await getIntegration(decoded.clientId, decoded.provider);

  if (!integration) {
    throw new ValidationError('Connection succeeded but the integration record could not be found - please retry');
  }

  return { clientId: decoded.clientId, provider: decoded.provider, integration };
}

export async function connectIntegration(
  clientId: string,
  provider: IntegrationProvider,
  input: ConnectIntegrationInput,
  _userId: string,
): Promise<PublicIntegration> {
  if (provider === 'meritto') {
    if (!input.apiKey || !input.apiSecret) {
      throw new ValidationError('api_key and api_secret are required to connect Meritto');
    }

    const client = new MerittoClient({ apiKey: input.apiKey, apiSecret: input.apiSecret });
    const test = await client.testConnection();
    if (!test.ok) {
      throw new IntegrationError('meritto', `Meritto connection test failed: ${test.message}`, false);
    }

    const integration = await upsertIntegrationConnection({
      clientId,
      provider,
      credentials: { apiKey: input.apiKey, apiSecret: input.apiSecret },
      externalAccountId: input.externalAccountId ?? 'default',
      externalAccountName: input.externalAccountName ?? null,
      status: 'connected',
    });
    await registerScheduleOnConnect(clientId, provider, integration.id);
    return integration;
  }

  if (provider === 'meta') {
    // System user access token connect: no OAuth round-trip needed (the token is generated
    // once in Business Settings and, for a Business-owned app, can be set to never expire) -
    // single step, same shape as the Meritto api-key connect above. `expiresAt: null` matters
    // downstream: metaSync.ts's ensureFreshToken only calls extendToLongLivedToken (which
    // needs META_APP_ID/META_APP_SECRET) when expiresAt is set, so this path works even
    // without those configured.
    if (input.apiKey && !input.authorizationCode) {
      const rawAccountId = input.externalAccountId ?? env.META_DEFAULT_AD_ACCOUNT_ID;
      if (!rawAccountId) {
        throw new ValidationError('external_account_id (Meta ad account id, e.g. act_123... or just the digits) is required to connect with a system user token');
      }
      // Graph API ad-account endpoints require the "act_" prefix (a bare numeric id resolves to
      // the wrong node type) - Meta's own UI displays account ids without it, so normalize here
      // the same way GOOGLE_ADS_LOGIN_CUSTOMER_ID strips dashes in config/env.ts.
      const accountId = rawAccountId.startsWith('act_') ? rawAccountId : `act_${rawAccountId}`;

      const test = await metaAuth.testConnection(input.apiKey, accountId);
      if (!test.ok) {
        throw new IntegrationError('meta', `Meta connection test failed: ${test.message}`, false);
      }

      const integration = await upsertIntegrationConnection({
        clientId,
        provider,
        credentials: { accessToken: input.apiKey, expiresAt: null, adAccountId: accountId },
        externalAccountId: accountId,
        externalAccountName: input.externalAccountName ?? null,
        tokenExpiresAt: null,
        status: 'connected',
      });
      await registerScheduleOnConnect(clientId, provider, integration.id);
      return integration;
    }

    // Step 2: account already chosen, credentials already stored from step 1.
    if (!input.authorizationCode && input.externalAccountId) {
      const stored = await getDecryptedCredentials<{ accessToken: string; expiresAt: string | null }>(clientId, 'meta');
      if (!stored) throw new ValidationError('No pending Meta connection to finalize - start with authorization_code');

      const integration = await upsertIntegrationConnection({
        clientId,
        provider,
        credentials: { accessToken: stored.credentials.accessToken, expiresAt: stored.credentials.expiresAt, adAccountId: input.externalAccountId },
        externalAccountId: input.externalAccountId,
        externalAccountName: input.externalAccountName ?? null,
        tokenExpiresAt: stored.credentials.expiresAt,
        status: 'connected',
      });
      await registerScheduleOnConnect(clientId, provider, integration.id);
      return integration;
    }

    // Step 1: exchange code, store as pending until an ad account is chosen.
    if (!input.authorizationCode) {
      throw new ValidationError('authorization_code is required to start a Meta connection');
    }
    const creds = await metaAuth.exchangeCodeForToken(input.authorizationCode);
    return upsertIntegrationConnection({
      clientId,
      provider,
      credentials: { accessToken: creds.accessToken, expiresAt: creds.expiresAt, adAccountId: null },
      externalAccountId: input.externalAccountId ?? null,
      tokenExpiresAt: creds.expiresAt,
      status: 'disconnected',
    });
  }

  // google_ads
  if (!input.authorizationCode && input.externalAccountId) {
    const stored = await getDecryptedCredentials<{ accessToken: string; refreshToken: string; expiresAt: string | null }>(
      clientId,
      'google_ads',
    );
    if (!stored) throw new ValidationError('No pending Google Ads connection to finalize - start with authorization_code');

    const integration = await upsertIntegrationConnection({
      clientId,
      provider,
      credentials: { ...stored.credentials, customerId: input.externalAccountId },
      externalAccountId: input.externalAccountId,
      externalAccountName: input.externalAccountName ?? null,
      tokenExpiresAt: stored.credentials.expiresAt,
      status: 'connected',
    });
    await registerScheduleOnConnect(clientId, provider, integration.id);
    return integration;
  }

  if (!input.authorizationCode) {
    throw new ValidationError('authorization_code is required to start a Google Ads connection');
  }
  const creds = await googleAuth.exchangeCodeForToken(input.authorizationCode);
  return upsertIntegrationConnection({
    clientId,
    provider,
    credentials: { ...creds, customerId: null },
    externalAccountId: input.externalAccountId ?? null,
    tokenExpiresAt: creds.expiresAt,
    status: 'disconnected',
  });
}

export async function disconnectIntegration(clientId: string, provider: IntegrationProvider): Promise<void> {
  await disconnectIntegrationRepo(clientId, provider);
}

export async function testIntegration(clientId: string, provider: IntegrationProvider): Promise<{ ok: boolean; message?: string }> {
  const stored = await getDecryptedCredentials(clientId, provider);
  if (!stored) return { ok: false, message: 'Not connected' };

  let result: { ok: boolean; message?: string };

  if (provider === 'meta') {
    const creds = stored.credentials as { accessToken: string };
    result = await metaAuth.testConnection(creds.accessToken, stored.externalAccountId ?? '');
  } else if (provider === 'google_ads') {
    const creds = stored.credentials as { accessToken: string };
    result = await googleAuth.testConnection(creds.accessToken, stored.externalAccountId ?? '');
  } else {
    const creds = stored.credentials as { apiKey: string; apiSecret: string };
    const client = new MerittoClient(creds);
    result = await client.testConnection();
  }

  await updateIntegrationStatus(clientId, provider, { status: result.ok ? 'connected' : 'error' });

  return result;
}

/** Explicit token refresh (surfaced as its own API operation per spec §5, on top of the automatic refresh every sync run performs). */
export async function refreshIntegration(clientId: string, provider: IntegrationProvider): Promise<void> {
  if (provider === 'meritto') {
    // No token to refresh - API key/secret pairs don't expire on a schedule.
    return;
  }

  const stored = await getDecryptedCredentials(clientId, provider);
  if (!stored) throw new ValidationError(`${provider} is not connected`);

  if (provider === 'meta') {
    const creds = stored.credentials as { accessToken: string; adAccountId: string | null };
    const extended = await metaAuth.extendToLongLivedToken(creds.accessToken);
    await refreshIntegrationCredentials(
      clientId,
      provider,
      { accessToken: extended.accessToken, expiresAt: extended.expiresAt, adAccountId: creds.adAccountId },
      extended.expiresAt,
    );
    return;
  }

  const creds = stored.credentials as { refreshToken: string; customerId: string | null };
  const refreshed = await googleAuth.refreshAccessToken(creds.refreshToken);
  await refreshIntegrationCredentials(
    clientId,
    provider,
    { accessToken: refreshed.accessToken, refreshToken: creds.refreshToken, expiresAt: refreshed.expiresAt, customerId: creds.customerId },
    refreshed.expiresAt,
  );
}
