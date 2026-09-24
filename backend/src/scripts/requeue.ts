import { runStartupRecovery } from '../services/requeueService.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

async function main() {
  logger.info('Running recovery check for stale and orphaned scheduled emails...');
  const result = await runStartupRecovery();
  logger.info(result, 'Recovery script completed');
}

main()
  .catch((err) => {
    logger.error({ err }, 'Requeue script failed');
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
