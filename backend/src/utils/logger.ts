import pino from 'pino';
import { env, isProduction } from '../config/env.js';

/**
 * Structured logger. Redaction paths cover every place an OAuth token, API
 * secret, or Authorization header could end up in a log line - this list is
 * deliberately broad because a redaction miss is a credential leak.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.access_token',
      '*.refresh_token',
      '*.client_secret',
      '*.api_key',
      '*.api_secret',
      '*.developer_token',
      '*.credentials_ciphertext',
      '*.credentials_iv',
      '*.credentials_auth_tag',
      '*.password',
      '*.token',
      'credentials',
    ],
    censor: '[REDACTED]',
  },
  transport: isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      },
});

export function childLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}
