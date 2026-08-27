import { RETRY } from '../config/constants.js';
import { logger } from './logger.js';

export interface RetryOptions {
  maxAttempts?: number;
  minTimeoutMs?: number;
  maxTimeoutMs?: number;
  factor?: number;
  /** Decide whether a given error is worth retrying. Defaults to retrying network errors + retryable flag. */
  isRetryable?: (error: unknown) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

export class PermanentError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'PermanentError';
  }
}

/** A tagged error a caller can throw to signal "retryable" without relying on message sniffing. */
export class RetryableError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'RetryableError';
  }
}

/** Matches undici's "fetch failed" wrapper (e.g. a keep-alive socket to Supabase going
 * stale after a few idle minutes) and other network-level fetch rejections. supabase-js
 * catches these and re-shapes them into a PostgrestError-like object with the real
 * TypeError's `message`/`stack` copied into `message`/`details` and `code: ''` - so a
 * bare `err.code` check (below) misses them entirely; this checks the message text too. */
const NETWORK_ERROR_MESSAGE_PATTERN = /fetch failed|ECONNRESET|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|socket hang up/i;

function defaultIsRetryable(error: unknown): boolean {
  if (error instanceof PermanentError) return false;
  if (error instanceof RetryableError) return true;

  const err = error as { statusCode?: number; status?: number; code?: string; message?: string } | undefined;
  const status = err?.statusCode ?? err?.status;
  if (typeof status === 'number') {
    if (status === 429) return true;
    if (status >= 500 && status < 600) return true;
    return false;
  }

  // Node network-level errors (ECONNRESET, ETIMEDOUT, EAI_AGAIN, fetch failed, ...)
  const code = err?.code;
  if (code && ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNREFUSED', 'UND_ERR_CONNECT_TIMEOUT'].includes(code)) {
    return true;
  }

  const message = err?.message ?? (error instanceof Error ? error.message : undefined);
  if (message && NETWORK_ERROR_MESSAGE_PATTERN.test(message)) {
    return true;
  }

  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Exponential backoff retry, with jitter-free deterministic delays by default
 * (predictable in tests). Permanent errors (4xx other than 429, or explicitly
 * tagged PermanentError) are not retried - they fail fast into sync_runs.
 */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const maxAttempts = options.maxAttempts ?? RETRY.maxAttempts;
  const minTimeoutMs = options.minTimeoutMs ?? RETRY.minTimeoutMs;
  const maxTimeoutMs = options.maxTimeoutMs ?? RETRY.maxTimeoutMs;
  const factor = options.factor ?? RETRY.factor;
  const isRetryable = options.isRetryable ?? defaultIsRetryable;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;

      if (!isRetryable(error) || attempt === maxAttempts) {
        break;
      }

      const delayMs = Math.min(minTimeoutMs * factor ** (attempt - 1), maxTimeoutMs);
      options.onRetry?.(error, attempt, delayMs);
      logger.warn(
        { attempt, maxAttempts, delayMs, error: error instanceof Error ? error.message : String(error) },
        'Retrying after failure',
      );
      await sleep(delayMs);
    }
  }

  throw lastError;
}
