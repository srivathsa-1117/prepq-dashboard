import { apiFetch } from './client';
import type { IntegrationProvider, IntegrationStatusResponse, PublicIntegration } from '../types/api';

export function listIntegrations(clientId: string) {
  return apiFetch<{ integrations: PublicIntegration[] }>('/api/integrations', { params: { client_id: clientId } });
}

export function getIntegrationStatus(clientId: string, provider: IntegrationProvider) {
  return apiFetch<IntegrationStatusResponse>(`/api/integrations/${provider}`, { params: { client_id: clientId } });
}

export function listAvailableAccounts(clientId: string, provider: IntegrationProvider) {
  return apiFetch<{ accounts: Array<{ id: string; name: string }> }>(`/api/integrations/${provider}/accounts`, {
    params: { client_id: clientId },
  });
}

/** Mints the real Meta/Google consent-screen URL - the caller does a full-page redirect to it (see IntegrationsDrawer). */
export function getAuthorizationUrl(clientId: string, provider: IntegrationProvider) {
  return apiFetch<{ url: string }>(`/api/integrations/${provider}/authorize-url`, { params: { client_id: clientId } });
}

/** Completes the OAuth redirect from app/integrations/callback - clientId/provider come back from the signed state, not from this call. */
export function completeOAuthConnect(code: string, state: string) {
  return apiFetch<{ clientId: string; provider: IntegrationProvider; integration: PublicIntegration }>('/api/integrations/oauth/complete', {
    method: 'POST',
    body: { code, state },
  });
}

export interface ConnectIntegrationInput {
  authorization_code?: string;
  api_key?: string;
  api_secret?: string;
  external_account_id?: string;
  external_account_name?: string;
}

export function connectIntegration(clientId: string, provider: IntegrationProvider, input: ConnectIntegrationInput) {
  return apiFetch<{ integration: PublicIntegration }>(`/api/integrations/${provider}/connect`, {
    method: 'POST',
    body: { client_id: clientId, ...input },
  });
}

export function disconnectIntegration(clientId: string, provider: IntegrationProvider) {
  return apiFetch<void>(`/api/integrations/${provider}/disconnect`, { method: 'POST', body: { client_id: clientId } });
}

export function testIntegration(clientId: string, provider: IntegrationProvider) {
  return apiFetch<{ ok: boolean; message?: string }>(`/api/integrations/${provider}/test`, {
    method: 'POST',
    body: { client_id: clientId },
  });
}

export function refreshIntegration(clientId: string, provider: IntegrationProvider) {
  return apiFetch<{ refreshed: boolean }>(`/api/integrations/${provider}/refresh`, {
    method: 'POST',
    body: { client_id: clientId },
  });
}
