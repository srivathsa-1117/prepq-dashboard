import { defineConfig } from '@trigger.dev/sdk';

/**
 * Trigger.dev v4 config. Scheduled sync jobs (see src/scheduler/tasks/) run
 * on Trigger.dev's infrastructure, separate from the Fastify API container
 * that's deployed to the Hostinger VPS (see Dockerfile) - this is the
 * "scheduled background jobs" half of the stack the spec calls for, without
 * hand-rolling a cron/queue/retry system ourselves.
 */
export default defineConfig({
  project: process.env.TRIGGER_PROJECT_ID ?? '',
  dirs: ['./src/scheduler/tasks'],
  runtime: 'node',
  logLevel: 'info',

  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 5,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 60_000,
      factor: 2,
      randomize: true,
    },
  },

  // Morning syncs are I/O-bound (paginated API pulls) and can run long for
  // clients with large accounts/lead volumes - default machine is enough,
  // maxDuration guards against a runaway pagination loop.
  maxDuration: 1800, // 30 minutes

  build: {
    autoDetectExternal: true,
    extensions: [],
  },

  onFailure: async ({ payload, error, ctx }) => {
    // eslint-disable-next-line no-console
    console.error('Trigger.dev task failed', { taskId: ctx.task.id, error, payload });
  },
});
