import Fastify from 'fastify';
import sensible from '@fastify/sensible';
import helmet from '@fastify/helmet';
import { logger } from './utils/logger.js';

import errorHandlerPlugin from './api/plugins/errorHandler.plugin.js';
import corsPlugin from './api/plugins/cors.plugin.js';
import rateLimitPlugin from './api/plugins/rateLimit.plugin.js';

import healthRoutes from './api/routes/health.routes.js';
import organizationRoutes from './api/routes/organizations.routes.js';
import clientRoutes from './api/routes/clients.routes.js';
import integrationRoutes from './api/routes/integrations.routes.js';
import syncRoutes from './api/routes/sync.routes.js';
import dashboardRoutes from './api/routes/dashboard.routes.js';

// Return type is inferred rather than annotated as FastifyInstance: we pass a
// concrete pino Logger instance (not Fastify's generic FastifyBaseLogger) via
// the `logger` option, which narrows the instance's logger generic beyond
// what the default FastifyInstance type parameter accepts.
export async function buildApp() {
  const app = Fastify({
    logger,
    trustProxy: true, // behind the Hostinger reverse proxy / nginx
    disableRequestLogging: false,
  });

  await app.register(helmet, { contentSecurityPolicy: false }); // pure JSON API, no HTML to protect with CSP
  await app.register(sensible);
  await app.register(errorHandlerPlugin);
  await app.register(corsPlugin);
  await app.register(rateLimitPlugin);

  await app.register(healthRoutes);
  await app.register(organizationRoutes);
  await app.register(clientRoutes);
  await app.register(integrationRoutes);
  await app.register(syncRoutes);
  await app.register(dashboardRoutes);

  return app;
}
