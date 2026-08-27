import type { AuthContext, ClientRole, OrgRole } from '../types/domain.js';
import { getClientById } from '../repositories/clientsRepo.js';
import { listClientMemberships } from '../repositories/clientsRepo.js';
import { ForbiddenError, NotFoundError } from '../utils/errors.js';

/** Higher number = more privileged. Used for "at least manager" style checks. */
const ROLE_RANK: Record<OrgRole, number> = {
  viewer: 0,
  analyst: 1,
  manager: 2,
  admin: 3,
  owner: 4,
};

export function roleAtLeast(role: OrgRole, minimum: OrgRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export function highestRoleFor(auth: AuthContext, organizationId: string): OrgRole | null {
  const roles = auth.memberships.filter((m) => m.organizationId === organizationId).map((m) => m.role);
  if (roles.length === 0) return null;
  return roles.reduce((best, r) => (ROLE_RANK[r] > ROLE_RANK[best] ? r : best));
}

/**
 * Resolves whether the authenticated user may access a given client, and
 * with what role. Mirrors the database's own `has_client_access` /
 * `has_client_write_access` SECURITY DEFINER functions exactly (see
 * ARCHITECTURE.md): an org owner/admin implicitly has full ('admin'-level)
 * access to every client in their organization; everyone else needs an
 * explicit client_members row, and THAT row's role - not their org role -
 * is what applies for this client.
 */
export async function assertClientAccess(auth: AuthContext, clientId: string): Promise<{ organizationId: string; role: ClientRole }> {
  const client = await getClientById(clientId);
  if (!client) {
    throw new NotFoundError('Client not found');
  }

  const orgRole = highestRoleFor(auth, client.organizationId);
  if (!orgRole) {
    throw new ForbiddenError('You are not a member of this client’s organization');
  }

  // Org owner/admin: implicit access, treated as 'admin' for this client
  // (matches has_client_access's is_org_admin(...) branch).
  if (orgRole === 'owner' || orgRole === 'admin') {
    return { organizationId: client.organizationId, role: 'admin' };
  }

  const memberships = await listClientMemberships(auth.userId);
  const membership = memberships.find((m) => m.clientId === clientId);
  if (!membership) {
    throw new ForbiddenError('You do not have access to this client');
  }

  return { organizationId: client.organizationId, role: membership.role };
}

export function assertRole(role: OrgRole, minimum: OrgRole): void {
  if (!roleAtLeast(role, minimum)) {
    throw new ForbiddenError(`Requires role "${minimum}" or higher, you have "${role}"`);
  }
}
