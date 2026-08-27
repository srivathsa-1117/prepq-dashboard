import { supabaseAdmin } from '../database/supabaseClient.js';
import { encryptCredentials, decryptCredentials } from '../utils/crypto.js';
import type { IntegrationProvider, IntegrationStatus } from '../types/domain.js';
import type { Database } from '../types/database.js';

type IntegrationRow = Database['public']['Tables']['integrations']['Row'];
type IntegrationAccountRow = Database['public']['Tables']['integration_accounts']['Row'];

/**
 * Public-safe view of an integration - the shape allowed to reach the
 * frontend. Structurally has no credential fields at all (those live in
 * secrets.integration_credentials, reached only via getDecryptedCredentials
 * below), so a careless `res.send(row)` cannot leak one.
 */
export interface PublicIntegration {
  id: string;
  clientId: string;
  provider: IntegrationProvider;
  status: IntegrationStatus;
  lastSyncAt: string | null;
  externalAccountId: string | null;
  externalAccountName: string | null;
  accountStatus: string | null;
}

function toPublicIntegration(integration: IntegrationRow, account: IntegrationAccountRow | null): PublicIntegration {
  return {
    id: integration.id,
    clientId: integration.client_id,
    provider: integration.provider as IntegrationProvider,
    status: integration.status as IntegrationStatus,
    lastSyncAt: integration.last_sync_at,
    externalAccountId: account?.external_account_id ?? null,
    externalAccountName: account?.account_name ?? null,
    accountStatus: account?.status ?? null,
  };
}

