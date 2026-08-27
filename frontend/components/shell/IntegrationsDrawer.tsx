'use client';

import { ExternalLink, CheckCircle2, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useOrgClient } from '@/lib/providers/OrgClientProvider';
import {
  useIntegrationStatus,
  useConnectIntegration,
  useDisconnectIntegration,
  useTestIntegration,
  useTriggerSync,
  useAuthorizationUrl,
} from '@/lib/hooks/useIntegrations';
import { formatDateTime } from '@/lib/utils/format';
import { ApiError } from '@/lib/api/client';
import type { IntegrationPhase, IntegrationProvider } from '@/lib/types/api';
import { useState } from 'react';

const PROVIDERS: Array<{ id: IntegrationProvider; label: string; kind: 'oauth' | 'apikey' }> = [
  { id: 'meta', label: 'Meta Ads', kind: 'oauth' },
  { id: 'google_ads', label: 'Google Ads', kind: 'oauth' },
  { id: 'meritto', label: 'Meritto CRM', kind: 'apikey' },
];

const PHASE_BADGE: Record<IntegrationPhase, { label: string; variant: 'good' | 'bad' | 'warning' | 'default' }> = {
  connected: { label: 'Connected', variant: 'good' },
  disconnected: { label: 'Not connected', variant: 'default' },
  error: { label: 'Error', variant: 'bad' },
  paused: { label: 'Paused', variant: 'warning' },
  // V1: the backend auto-finalizes to a pre-configured account (see
  // services/integrationService.ts::defaultAccountIdFor), so this phase should never actually be
  // reached in practice - it's only possible if a provider's default account id isn't configured.
  pending_account_selection: { label: 'Needs setup', variant: 'warning' },
};

/**
 * Integration management lives as a drawer off the header/settings control,
 * not a fourth product page (spec §2/§17). Covers connect (real Meta/Google
 * OAuth redirect, or API key/secret for Meritto) / disconnect / test / manual
 * sync. `defaultProvider` lets app/integrations/callback land the user back
 * on the tab they were connecting after the OAuth round-trip.
 */
