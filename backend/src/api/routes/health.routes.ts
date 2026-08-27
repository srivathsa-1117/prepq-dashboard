import type { FastifyInstance } from 'fastify';
import { supabaseAdmin } from '../../database/supabaseClient.js';
import { env } from '../../config/env.js';

/**
 * GET /health - liveness/readiness probe for the Hostinger VPS deployment
 * (spec §18). Never returns secrets - only booleans/timestamps for each
 * dependency, safe to expose without authentication (e.g. to a Docker
 * HEALTHCHECK or an uptime monitor).
 */
export default async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async (_request, reply) => {
    const startedAt = Date.now();

    let databaseOk = false;
    try {
      const { error } = await supabaseAdmin.from('organizations').select('id').limit(1);
      databaseOk = !error;
    } catch {
      databaseOk = false;
    }

    const checks = {
      database: databaseOk,
    };
    const healthy = Object.values(checks).every(Boolean);

    reply.status(healthy ? 200 : 503).send({
      status: healthy ? 'ok' : 'degraded',
      environment: env.NODE_ENV,
      uptimeSeconds: process.uptime(),
      checkedInMs: Date.now() - startedAt,
      checks,
    });
  });
}
