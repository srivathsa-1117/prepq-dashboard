import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),

  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_JWT_SECRET: z.string().optional(),

  INTEGRATION_CREDENTIALS_ENC_KEY: z
    .string()
    .min(1, 'INTEGRATION_CREDENTIALS_ENC_KEY is required to encrypt integration tokens at rest'),

  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_GRAPH_API_VERSION: z.string().default('v20.0'),
  META_OAUTH_REDIRECT_URI: z.string().optional(),
  // V1 simplification: this single-tenant deployment only ever reports on one Meta ad account,
  // so the OAuth connect flow auto-finalizes to this id instead of showing an account picker.
  // Multi-account selection returns when this becomes a real multi-tenant SaaS (see
  // services/integrationService.ts::completeOAuthConnect and listAvailableAccounts, both kept
  // intact for that future).
  META_DEFAULT_AD_ACCOUNT_ID: z.string().optional(),

  GOOGLE_ADS_DEVELOPER_TOKEN: z.string().optional(),
  GOOGLE_ADS_CLIENT_ID: z.string().optional(),
  GOOGLE_ADS_CLIENT_SECRET: z.string().optional(),
  GOOGLE_ADS_OAUTH_REDIRECT_URI: z.string().optional(),
  // Same V1 simplification as META_DEFAULT_AD_ACCOUNT_ID above, for Google Ads.
  GOOGLE_ADS_DEFAULT_CUSTOMER_ID: z
    .string()
    .optional()
    .transform((v) => (v ? v.replace(/[^0-9]/g, '') : v)),
  // Google's own UI always displays this as "123-456-7890", but the Ads API's login-customer-id
  // header requires digits only - strip dashes/spaces here once so every call site downstream
  // gets a clean value regardless of how it was pasted into .env.
  GOOGLE_ADS_LOGIN_CUSTOMER_ID: z
    .string()
    .optional()
    .transform((v) => (v ? v.replace(/[^0-9]/g, '') : v)),
  // Google Ads API sunsets each major version ~1 year after release (monthly releases as of
  // 2026) - keep this current or every call 404s outright rather than erroring on auth/scope.
  GOOGLE_ADS_API_VERSION: z.string().default('v25'),

  MERITTO_API_BASE_URL: z.string().optional(),
  MERITTO_API_KEY: z.string().optional(),
  MERITTO_API_SECRET: z.string().optional(),
  MERITTO_WEBHOOK_SECRET: z.string().optional(),

  INTERNAL_SERVICE_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    // eslint-disable-next-line no-console
    console.error(`Invalid environment configuration:\n${issues}`);
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();

export const corsAllowedOrigins = env.CORS_ALLOWED_ORIGINS.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export const isProduction = env.NODE_ENV === 'production';