export function IntegrationsDrawer({
  open,
  onOpenChange,
  defaultProvider,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultProvider?: IntegrationProvider;
}) {
  const { selectedClientId } = useOrgClient();
  const [activeTab, setActiveTab] = useState<IntegrationProvider>(defaultProvider ?? 'meta');

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (next && defaultProvider) setActiveTab(defaultProvider);
      }}
    >
      <SheetContent side="right" className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Integrations</SheetTitle>
          <SheetDescription>Connect Meta, Google Ads, and Meritto to power this client&apos;s reporting.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {!selectedClientId ? (
            <p className="text-sm text-muted-foreground">Select a client first.</p>
          ) : (
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as IntegrationProvider)}>
              <TabsList className="grid w-full grid-cols-3">
                {PROVIDERS.map((p) => (
                  <TabsTrigger key={p.id} value={p.id}>
                    {p.label.split(' ')[0]}
                  </TabsTrigger>
                ))}
              </TabsList>
              {PROVIDERS.map((p) => (
                <TabsContent key={p.id} value={p.id}>
                  <ProviderPanel provider={p.id} label={p.label} kind={p.kind} clientId={selectedClientId} />
                </TabsContent>
              ))}
            </Tabs>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ProviderPanel({ provider, label, kind, clientId }: { provider: IntegrationProvider; label: string; kind: 'oauth' | 'apikey'; clientId: string }) {
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [metaToken, setMetaToken] = useState('');
  const [metaAccountId, setMetaAccountId] = useState('');

  const { data: statusData, isLoading } = useIntegrationStatus(clientId, provider);
  const connect = useConnectIntegration(clientId);
  const disconnect = useDisconnectIntegration(clientId);
  const test = useTestIntegration(clientId);
  const sync = useTriggerSync(clientId);
  const authorizeUrl = useAuthorizationUrl(clientId);

  const phase = statusData?.phase ?? 'disconnected';
  const integration = statusData?.integration ?? null;
  const badge = PHASE_BADGE[phase];

  function handleConnectOAuth() {
    // .mutate (not mutateAsync) - errors surface reactively via authorizeUrl.isError below;
    // awaiting mutateAsync without a catch here left an unhandled rejection on every failure
    // (e.g. missing META_APP_ID), which is what was throwing the Next.js dev error overlay.
    authorizeUrl.mutate(provider, {
      onSuccess: ({ url }) => {
        window.location.href = url; // full-page redirect to the real Meta/Google consent screen
      },
    });
  }

  function handleConnectApiKey() {
    connect.mutate(
      { provider, input: { api_key: apiKey, api_secret: apiSecret } },
      {
        onSuccess: () => {
          setApiKey('');
          setApiSecret('');
        },
      },
    );
  }

  // Meta-only: connect with a system user access token (Business Settings > System Users >
  // Generate New Token) instead of the OAuth redirect - skips Meta's consent screen entirely,
  // and a Business-app token can be set to never expire. Backend: integrationService.ts's
  // apiKey-without-authorizationCode branch for the meta provider.
  function handleConnectMetaToken() {
    connect.mutate(
      { provider, input: { api_key: metaToken, external_account_id: metaAccountId || undefined } },
      {
        onSuccess: () => {
          setMetaToken('');
          setMetaAccountId('');
        },
      },
    );
  }

  if (isLoading) return <p className="py-6 text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="flex flex-col gap-4 py-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">{label}</p>
          {integration?.externalAccountName && <p className="text-xs text-muted-foreground">{integration.externalAccountName}</p>}
        </div>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>

      {integration?.lastSyncAt && <p className="text-xs text-muted-foreground">Last synced {formatDateTime(integration.lastSyncAt)}</p>}

      <Separator />

      {phase === 'disconnected' && kind === 'oauth' && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">Redirects to {label.split(' ')[0]} to sign in and grant read access to ad accounts.</p>
          <Button size="sm" className="w-fit gap-1.5" disabled={authorizeUrl.isPending} onClick={handleConnectOAuth}>
            {authorizeUrl.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
            Connect with {label.split(' ')[0]}
          </Button>
          {authorizeUrl.isError && (
            <p className="text-xs text-critical">
              {authorizeUrl.error instanceof ApiError ? authorizeUrl.error.message : 'Could not start the connection.'}
            </p>
          )}

          {provider === 'meta' && (
            <>
              <div className="my-1 flex items-center gap-2">
                <Separator className="flex-1" />
                <span className="text-[10px] uppercase text-muted-foreground">or</span>
                <Separator className="flex-1" />
              </div>
              <Label htmlFor="meta-token">System user access token</Label>
              <Input id="meta-token" type="password" value={metaToken} onChange={(e) => setMetaToken(e.target.value)} />
              <Label htmlFor="meta-account-id">Ad account id (e.g. act_123...) - optional if a server default is configured</Label>
              <Input id="meta-account-id" value={metaAccountId} onChange={(e) => setMetaAccountId(e.target.value)} />
              <Button size="sm" className="mt-1 w-fit" variant="outline" disabled={connect.isPending || !metaToken} onClick={handleConnectMetaToken}>
                {connect.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Connect with token
              </Button>
              {connect.isError && (
                <p className="text-xs text-critical">{connect.error instanceof ApiError ? connect.error.message : 'Could not connect.'}</p>
              )}
            </>
          )}
        </div>
      )}

      {phase === 'disconnected' && kind === 'apikey' && (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${provider}-key`}>API key</Label>
          <Input id={`${provider}-key`} value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          <Label htmlFor={`${provider}-secret`}>API secret</Label>
          <Input id={`${provider}-secret`} type="password" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} />
          <Button size="sm" className="mt-1 self-start" disabled={connect.isPending || !apiKey || !apiSecret} onClick={handleConnectApiKey}>
            {connect.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Connect
          </Button>
          {connect.isError && (
            <p className="text-xs text-critical">{connect.error instanceof ApiError ? connect.error.message : 'Could not connect.'}</p>
          )}
        </div>
      )}

      {phase === 'pending_account_selection' && (
        <p className="text-xs text-critical">
          No default account is configured for {label} on this server yet - contact an admin ({provider === 'meta' ? 'META' : 'GOOGLE_ADS'}
          _DEFAULT_
          {provider === 'meta' ? 'AD_ACCOUNT_ID' : 'CUSTOMER_ID'} in backend/.env).
        </p>
      )}

      {phase === 'connected' && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={sync.isPending} onClick={() => sync.mutate(provider)}>
            {sync.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Sync now
          </Button>
          <Button size="sm" variant="outline" disabled={test.isPending} onClick={() => test.mutate(provider)}>
            {test.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Test connection
          </Button>
          <Button size="sm" variant="destructive" disabled={disconnect.isPending} onClick={() => disconnect.mutate(provider)}>
            {disconnect.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
            Disconnect
          </Button>
        </div>
      )}

      {(phase === 'error' || phase === 'paused') && (
        <Button size="sm" variant="destructive" disabled={disconnect.isPending} onClick={() => disconnect.mutate(provider)}>
          {disconnect.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
          Disconnect
        </Button>
      )}

      {test.data && (
        <p className={`text-xs ${test.data.ok ? 'text-good' : 'text-critical'}`}>{test.data.ok ? 'Connection OK' : test.data.message ?? 'Test failed'}</p>
      )}
    </div>
  );
}
