import type { FastifyInstance } from 'fastify';
import { authenticate, requireClientAccess, requireRole } from '../../auth/middleware.js';
import {
  listIntegrationsForClient,
  getIntegrationStatus,
  listAvailableAccounts,
  connectIntegration,
  disconnectIntegration,
  testIntegration,
  refreshIntegration,
  createAuthorizationUrl,
  completeOAuthConnect,
} from '../../services/integrationService.js';
import { connectIntegrationSchema, providerParamSchema, oauthCompleteSchema } from '../../validators/integration.schemas.js';
import { RATE_LIMIT } from '../../config/constants.js';
import type { IntegrationProvider } from '../../types/domain.js';

export default async function integrationRoutes(app: FastifyInstance) {
  app.get('/api/integrations', { preHandler: [authenticate, requireClientAccess()] }, async (request) => {
    const integrations = await listIntegrationsForClient(request.clientScope!.clientId);
    return { integrations };
  });

  app.get(
    '/api/integrations/:provider',
    { preHandler: [authenticate, requireClientAccess()] },
    async (request) => {
      const { provider } = providerParamSchema.parse(request.params);
      return getIntegrationStatus(request.clientScope!.clientId, provider as IntegrationProvider);
    },
  );

  app.get(
    '/api/integrations/:provider/accounts',
    { preHandler: [authenticate, requireClientAccess(), requireRole('manager')] },
    async (request) => {
      const { provider } = providerParamSchema.parse(request.params);
      const accounts = await listAvailableAccounts(request.clientScope!.clientId, provider as IntegrationProvider);
      return { accounts };
    },
  );

  // Step 1 of the real OAuth flow: mint the Meta/Google consent-screen URL the frontend redirects to.
  app.get(
    '/api/integrations/:provider/authorize-url',
    { preHandler: [authenticate, requireClientAccess(), requireRole('manager')] },
    async (request) => {
      const { provider } = providerParamSchema.parse(request.params);
      return createAuthorizationUrl(request.clientScope!.clientId, provider as IntegrationProvider, request.auth!.userId);
    },
  );

  // Step 2: the frontend's technical /integrations/callback route lands here with the code Meta/Google
  // issued plus the signed state from step 1 - clientId/provider/userId all come from that state, not
  // from the request, since the browser round-tripped through a third party in between (see
  // services/integrationService.ts::completeOAuthConnect).
  app.post(
    '/api/integrations/oauth/complete',
    { preHandler: [authenticate], config: { rateLimit: { max: RATE_LIMIT.sensitive.max, timeWindow: RATE_LIMIT.sensitive.windowMs } } },
    async (request) => {
      const body = oauthCompleteSchema.parse(request.body);
      return completeOAuthConnect(body.code, body.state, request.auth!);
    },
  );

  app.post(
    '/api/integrations/:provider/connect',
    {
      preHandler: [authenticate, requireClientAccess(), requireRole('manager')],
      config: { rateLimit: { max: RATE_LIMIT.sensitive.max, timeWindow: RATE_LIMIT.sensitive.windowMs } },
    },
    async (request) => {
      const { provider } = providerParamSchema.parse(request.params);
      const body = connectIntegrationSchema.parse(request.body);

      const integration = await connectIntegration(
        request.clientScope!.clientId,
        provider as IntegrationProvider,
        {
          authorizationCode: body.authorization_code,
          apiKey: body.api_key,
          apiSecret: body.api_secret,
          externalAccountId: body.external_account_id,
          externalAccountName: body.external_account_name,
        },
        request.auth!.userId,
      );

      return { integration };
    },
  );

  app.post(
    '/api/integrations/:provider/disconnect',
    {
      preHandler: [authenticate, requireClientAccess(), requireRole('manager')],
      config: { rateLimit: { max: RATE_LIMIT.sensitive.max, timeWindow: RATE_LIMIT.sensitive.windowMs } },
    },
    async (request, reply) => {
      const { provider } = providerParamSchema.parse(request.params);
      await disconnectIntegration(request.clientScope!.clientId, provider as IntegrationProvider);
      reply.status(204).send();
    },
  );

  app.post(
    '/api/integrations/:provider/refresh',
    { preHandler: [authenticate, requireClientAccess(), requireRole('manager')] },
    async (request) => {
      const { provider } = providerParamSchema.parse(request.params);
      await refreshIntegration(request.clientScope!.clientId, provider as IntegrationProvider);
      return { refreshed: true };
    },
  );

  app.post(
    '/api/integrations/:provider/test',
    { preHandler: [authenticate, requireClientAccess(), requireRole('manager')] },
    async (request) => {
      const { provider } = providerParamSchema.parse(request.params);
      return testIntegration(request.clientScope!.clientId, provider as IntegrationProvider);
    },
  );
}
