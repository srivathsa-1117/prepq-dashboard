import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, requireClientAccess, requireRole } from '../../auth/middleware.js';
import { highestRoleFor } from '../../auth/rbac.js';
import { createClientForOrganization, getClient, addClientAccess, removeClientAccess } from '../../services/clientService.js';
import { uuidSchema } from '../../validators/common.schemas.js';
import { ORG_ROLES, type ClientRole } from '../../types/domain.js';
import { ForbiddenError } from '../../utils/errors.js';

const createClientSchema = z.object({
  organization_id: uuidSchema,
  name: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, 'slug must be lowercase letters, numbers, and hyphens'),
  timezone: z.string().optional(),
});

const grantAccessSchema = z.object({ user_id: uuidSchema, role: z.enum(ORG_ROLES as [string, ...string[]]) });

export default async function clientRoutes(app: FastifyInstance) {
  app.post('/api/clients', { preHandler: [authenticate] }, async (request, reply) => {
    const body = createClientSchema.parse(request.body);
    const role = highestRoleFor(request.auth!, body.organization_id);
    if (!role) throw new ForbiddenError('You are not a member of this organization');

    const client = await createClientForOrganization({
      organizationId: body.organization_id,
      name: body.name,
      slug: body.slug,
      timezone: body.timezone,
      requestingRole: role,
    });

    reply.status(201).send({ client });
  });

  app.get(
    '/api/clients/:clientId',
    { preHandler: [authenticate, requireClientAccess()] },
    async (request) => {
      const client = await getClient(request.clientScope!.clientId);
      return { client };
    },
  );

  app.post(
    '/api/clients/:clientId/access',
    { preHandler: [authenticate, requireClientAccess(), requireRole('admin')] },
    async (request, reply) => {
      const body = grantAccessSchema.parse(request.body);
      await addClientAccess(request.clientScope!.clientId, body.user_id, body.role as ClientRole);
      reply.status(204).send();
    },
  );

  app.delete(
    '/api/clients/:clientId/access/:userId',
    { preHandler: [authenticate, requireClientAccess(), requireRole('admin')] },
    async (request, reply) => {
      const { userId } = request.params as { userId: string };
      await removeClientAccess(request.clientScope!.clientId, uuidSchema.parse(userId));
      reply.status(204).send();
    },
  );
}
