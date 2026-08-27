import type { FastifyInstance } from 'fastify';
import { authenticate, requireClientAccess, requireRole } from '../../auth/middleware.js';
import { getSyncStatusForClient, triggerManualSync, updateClientSchedule, listSchedules } from '../../services/syncService.js';
import { providerParamSchema } from '../../validators/integration.schemas.js';
import { manualSyncSchema, updateScheduleSchema } from '../../validators/integration.schemas.js';
import { RATE_LIMIT } from '../../config/constants.js';
import type { IntegrationProvider } from '../../types/domain.js';

export default async function syncRoutes(app: FastifyInstance) {
  app.get('/api/sync/status', { preHandler: [authenticate, requireClientAccess()] }, async (request) => {
    const { provider } = request.query as { provider?: IntegrationProvider };
    return getSyncStatusForClient(request.clientScope!.clientId, provider);
  });

  app.get('/api/sync/schedules', { preHandler: [authenticate, requireClientAccess()] }, async (request) => {
    const schedules = await listSchedules(request.clientScope!.clientId);
    return { schedules };
  });

  app.post(
    '/api/sync/:provider/run',
    {
      preHandler: [authenticate, requireClientAccess(), requireRole('manager')],
      config: { rateLimit: { max: RATE_LIMIT.sensitive.max, timeWindow: RATE_LIMIT.sensitive.windowMs } },
    },
    async (request, reply) => {
      const { provider } = providerParamSchema.parse(request.params);
      const body = manualSyncSchema.parse({ client_id: request.clientScope!.clientId, ...(request.body as object) });

      const { runId } = await triggerManualSync(
        request.clientScope!.clientId,
        provider as IntegrationProvider,
        request.auth!.userId,
        body.lookback_days,
      );

      reply.status(202).send({ triggerRunId: runId });
    },
  );

  app.patch(
    '/api/sync/:provider/schedule',
    { preHandler: [authenticate, requireClientAccess(), requireRole('admin')] },
    async (request) => {
      const { provider } = providerParamSchema.parse(request.params);
      const body = updateScheduleSchema.parse({ client_id: request.clientScope!.clientId, ...(request.body as object) });

      await updateClientSchedule({
        clientId: request.clientScope!.clientId,
        provider: provider as IntegrationProvider,
        cronExpression: body.cron_expression,
        timezone: body.timezone,
        enabled: body.enabled,
      });

      return { updated: true };
    },
  );
}
