import { supabaseAuthClient } from '../database/supabaseClient.js';
import { getMembershipsForUser } from '../repositories/organizationsRepo.js';
import { UnauthorizedError } from '../utils/errors.js';
import type { AuthContext } from '../types/domain.js';

/**
 * Verifies a Supabase Auth access token (issued via Google OAuth sign-in on
 * the frontend) and assembles the AuthContext used for every authorization
 * decision downstream. Uses supabase.auth.getUser(token), which validates
 * the token against Supabase's auth server - no local JWT secret required,
 * though SUPABASE_JWT_SECRET can be wired in for local verification if
 * request volume ever makes the network round-trip a bottleneck.
 */
export async function verifyAccessToken(bearerToken: string): Promise<AuthContext> {
  const token = bearerToken.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    throw new UnauthorizedError('Missing bearer token');
  }

  const { data, error } = await supabaseAuthClient.auth.getUser(token);
  if (error || !data?.user) {
    throw new UnauthorizedError('Invalid or expired session');
  }

  const memberships = await getMembershipsForUser(data.user.id);

  return {
    userId: data.user.id,
    email: data.user.email ?? null,
    memberships,
  };
}
