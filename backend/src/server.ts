import app from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { runStartupRecovery } from './services/requeueService.js';

async function bootstrap() {
  // Reconcile stale processing records and requeue orphaned scheduled emails on server startup
  try {
    const { staleRecovered, orphanedRequeued } = await runStartupRecovery();
    if (staleRecovered > 0 || orphanedRequeued > 0) {
      logger.info(
        { staleRecovered, orphanedRequeued },
        'Completed startup recovery reconciling stale and orphaned email jobs'
      );
    }
  } catch (err) {
    logger.warn({ err }, 'Could not run startup recovery check');
  }

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, nodeEnv: env.NODE_ENV }, 'Server started');
  });

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
