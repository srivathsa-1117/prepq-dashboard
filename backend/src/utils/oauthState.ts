import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { ValidationError } from './errors.js';

const STATE_TTL_MS = 10 * 60_000; // 10 minutes - long enough for a user to complete the Meta/Google consent screen, short enough to bound replay risk.

export interface OAuthStatePayload {
  clientId: string;
  provider: 'meta' | 'google_ads';
  userId: string;
}

/**
 * Signs the OAuth `state` param carried through the Meta/Google consent
 * redirect. Reuses INTEGRATION_CREDENTIALS_ENC_KEY as HMAC key material
 * (any secret works for HMAC, and this avoids introducing a second secret
 * just for this) so the callback can trust the clientId/provider/userId it
 * decodes without the frontend being able to forge or tamper with them -
 * see services/integrationService.ts::completeOAuthConnect.
 */
function hmacKey(): Buffer {
  return Buffer.from(env.INTEGRATION_CREDENTIALS_ENC_KEY, 'base64');
}

export function signOAuthState(payload: OAuthStatePayload): string {
  const body = { ...payload, iat: Date.now() };
  const bodyB64 = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url');
  const signature = createHmac('sha256', hmacKey()).update(bodyB64).digest('base64url');
  return `${bodyB64}.${signature}`;
}

export function verifyOAuthState(token: string): OAuthStatePayload {
  const [bodyB64, signature] = token.split('.');
  if (!bodyB64 || !signature) {
    throw new ValidationError('Malformed OAuth state');
  }

  const expectedSignature = createHmac('sha256', hmacKey()).update(bodyB64).digest('base64url');
  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new ValidationError('Invalid OAuth state signature');
  }

  const body = JSON.parse(Buffer.from(bodyB64, 'base64url').toString('utf8')) as OAuthStatePayload & { iat: number };
  if (Date.now() - body.iat > STATE_TTL_MS) {
    throw new ValidationError('OAuth state expired - please retry connecting');
  }

  return { clientId: body.clientId, provider: body.provider, userId: body.userId };
}
