import { listOrganizationsForUser, getOrganizationById } from '../repositories/organizationsRepo.js';
import { listClientsForOrganization } from '../repositories/clientsRepo.js';
import { highestRoleFor } from '../auth/rbac.js';
import type { AuthContext } from '../types/domain.js';
import { ForbiddenError, NotFoundError } from '../utils/errors.js';

export async function getMyOrganizations(userId: string) {
  return listOrganizationsForUser(userId);
}

export async function getOrganizationClients(auth: AuthContext, organizationId: string) {
  const org = await getOrganizationById(organizationId);
  if (!org) throw new NotFoundError('Organization not found');

  const role = highestRoleFor(auth, organizationId);
  if (!role) throw new ForbiddenError('You are not a member of this organization');

  return listClientsForOrganization(organizationId);
}
