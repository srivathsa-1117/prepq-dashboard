import type { FastifyReply, FastifyRequest } from 'fastify';
import { verifyAccessToken } from './supabaseAuth.js';
import { assertClientAccess, assertRole } from './rbac.js';
import type { AuthContext, ClientScope, OrgRole } from '../types/domain.js';
import { UnauthorizedError, ValidationError } from '../utils/errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
    clientScope?: ClientScope;
  }
}

/** Verifies the Authorization header and attaches request.auth. Register as a preHandler on every protected route. */
export async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization;
  if (!header) {
    throw new UnauthorizedError('Missing Authorization header');
  }
  request.auth = await verifyAccessToken(header);
}

/**
 * Resolves client_id from the request (route params, then query string),
 * asserts the authenticated user can access it, and attaches
 * request.clientScope. Every client-scoped route uses this - it is the
 * enforcement point that makes "never allow a request to retrieve another
 * client's data" true for every handler, not just the ones that remember.
 */
export function requireClientAccess(options: { paramName?: string } = {}) {
  const paramName = options.paramName ?? 'clientId';

  return async function (request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    if (!request.auth) {
      throw new UnauthorizedError();
    }

    const params = request.params as Record<string, string | undefined>;
    const query = request.query as Record<string, string | undefined>;
    // POST/PATCH mutations (connect, disconnect, refresh, test, manual sync, schedule updates)
    // send client_id in the JSON body rather than the URL - Fastify has already parsed it by
    // the time preHandlers run, so it's a safe third source here alongside params/query.
    const body = request.body as Record<string, unknown> | undefined;
    const bodyClientId = typeof body?.['client_id'] === 'string' ? (body['client_id'] as string) : undefined;
    const clientId = params[paramName] ?? query['client_id'] ?? query[paramName] ?? bodyClientId;

    if (!clientId) {
      throw new ValidationError(`Missing required client id (${paramName} param, client_id query param, or client_id body field)`);
    }

    const { organizationId, role } = await assertClientAccess(request.auth, clientId);
    request.clientScope = { clientId, organizationId, role };
  };
}

/** Requires the resolved clientScope role to be at least `minimum`. Chain after requireClientAccess(). */
export function requireRole(minimum: OrgRole) {
  return async function (request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    if (!request.clientScope) {
      throw new UnauthorizedError('requireRole must run after requireClientAccess');
    }
    assertRole(request.clientScope.role, minimum);
  };
}
