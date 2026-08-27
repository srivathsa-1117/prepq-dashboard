/**
 * Populates the minimum required environment variables before any module
 * under test imports src/config/env.ts (which validates and exits the
 * process on missing values). No live credentials required anywhere in the
 * test suite, per spec §17 - these are fixed, harmless placeholders.
 */
process.env.NODE_ENV ??= 'test';
process.env.SUPABASE_URL ??= 'https://test-project.supabase.co';
process.env.SUPABASE_ANON_KEY ??= 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';
process.env.INTEGRATION_CREDENTIALS_ENC_KEY ??= Buffer.alloc(32, 7).toString('base64');
process.env.LOG_LEVEL ??= 'silent';
