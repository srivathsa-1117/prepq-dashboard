import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getClientById: vi.fn(),
  listClientMemberships: vi.fn(),
}));

vi.mock('../../../src/repositories/clientsRepo.js', () => ({
  getClientById: mocks.getClientById,
  listClientMemberships: mocks.listClientMemberships,
}));

const { assertClientAccess } = await import('../../../src/auth/rbac.js');
const { ForbiddenError, NotFoundError } = await import('../../../src/utils/errors.js');

import type { AuthContext } from '../../../src/types/domain.js';

const CLIENT_A = { id: 'client-a', organizationId: 'org-1', name: 'PrepQ', slug: 'prepq', status: 'active', timezone: 'UTC', createdAt: '', updatedAt: '' };
const CLIENT_B = { id: 'client-b', organizationId: 'org-2', name: 'OtherCo', slug: 'otherco', status: 'active', timezone: 'UTC', createdAt: '', updatedAt: '' };

describe('tenant isolation (assertClientAccess)', () => {
  beforeEach(() => {
    mocks.getClientById.mockReset();
    mocks.listClientMemberships.mockReset();
  });

  it('grants an org owner implicit admin-level access to any client in their organization', async () => {
    mocks.getClientById.mockResolvedValue(CLIENT_A);
    const auth: AuthContext = { userId: 'u1', email: null, memberships: [{ organizationId: 'org-1', role: 'owner' }] };

    const scope = await assertClientAccess(auth, 'client-a');
    expect(scope).toEqual({ organizationId: 'org-1', role: 'admin' });
    expect(mocks.listClientMemberships).not.toHaveBeenCalled();
  });

  it('grants an org admin the same implicit access, without needing a client_members row', async () => {
    mocks.getClientById.mockResolvedValue(CLIENT_A);
    const auth: AuthContext = { userId: 'u1', email: null, memberships: [{ organizationId: 'org-1', role: 'admin' }] };

    const scope = await assertClientAccess(auth, 'client-a');
    expect(scope.role).toBe('admin');
    expect(mocks.listClientMemberships).not.toHaveBeenCalled();
  });

  it('does NOT grant an org manager implicit access - only owner/admin are implicit (matches the database\'s own is_org_admin check)', async () => {
    mocks.getClientById.mockResolvedValue(CLIENT_A);
    mocks.listClientMemberships.mockResolvedValue([]); // no explicit grant
    const auth: AuthContext = { userId: 'u1', email: null, memberships: [{ organizationId: 'org-1', role: 'manager' }] };

    await expect(assertClientAccess(auth, 'client-a')).rejects.toThrow(ForbiddenError);
  });

  it('rejects a user who is not a member of the client organization at all', async () => {
    mocks.getClientById.mockResolvedValue(CLIENT_B);
    const auth: AuthContext = { userId: 'u1', email: null, memberships: [{ organizationId: 'org-1', role: 'owner' }] };

    await expect(assertClientAccess(auth, 'client-b')).rejects.toThrow(ForbiddenError);
  });

  it('rejects an analyst without an explicit client_members grant, even in the right organization', async () => {
    mocks.getClientById.mockResolvedValue(CLIENT_A);
    mocks.listClientMemberships.mockResolvedValue([]); // no grants
    const auth: AuthContext = { userId: 'u1', email: null, memberships: [{ organizationId: 'org-1', role: 'analyst' }] };

    await expect(assertClientAccess(auth, 'client-a')).rejects.toThrow(ForbiddenError);
  });

  it('grants an analyst access with their client_members role once a grant exists', async () => {
    mocks.getClientById.mockResolvedValue(CLIENT_A);
    mocks.listClientMemberships.mockResolvedValue([{ clientId: 'client-a', role: 'analyst' }]);
    const auth: AuthContext = { userId: 'u1', email: null, memberships: [{ organizationId: 'org-1', role: 'analyst' }] };

    const scope = await assertClientAccess(auth, 'client-a');
    expect(scope.role).toBe('analyst');
  });

  it('never leaks a grant scoped to one client into access for a different client', async () => {
    mocks.getClientById.mockResolvedValue(CLIENT_A);
    mocks.listClientMemberships.mockResolvedValue([{ clientId: 'some-other-client', role: 'admin' }]); // grant for a DIFFERENT client id
    const auth: AuthContext = { userId: 'u1', email: null, memberships: [{ organizationId: 'org-1', role: 'viewer' }] };

    await expect(assertClientAccess(auth, 'client-a')).rejects.toThrow(ForbiddenError);
  });

  it('throws NotFoundError for a client id that does not exist, without leaking whether it exists in another org', async () => {
    mocks.getClientById.mockResolvedValue(null);
    const auth: AuthContext = { userId: 'u1', email: null, memberships: [{ organizationId: 'org-1', role: 'owner' }] };

    await expect(assertClientAccess(auth, 'does-not-exist')).rejects.toThrow(NotFoundError);
  });
});
