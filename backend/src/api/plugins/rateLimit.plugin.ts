import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import { RATE_LIMIT } from '../../config/constants.js';

/**
 * Global default limit. Sensitive routes (integration connect/disconnect,
 * manual sync trigger) apply a tighter `config.rateLimit` override at the
 * route level - see api/routes/integrations.routes.ts and sync.routes.ts.
 */
export default fp(async function rateLimitPlugin(app: FastifyInstance) {
  await app.register(rateLimit, {
    global: true,
    max: RATE_LIMIT.default.max,
    timeWindow: RATE_LIMIT.default.windowMs,
    keyGenerator: (request) => request.auth?.userId ?? request.ip,
  });
});
