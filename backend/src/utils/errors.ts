/** Centralized application error hierarchy. src/api/plugins/errorHandler.plugin.ts maps these to HTTP responses. */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(message: string, statusCode: number, code: string, details?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have access to this resource') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

export class RateLimitedError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429, 'RATE_LIMITED');
  }
}

/** Server-side config the deployment forgot to set (e.g. META_APP_ID) - distinct from IntegrationError so it doesn't get conflated with an actual Meta/Google API failure. Safe, actionable message; never leaks *which* env var to unauthenticated callers since routes throwing this already require auth. */
export class NotConfiguredError extends AppError {
  constructor(message: string) {
    super(message, 503, 'NOT_CONFIGURED');
  }
}

/** Upstream provider (Meta/Google/Meritto) failures that should not be conflated with our own bugs. */
export class IntegrationError extends AppError {
  readonly provider: string;
  readonly retryable: boolean;

  constructor(provider: string, message: string, retryable: boolean, details?: Record<string, unknown>) {
    super(message, 502, 'INTEGRATION_ERROR', details);
    this.provider = provider;
    this.retryable = retryable;
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
