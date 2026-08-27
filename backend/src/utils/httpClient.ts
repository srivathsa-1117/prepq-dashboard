import { withRetry, PermanentError, RetryableError } from './retry.js';
import { logger } from './logger.js';

export interface HttpJsonOptions extends RequestInit {
  /** Query params, appended and URL-encoded. */
  query?: Record<string, string | number | undefined>;
  retry?: Parameters<typeof withRetry>[1];
  /** Human label for logging, e.g. "meta.insights", "google.search". */
  label: string;
}

export class HttpError extends Error {
  readonly statusCode: number;
  readonly body: unknown;
  constructor(message: string, statusCode: number, body: unknown) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.body = body;
  }
}

/**
 * Thin fetch wrapper shared by the Meta/Google/Meritto clients: builds the
 * query string, retries transient failures with backoff, and normalizes
 * HTTP error bodies into HttpError. This is deliberately NOT a generic
 * "connector" abstraction - it has no notion of pagination, auth scheme, or
 * entity mapping; each integration client still owns all of that itself.
 */
export async function httpJson<T>(url: string, options: HttpJsonOptions): Promise<T> {
  const { query, retry, label, ...init } = options;

  const fullUrl = new URL(url);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) fullUrl.searchParams.set(key, String(value));
    }
  }

  return withRetry(
    async () => {
      const response = await fetch(fullUrl.toString(), init);

      if (!response.ok) {
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          body = await response.text().catch(() => undefined);
        }

        const message = `${label} failed: HTTP ${response.status}`;
        // Meta's Graph API returns app-level rate limiting (e.g. "Application request limit
        // reached" on /insights, see developers.facebook.com/docs/marketing-api/insights/
        // best-practices/#insightscallload) as HTTP 403 with error.is_transient: true in the
        // body - a plain status-code check misses this and gives up immediately on a limit
        // Meta itself says to back off and retry. Checked generically (not Meta-specific) since
        // it's harmless for providers whose error bodies don't have this shape.
        const isTransientBody =
          typeof body === 'object' && body !== null && (body as { error?: { is_transient?: boolean } }).error?.is_transient === true;
        if (response.status === 429 || response.status >= 500 || isTransientBody) {
          throw new RetryableError(message, new HttpError(message, response.status, body));
        }
        throw new PermanentError(message, new HttpError(message, response.status, body));
      }

      return (await response.json()) as T;
    },
    {
      ...retry,
      onRetry: (error, attempt, delayMs) => {
        logger.warn({ label, attempt, delayMs }, `${label}: retrying after transient failure`);
      },
    },
  );
}
