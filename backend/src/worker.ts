import { createEmailWorker } from './workers/emailWorker.js';
import { logger } from './lib/logger.js';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';

const worker = createEmailWorker();

logger.info(
  { concurrency: env.WORKER_CONCURRENCY, nodeEnv: env.NODE_ENV },
  'Worker started'
);

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Worker shutting down gracefully...');
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
