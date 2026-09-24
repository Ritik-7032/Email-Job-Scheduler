import { requeueOrphanedEmails } from '../services/requeueService.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

async function main() {
  logger.info('Running requeue check for orphaned scheduled emails...');
  const count = await requeueOrphanedEmails();
  logger.info({ reEnqueuedCount: count }, 'Requeue check completed');
}

main()
  .catch((err) => {
    logger.error({ err }, 'Requeue script failed');
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
