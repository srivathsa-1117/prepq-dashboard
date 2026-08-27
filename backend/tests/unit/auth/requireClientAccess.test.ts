import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';

const mocks = vi.hoisted(() => ({
  getClientById: vi.fn(),
  listClientMemberships: vi.fn(),
}));

vi.mock('../../../src/repositories/clientsRepo.js', () => ({
  getClientById: mocks.getClientById,
  listClientMemberships: mocks.listClientMemberships,
}));

const { requireClientAccess } = await import('../../../src/auth/middleware.js');
const { ValidationError } = await import('../../../src/utils/errors.js');
import type { AuthContext } from '../../../src/types/domain.js';

const CLIENT_A = { id: 'client-a', organizationId: 'org-1', name: 'PrepQ', slug: 'prepq', status: 'active', timezone: 'UTC', createdAt: '', updatedAt: '' };
const AUTH: AuthContext = { userId: 'u1', email: null, memberships: [{ organizationId: 'org-1', role: 'owner' }] };
const NOOP_REPLY = {} as FastifyReply;

function makeRequest(overrides: Partial<{ params: object; query: object; body: object }>): FastifyRequest {
  return {
    auth: AUTH,
    params: overrides.params ?? {},
    query: overrides.query ?? {},
    body: overrides.body,
  } as unknown as FastifyRequest;
}

/**
 * Mutating routes (connect/disconnect/refresh/test/manual-sync/schedule) send client_id in the
 * JSON body, not the URL - a regression here silently 400s every one of those buttons in the
 * IntegrationsDrawer even though GET routes (which use query params) keep working fine. See
 * api/routes/integrations.routes.ts and lib/api/integrations.ts on the frontend.
 */
describe('requireClientAccess', () => {
  beforeEach(() => {
    mocks.getClientById.mockReset();
    mocks.listClientMemberships.mockReset();
    mocks.getClientById.mockResolvedValue(CLIENT_A);
  });

  it('resolves client_id from the request body when it is absent from params and query', async () => {
    const request = makeRequest({ body: { client_id: 'client-a' } });
    await requireClientAccess()(request, NOOP_REPLY);
    expect(request.clientScope).toEqual({ clientId: 'client-a', organizationId: 'org-1', role: 'admin' });
  });

  it('prefers the route param over query and body when multiple sources are present', async () => {
    const request = makeRequest({ params: { clientId: 'client-a' }, query: { client_id: 'client-b' }, body: { client_id: 'client-c' } });
    await requireClientAccess()(request, NOOP_REPLY);
    expect(request.clientScope?.clientId).toBe('client-a');
  });

  it('prefers the query string over the body', async () => {
    const request = makeRequest({ query: { client_id: 'client-a' }, body: { client_id: 'client-b' } });
    await requireClientAccess()(request, NOOP_REPLY);
    expect(request.clientScope?.clientId).toBe('client-a');
  });

  it('throws ValidationError when client_id is missing from params, query, and body', async () => {
    const request = makeRequest({});
    await expect(requireClientAccess()(request, NOOP_REPLY)).rejects.toThrow(ValidationError);
  });

  it('ignores a non-string client_id in the body rather than throwing a type error', async () => {
    const request = makeRequest({ body: { client_id: 12345 } });
    await expect(requireClientAccess()(request, NOOP_REPLY)).rejects.toThrow(ValidationError);
  });

  it('handles a request with no body at all (GET requests)', async () => {
    const request = makeRequest({ query: { client_id: 'client-a' } });
    await requireClientAccess()(request, NOOP_REPLY);
    expect(request.clientScope?.clientId).toBe('client-a');
  });
});
