import { buildApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { startScheduler, stopScheduler } from './scheduler/syncScheduler.js';
import { failStaleRunningSyncRuns } from './repositories/syncRunsRepo.js';
import { STALE_SYNC_RUN_THRESHOLD_MINUTES } from './config/constants.js';

async function main() {
  const app = await buildApp();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    stopScheduler();
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Unhandled promise rejection');
  });

  try {
    await app.listen({ host: env.HOST, port: env.PORT });
    logger.info({ host: env.HOST, port: env.PORT, env: env.NODE_ENV }, 'Backend listening');

    // Runs before the scheduler starts so its very first tick never sees a stale 'running' row
    // (left behind by a crash/redeploy mid-sync) and wrongly treats it as "already in progress".
    const recovered = await failStaleRunningSyncRuns(STALE_SYNC_RUN_THRESHOLD_MINUTES).catch((err: unknown) => {
      logger.error({ err }, 'Failed to reconcile stale sync_runs on startup - continuing anyway');
      return 0;
    });
    if (recovered > 0) logger.warn({ recovered }, 'Reconciled orphaned running sync_runs on startup');

    startScheduler();
  } catch (err) {
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  }
}

void main();
