import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';
import type { Database } from '../types/database.js';

/**
 * Service-role client. Bypasses Row Level Security entirely - this is the
 * ONLY client repositories/ should use, because the backend performs its own
 * organization/client authorization in src/auth before any repository call
 * (see auth/middleware.ts). Never send this client, or its key, to a browser.
 */
export const supabaseAdmin: SupabaseClient<Database> = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/**
 * Anon-key client, used exclusively to verify a user's access token via
 * `supabase.auth.getUser(token)` in auth/supabaseAuth.ts. Never used for data
 * access - it has no elevated privileges and RLS would block tenant data
 * reads through it anyway (see 0007_rls_policies.sql).
 */
export const supabaseAuthClient: SupabaseClient<Database> = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
