import app from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { requeueOrphanedEmails } from './services/requeueService.js';

async function bootstrap() {
  // Requeue any orphaned scheduled emails from previous ungraceful stops
  try {
    const requeued = await requeueOrphanedEmails();
    if (requeued > 0) {
      logger.info({ count: requeued }, 'Re-enqueued orphaned scheduled emails on server startup');
    }
  } catch (err) {
    logger.warn({ err }, 'Could not run startup requeue check');
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
