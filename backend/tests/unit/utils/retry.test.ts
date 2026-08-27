import { describe, it, expect, vi } from 'vitest';
import { withRetry, PermanentError, RetryableError } from '../../../src/utils/retry.js';

describe('withRetry', () => {
  it('retries a RetryableError and eventually succeeds', async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) throw new RetryableError('transient');
        return 'ok';
      },
      { minTimeoutMs: 1, maxTimeoutMs: 2, maxAttempts: 5 },
    );

    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('does not retry a PermanentError', async () => {
    let attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts += 1;
          throw new PermanentError('bad request');
        },
        { minTimeoutMs: 1, maxTimeoutMs: 2 },
      ),
    ).rejects.toThrow('bad request');

    expect(attempts).toBe(1);
  });

  it('gives up after maxAttempts and surfaces the last error', async () => {
    let attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts += 1;
          throw new RetryableError('still failing');
        },
        { minTimeoutMs: 1, maxTimeoutMs: 2, maxAttempts: 3 },
      ),
    ).rejects.toThrow('still failing');

    expect(attempts).toBe(3);
  });

  it('treats HTTP 429 and 5xx as retryable, and other 4xx as permanent, via the default classifier', async () => {
    const retry429 = vi.fn(async () => {
      throw { statusCode: 429 };
    });
    await expect(withRetry(retry429, { minTimeoutMs: 1, maxTimeoutMs: 1, maxAttempts: 2 })).rejects.toBeDefined();
    expect(retry429).toHaveBeenCalledTimes(2);

    const retry404 = vi.fn(async () => {
      throw { statusCode: 404 };
    });
    await expect(withRetry(retry404, { minTimeoutMs: 1, maxTimeoutMs: 1, maxAttempts: 5 })).rejects.toBeDefined();
    expect(retry404).toHaveBeenCalledTimes(1);
  });

  it('calls onRetry with increasing attempt numbers and exponential delays', async () => {
    const delays: number[] = [];
    let attempts = 0;

    await withRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) throw new RetryableError('x');
        return 'done';
      },
      {
        minTimeoutMs: 10,
        maxTimeoutMs: 1000,
        factor: 2,
        onRetry: (_err, _attempt, delayMs) => delays.push(delayMs),
      },
    );

    expect(delays).toEqual([10, 20]);
  });
});
