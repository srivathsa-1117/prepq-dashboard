import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;

function getKey(): Buffer {
  const key = Buffer.from(env.INTEGRATION_CREDENTIALS_ENC_KEY, 'base64');
  if (key.length !== 32) {
    throw new Error(
      `INTEGRATION_CREDENTIALS_ENC_KEY must decode to 32 bytes for AES-256-GCM, got ${key.length}. ` +
        `Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
    );
  }
  return key;
}

export interface EncryptedPayload {
  ciphertext: string; // base64
  iv: string; // base64
  authTag: string; // base64
  algo: typeof ALGORITHM;
}

/**
 * Encrypts an arbitrary JSON-serializable credential object (OAuth tokens,
 * API keys, etc.) for storage in client_integrations. The plaintext never
 * touches disk or logs - see utils/logger.ts redaction paths.
 */
export function encryptCredentials(payload: Record<string, unknown>): EncryptedPayload {
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);

  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    algo: ALGORITHM,
  };
}

export function decryptCredentials<T = Record<string, unknown>>(encrypted: EncryptedPayload): T {
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(encrypted.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(encrypted.authTag, 'base64'));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, 'base64')),
    decipher.final(),
  ]);

  return JSON.parse(plaintext.toString('utf8')) as T;
}
