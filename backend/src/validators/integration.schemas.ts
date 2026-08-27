import { z } from 'zod';
import { INTEGRATION_PROVIDERS } from '../types/domain.js';
import { uuidSchema } from './common.schemas.js';

export const providerParamSchema = z.object({
  provider: z.enum(INTEGRATION_PROVIDERS as [string, ...string[]]),
});

export const connectIntegrationSchema = z.object({
  client_id: uuidSchema,
  // OAuth providers: the authorization code from the frontend's redirect callback.
  authorization_code: z.string().min(1).optional(),
  // Meritto: account-scoped API key/secret pair instead of an OAuth code.
  api_key: z.string().min(1).optional(),
  api_secret: z.string().min(1).optional(),
  // Chosen ad account / customer id, once known (second step of the connect flow for OAuth providers).
  external_account_id: z.string().min(1).optional(),
  external_account_name: z.string().min(1).optional(),
});

export const oauthCompleteSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

export const disconnectIntegrationSchema = z.object({
  client_id: uuidSchema,
});

export const updateScheduleSchema = z.object({
  client_id: uuidSchema,
  cron_expression: z
    .string()
    .regex(/^\S+ \S+ \S+ \S+ \S+$/, 'Expected a 5-field cron expression, e.g. "0 6 * * *"'),
  timezone: z.string().min(1).default('UTC'),
  enabled: z.boolean().default(true),
});

export const manualSyncSchema = z.object({
  client_id: uuidSchema,
  lookback_days: z.coerce.number().int().min(1).max(365).optional(),
});
