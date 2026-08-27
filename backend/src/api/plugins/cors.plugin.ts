import fp from 'fastify-plugin';
import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';
import { corsAllowedOrigins } from '../../config/env.js';

export default fp(async function corsPlugin(app: FastifyInstance) {
  await app.register(cors, {
    origin: corsAllowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  });
});
