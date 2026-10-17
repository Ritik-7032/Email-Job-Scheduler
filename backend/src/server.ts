import app from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { runStartupRecovery } from './services/requeueService.js';

import { createEmailWorker } from './workers/emailWorker.js';

async function bootstrap() {
  // Bind HTTP server to PORT first so Render port 10000 opens instantly (<100ms)
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, nodeEnv: env.NODE_ENV }, `Server running at http://localhost:${env.PORT}`);
  });

  // In separate-worker deployments (e.g., Docker Compose, multi-container production),
  // the worker runs via worker.ts. For single-container environments (e.g., free-tier Render),
  // the worker can run in-process when SEPARATE_WORKER is not set.
  const isSeparateWorker = process.env.SEPARATE_WORKER === 'true';

  setTimeout(() => {
    if (!isSeparateWorker) {
      try {
        createEmailWorker();
        logger.info({ concurrency: env.WORKER_CONCURRENCY }, 'In-process queue worker running');
      } catch (err) {
        logger.warn({ err }, 'Worker initialization deferred');
      }
    } else {
      logger.info('API server running with decoupled worker process (SEPARATE_WORKER=true)');
    }

    runStartupRecovery()
      .then(({ staleRecovered, orphanedRequeued }) => {
        if (staleRecovered > 0 || orphanedRequeued > 0) {
          logger.info(
            { staleRecovered, orphanedRequeued },
            'Completed startup recovery reconciling stale and orphaned email jobs'
          );
        }
      })
      .catch((err) => {
        logger.warn({ err }, 'Non-fatal: Startup recovery check deferred');
      });
  }, 50);

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Server shutting down gracefully...');
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});
