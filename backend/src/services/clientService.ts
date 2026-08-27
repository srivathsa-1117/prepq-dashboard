import { createClient as createClientRepo, getClientById, grantClientAccess, revokeClientAccess } from '../repositories/clientsRepo.js';
import { assertRole } from '../auth/rbac.js';
import type { ClientRole, OrgRole } from '../types/domain.js';

export async function createClientForOrganization(input: {
  organizationId: string;
  name: string;
  slug: string;
  timezone?: string;
  requestingRole: OrgRole;
}) {
  assertRole(input.requestingRole, 'admin');

  // No sync schedule is registered here - sync_jobs.integration_id is NOT
  // NULL, so a schedule can't exist until a provider is actually connected.
  // See services/integrationService.ts::registerScheduleOnConnect.
  return createClientRepo({
    organizationId: input.organizationId,
    name: input.name,
    slug: input.slug,
    timezone: input.timezone,
  });
}

export async function getClient(clientId: string) {
  return getClientById(clientId);
}

export async function addClientAccess(clientId: string, userId: string, role: ClientRole) {
  await grantClientAccess(clientId, userId, role);
}

export async function removeClientAccess(clientId: string, userId: string) {
  await revokeClientAccess(clientId, userId);
}
