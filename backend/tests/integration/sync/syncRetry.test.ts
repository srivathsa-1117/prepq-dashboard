import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { httpJson, HttpError } from '../../../src/utils/httpClient.js';

describe('httpJson retry behavior (simulating Meta/Google/Meritto transient failures)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.useRealTimers();
  });

  it('retries on HTTP 429 (rate limit) and succeeds once the provider recovers', async () => {
    let calls = 0;
    global.fetch = vi.fn(async () => {
      calls += 1;
      if (calls < 3) {
        return new Response(JSON.stringify({ error: 'rate limited' }), { status: 429 });
      }
      return new Response(JSON.stringify({ data: ['ok'] }), { status: 200 });
    }) as unknown as typeof fetch;

    const promise = httpJson<{ data: string[] }>('https://api.example.com/leads', {
      method: 'GET',
      label: 'test.retry429',
      retry: { minTimeoutMs: 10, maxTimeoutMs: 20, maxAttempts: 5 },
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.data).toEqual(['ok']);
    expect(calls).toBe(3);
  });

  it('retries on HTTP 503 (transient 5xx)', async () => {
    let calls = 0;
    global.fetch = vi.fn(async () => {
      calls += 1;
      if (calls < 2) return new Response('service unavailable', { status: 503 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch;

    const promise = httpJson('https://api.example.com/campaigns', {
      method: 'GET',
      label: 'test.retry503',
      retry: { minTimeoutMs: 10, maxTimeoutMs: 20, maxAttempts: 5 },
    });

    await vi.runAllTimersAsync();
    await expect(promise).resolves.toEqual({ ok: true });
    expect(calls).toBe(2);
  });

  it('does not retry a permanent 401/403 - fails fast with the error body attached', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ error: 'invalid token' }), { status: 401 })) as unknown as typeof fetch;

    await expect(
      httpJson('https://api.example.com/leads', { method: 'GET', label: 'test.permanent401', retry: { maxAttempts: 5 } }),
    ).rejects.toThrow();

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('gives up after maxAttempts on a persistently failing endpoint and the final failure is observable', async () => {
    global.fetch = vi.fn(async () => new Response('down', { status: 500 })) as unknown as typeof fetch;

    const promise = httpJson('https://api.example.com/insights', {
      method: 'GET',
      label: 'test.permanentOutage',
      retry: { minTimeoutMs: 5, maxTimeoutMs: 10, maxAttempts: 3 },
    });
    // Attach the rejection assertion synchronously so the promise is never
    // "unhandled" during the timer-driven retry delays below.
    const assertion = expect(promise).rejects.toThrow();

    await vi.runAllTimersAsync();
    await assertion;
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('surfaces the HTTP status and body via HttpError for downstream sync_runs.error_details', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ error: { message: 'bad request' } }), { status: 400 })) as unknown as typeof fetch;

    try {
      await httpJson('https://api.example.com/leads', { method: 'GET', label: 'test.badRequest', retry: { maxAttempts: 1 } });
      expect.unreachable('should have thrown');
    } catch (error) {
      const err = error as Error & { cause?: HttpError };
      expect(err.cause).toBeInstanceOf(HttpError);
      expect(err.cause?.statusCode).toBe(400);
    }
  });
});
