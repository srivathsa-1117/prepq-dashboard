import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../auth/middleware.js';
import { getMyOrganizations, getOrganizationClients } from '../../services/organizationService.js';
import { uuidSchema } from '../../validators/common.schemas.js';

export default async function organizationRoutes(app: FastifyInstance) {
  app.get('/api/organizations', { preHandler: [authenticate] }, async (request) => {
    const orgs = await getMyOrganizations(request.auth!.userId);
    return { organizations: orgs };
  });

  app.get('/api/organizations/:organizationId/clients', { preHandler: [authenticate] }, async (request) => {
    const organizationId = uuidSchema.parse((request.params as { organizationId: string }).organizationId);
    const clients = await getOrganizationClients(request.auth!, organizationId);
    return { clients };
  });
}
