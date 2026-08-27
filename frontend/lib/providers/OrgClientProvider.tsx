'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getMyOrganizations, getOrganizationClients } from '../api/organizations';
import { useAuth } from './AuthProvider';
import type { Client, Organization, OrgRole } from '../types/api';

const STORAGE_KEY_ORG = 'prepq.selectedOrgId';
const STORAGE_KEY_CLIENT = 'prepq.selectedClientId';

interface OrgClientContextValue {
  organizations: Array<{ organization: Organization; role: OrgRole }>;
  clients: Client[];
  selectedOrgId: string | null;
  selectedClientId: string | null;
  selectedClient: Client | null;
  selectedRole: OrgRole | null;
  setSelectedOrgId: (id: string) => void;
  setSelectedClientId: (id: string) => void;
  isLoading: boolean;
  isError: boolean;
}

const OrgClientContext = createContext<OrgClientContextValue | null>(null);

/**
 * Resolves organization membership and accessible clients after login (spec
 * §3), and lets the user switch clients without logging out (spec §4).
 * Selection is a client-side convenience only, persisted to localStorage -
 * it is NEVER the security boundary. Every API call still carries the
 * selected client_id to the backend, which re-validates membership/RLS on
 * every request regardless of what the frontend last had selected - see
 * backend/ARCHITECTURE.md.
 */
export function OrgClientProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [selectedOrgId, setSelectedOrgIdState] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientIdState] = useState<string | null>(null);

  const orgsQuery = useQuery({
    queryKey: ['organizations', user?.id],
    queryFn: getMyOrganizations,
    enabled: !!user,
  });

  const organizations = useMemo(() => orgsQuery.data?.organizations ?? [], [orgsQuery.data]);

  useEffect(() => {
    if (selectedOrgId || organizations.length === 0) return;
    const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY_ORG) : null;
    const restored = stored && organizations.some((m) => m.organization.id === stored) ? stored : organizations[0]!.organization.id;
    setSelectedOrgIdState(restored);
  }, [organizations, selectedOrgId]);

  const clientsQuery = useQuery({
    queryKey: ['organizationClients', selectedOrgId],
    queryFn: () => getOrganizationClients(selectedOrgId!),
    enabled: !!selectedOrgId,
  });

  const clients = useMemo(() => clientsQuery.data?.clients ?? [], [clientsQuery.data]);

  useEffect(() => {
    if (clients.length === 0) return;
    const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY_CLIENT) : null;
    const stillValid = selectedClientId && clients.some((c) => c.id === selectedClientId);
    if (stillValid) return;
    const restored = stored && clients.some((c) => c.id === stored) ? stored : clients[0]!.id;
    setSelectedClientIdState(restored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients]);

  const setSelectedOrgId = useCallback((id: string) => {
    setSelectedOrgIdState(id);
    setSelectedClientIdState(null); // force re-resolution against the new org's client list
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY_ORG, id);
  }, []);

  const setSelectedClientId = useCallback((id: string) => {
    setSelectedClientIdState(id);
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY_CLIENT, id);
  }, []);

  const selectedClient = clients.find((c) => c.id === selectedClientId) ?? null;
  const selectedRole = organizations.find((m) => m.organization.id === selectedOrgId)?.role ?? null;

  const value: OrgClientContextValue = {
    organizations,
    clients,
    selectedOrgId,
    selectedClientId,
    selectedClient,
    selectedRole,
    setSelectedOrgId,
    setSelectedClientId,
    isLoading: orgsQuery.isLoading || clientsQuery.isLoading,
    isError: orgsQuery.isError || clientsQuery.isError,
  };

  return <OrgClientContext.Provider value={value}>{children}</OrgClientContext.Provider>;
}

export function useOrgClient(): OrgClientContextValue {
  const ctx = useContext(OrgClientContext);
  if (!ctx) throw new Error('useOrgClient must be used within OrgClientProvider');
  return ctx;
}
