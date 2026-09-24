import { prisma } from '../lib/prisma.js';
import { emailQueue } from '../queue/emailQueue.js';
import { logger } from '../lib/logger.js';

export async function requeueOrphanedEmails(): Promise<number> {
  const oneMinuteAgo = new Date(Date.now() - 60 * 1000);

  const pendingEmails = await prisma.email.findMany({
    where: {
      status: 'scheduled',
      enqueuedAt: null,
      createdAt: {
        lt: oneMinuteAgo,
      },
    },
    take: 500,
  });

  if (pendingEmails.length === 0) {
    return 0;
  }

  const now = Date.now();
  const jobs = pendingEmails.map((email) => ({
    name: 'send-email',
    data: { emailId: email.id },
    opts: {
      jobId: email.id,
      delay: Math.max(0, email.scheduledAt.getTime() - now),
    },
  }));

  await emailQueue.addBulk(jobs);

  const emailIds = pendingEmails.map((e) => e.id);
  await prisma.email.updateMany({
    where: {
      id: { in: emailIds },
    },
    data: {
      enqueuedAt: new Date(),
    },
  });

  logger.info({ count: pendingEmails.length }, 'Re-enqueued orphaned scheduled emails');
  return pendingEmails.length;
}
