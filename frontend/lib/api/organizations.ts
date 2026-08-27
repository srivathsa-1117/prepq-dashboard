import { apiFetch } from './client';
import type { Client, OrganizationMembership } from '../types/api';

export function getMyOrganizations() {
  return apiFetch<{ organizations: OrganizationMembership[] }>('/api/organizations');
}

export function getOrganizationClients(organizationId: string) {
  return apiFetch<{ clients: Client[] }>(`/api/organizations/${organizationId}/clients`);
}

export function getClient(clientId: string) {
  return apiFetch<{ client: Client }>(`/api/clients/${clientId}`);
}
