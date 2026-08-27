'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser Supabase client - Auth only (sign-in, session, sign-out). Never
 * used to query dashboard data directly; that always goes through the
 * backend API (lib/api/*) so RLS + tenant checks are enforced server-side
 * and integration credentials never have a path into the browser.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