async function getPrimaryAccount(integrationId: string): Promise<IntegrationAccountRow | null> {
  const { data, error } = await supabaseAdmin
    .from('integration_accounts')
    .select('*')
    .eq('integration_id', integrationId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listIntegrations(clientId: string): Promise<PublicIntegration[]> {
  const { data: integrations, error } = await supabaseAdmin.from('integrations').select('*').eq('client_id', clientId);
  if (error) throw error;
  if (!integrations || integrations.length === 0) return [];

  const { data: accounts, error: accountsError } = await supabaseAdmin
    .from('integration_accounts')
    .select('*')
    .in(
      'integration_id',
      integrations.map((i) => i.id),
    );
  if (accountsError) throw accountsError;

  return integrations.map((integration) =>
    toPublicIntegration(integration, (accounts ?? []).find((a) => a.integration_id === integration.id) ?? null),
  );
}

export async function getIntegration(clientId: string, provider: IntegrationProvider): Promise<PublicIntegration | null> {
  const { data: integration, error } = await supabaseAdmin
    .from('integrations')
    .select('*')
    .eq('client_id', clientId)
    .eq('provider', provider)
    .maybeSingle();
  if (error) throw error;
  if (!integration) return null;

  const account = await getPrimaryAccount(integration.id);
  return toPublicIntegration(integration, account);
}

export async function getIntegrationIdForClientProvider(clientId: string, provider: IntegrationProvider): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('integrations')
    .select('id')
    .eq('client_id', clientId)
    .eq('provider', provider)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

/**
 * Ensures an `integrations` row exists for this client+provider (created in
 * 'disconnected' status if missing) and returns its id. Every connect flow
 * needs this before it can store credentials, since secrets.integration_credentials
 * is keyed by integration_id.
 */
export async function ensureIntegration(clientId: string, provider: IntegrationProvider): Promise<string> {
  const existingId = await getIntegrationIdForClientProvider(clientId, provider);
  if (existingId) return existingId;

  const { data, error } = await supabaseAdmin
    .from('integrations')
    .insert({ client_id: clientId, provider, status: 'disconnected' })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

/**
 * Internal-only: fetches and decrypts credentials for a sync job via the
 * get_integration_credentials() bridge function (secrets.integration_credentials
 * is not exposed through the Data API - see supabase/migrations note in
 * ARCHITECTURE.md). NEVER call this from a route handler that serializes its
 * return value directly into an HTTP response.
 */
export async function getDecryptedCredentials<T = Record<string, unknown>>(
  clientId: string,
  provider: IntegrationProvider,
): Promise<{ integrationId: string; integrationAccountId: string | null; externalAccountId: string | null; credentials: T } | null> {
  const integrationId = await getIntegrationIdForClientProvider(clientId, provider);
  if (!integrationId) return null;

  const { data, error } = await supabaseAdmin.rpc('get_integration_credentials', { p_integration_id: integrationId });
  if (error) throw error;

  const row = data?.[0];
  if (!row || !row.encrypted_access_token_b64) return null;

  // encrypted_access_token_b64 holds our base64 ciphertext directly;
  // iv/authTag/algo are packed into metadata (see utils/crypto.ts).
  const meta = (row.metadata ?? {}) as { iv?: string; authTag?: string; algo?: string };
  if (!meta.iv || !meta.authTag) return null;

  const credentials = decryptCredentials<T>({
    ciphertext: row.encrypted_access_token_b64,
    iv: meta.iv,
    authTag: meta.authTag,
    algo: 'aes-256-gcm',
  });

  const account = await getPrimaryAccount(integrationId);
  return {
    integrationId,
    integrationAccountId: account?.id ?? null,
    externalAccountId: account?.external_account_id ?? null,
    credentials,
  };
}

async function storeCredentials(integrationId: string, credentials: Record<string, unknown>, tokenExpiresAt: string | null): Promise<void> {
  const encrypted = encryptCredentials(credentials);

  const { error } = await supabaseAdmin.rpc('upsert_integration_credentials', {
    p_integration_id: integrationId,
    p_encrypted_access_token_b64: encrypted.ciphertext,
    p_encrypted_refresh_token_b64: undefined,
    p_expires_at: tokenExpiresAt ?? undefined,
    p_scopes: undefined,
    p_metadata: { iv: encrypted.iv, authTag: encrypted.authTag, algo: encrypted.algo },
  });
  if (error) throw error;
}

export interface UpsertIntegrationInput {
  clientId: string;
  provider: IntegrationProvider;
  credentials: Record<string, unknown>;
  externalAccountId?: string | null;
  externalAccountName?: string | null;
  tokenExpiresAt?: string | null;
  status?: IntegrationStatus;
}

/**
 * Stores/refreshes credentials for a client+provider and, if an account id
 * is provided, links (or relinks) the integration_accounts row. Returns the
 * public-safe integration view. Two-step OAuth connects call this twice:
 * once with just credentials (account left null), once more with the
 * chosen externalAccountId - see services/integrationService.ts.
 */
export async function upsertIntegrationConnection(input: UpsertIntegrationInput): Promise<PublicIntegration> {
  const integrationId = await ensureIntegration(input.clientId, input.provider);

  await storeCredentials(integrationId, input.credentials, input.tokenExpiresAt ?? null);

  let account: IntegrationAccountRow | null = null;
  if (input.externalAccountId) {
    const { data, error } = await supabaseAdmin
      .from('integration_accounts')
      .upsert(
        {
          integration_id: integrationId,
          external_account_id: input.externalAccountId,
          account_name: input.externalAccountName ?? null,
          status: 'active',
        },
        { onConflict: 'integration_id,external_account_id' },
      )
      .select('*')
      .single();
    if (error) throw error;
    account = data;
  }

  const { data: integration, error: updateError } = await supabaseAdmin
    .from('integrations')
    .update({ status: input.status ?? (account ? 'connected' : 'disconnected') })
    .eq('id', integrationId)
    .select('*')
    .single();
  if (updateError) throw updateError;

  return toPublicIntegration(integration, account);
}

export async function updateIntegrationStatus(
  clientId: string,
  provider: IntegrationProvider,
  update: { status: IntegrationStatus; lastSyncAt?: string | null },
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('integrations')
    .update({
      status: update.status,
      ...(update.lastSyncAt !== undefined ? { last_sync_at: update.lastSyncAt } : {}),
    })
    .eq('client_id', clientId)
    .eq('provider', provider);
  if (error) throw error;
}

export async function refreshIntegrationCredentials(
  clientId: string,
  provider: IntegrationProvider,
  credentials: Record<string, unknown>,
  tokenExpiresAt: string | null,
): Promise<void> {
  const integrationId = await getIntegrationIdForClientProvider(clientId, provider);
  if (!integrationId) throw new Error(`No integration row for client=${clientId} provider=${provider}`);
  await storeCredentials(integrationId, credentials, tokenExpiresAt);
  await updateIntegrationStatus(clientId, provider, { status: 'connected' });
}

export async function disconnectIntegration(clientId: string, provider: IntegrationProvider): Promise<void> {
  const integrationId = await getIntegrationIdForClientProvider(clientId, provider);
  if (!integrationId) return;

  const { error: clearError } = await supabaseAdmin.rpc('clear_integration_credentials', { p_integration_id: integrationId });
  if (clearError) throw clearError;

  const { error } = await supabaseAdmin.from('integrations').update({ status: 'disconnected' }).eq('id', integrationId);
  if (error) throw error;
}
