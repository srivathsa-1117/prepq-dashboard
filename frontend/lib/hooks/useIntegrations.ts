'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as integrationsApi from '../api/integrations';
import * as syncApi from '../api/sync';
import type { IntegrationProvider } from '../types/api';

export function useIntegrations(clientId: string | null) {
  return useQuery({
    queryKey: ['integrations', clientId],
    queryFn: () => integrationsApi.listIntegrations(clientId!),
    enabled: !!clientId,
  });
}

export function useIntegrationStatus(clientId: string | null, provider: IntegrationProvider) {
  return useQuery({
    queryKey: ['integrationStatus', clientId, provider],
    queryFn: () => integrationsApi.getIntegrationStatus(clientId!, provider),
    enabled: !!clientId,
  });
}

export function useAvailableAccounts(clientId: string | null, provider: IntegrationProvider, enabled: boolean) {
  return useQuery({
    queryKey: ['availableAccounts', clientId, provider],
    queryFn: () => integrationsApi.listAvailableAccounts(clientId!, provider),
    enabled: !!clientId && enabled,
  });
}

function useInvalidateIntegrations(clientId: string | null) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['integrations', clientId] });
    queryClient.invalidateQueries({ queryKey: ['integrationStatus', clientId] });
    queryClient.invalidateQueries({ queryKey: ['syncStatus', clientId] });
  };
}

export function useConnectIntegration(clientId: string | null) {
  const invalidate = useInvalidateIntegrations(clientId);
  return useMutation({
    mutationFn: ({ provider, input }: { provider: IntegrationProvider; input: integrationsApi.ConnectIntegrationInput }) =>
      integrationsApi.connectIntegration(clientId!, provider, input),
    onSuccess: invalidate,
  });
}

export function useDisconnectIntegration(clientId: string | null) {
  const invalidate = useInvalidateIntegrations(clientId);
  return useMutation({
    mutationFn: (provider: IntegrationProvider) => integrationsApi.disconnectIntegration(clientId!, provider),
    onSuccess: invalidate,
  });
}

export function useTestIntegration(clientId: string | null) {
  return useMutation({
    mutationFn: (provider: IntegrationProvider) => integrationsApi.testIntegration(clientId!, provider),
  });
}

export function useTriggerSync(clientId: string | null) {
  const invalidate = useInvalidateIntegrations(clientId);
  return useMutation({
    mutationFn: (provider: IntegrationProvider) => syncApi.triggerManualSync(clientId!, provider),
    onSuccess: invalidate,
  });
}

/** Mutation rather than a query - only fires when the user clicks "Connect", since it's about to redirect the whole page away. */
export function useAuthorizationUrl(clientId: string | null) {
  return useMutation({
    mutationFn: (provider: IntegrationProvider) => integrationsApi.getAuthorizationUrl(clientId!, provider),
  });
}

export function useCompleteOAuthConnect() {
  return useMutation({
    mutationFn: ({ code, state }: { code: string; state: string }) => integrationsApi.completeOAuthConnect(code, state),
  });
}
