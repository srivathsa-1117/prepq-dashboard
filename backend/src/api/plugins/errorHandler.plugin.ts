import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { isAppError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

/**
 * Centralized error handling (spec §16). Every thrown error - AppError
 * subclasses, Zod validation errors, Supabase/Postgres errors, or anything
 * unexpected - passes through here exactly once, so response shape and
 * logging are consistent no matter which route or service threw.
 */
export default fp(async function errorHandlerPlugin(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: error.flatten() },
      });
      return;
    }

    if (isAppError(error)) {
      if (error.statusCode >= 500) {
        logger.error({ err: error, path: request.url }, 'Request failed');
      } else {
        logger.warn({ code: error.code, path: request.url, statusCode: error.statusCode }, error.message);
      }
      reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details },
      });
      return;
    }

    // Fastify's own validation errors (schema-based route validation, if used)
    if ((error as { validation?: unknown }).validation) {
      reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: error.message } });
      return;
    }

    logger.error({ err: error, path: request.url }, 'Unhandled error');
    reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({ error: { code: 'NOT_FOUND', message: `Route ${request.method} ${request.url} not found` } });
  });
});
