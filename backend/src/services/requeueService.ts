import { prisma } from '../lib/prisma.js';
import { emailQueue } from '../queue/emailQueue.js';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';
import { redisClient } from '../lib/redis.js';

export const RECOVERY_CHUNK_SIZE = 500;

export async function recoverStaleProcessingEmails(
  staleMs: number = env.STALE_PROCESSING_MS
): Promise<number> {
  const staleThreshold = new Date(Date.now() - staleMs);
  let totalReconciled = 0;

  while (true) {
    let staleEmails;
    try {
      staleEmails = await prisma.email.findMany({
        where: {
          status: 'processing',
          processingStartedAt: {
            lt: staleThreshold,
          },
        },
        take: RECOVERY_CHUNK_SIZE,
        orderBy: {
          processingStartedAt: 'asc',
        },
      });
    } catch (err: unknown) {
      const error = err as { code?: string };
      if (error?.code === 'P2021') {
        return 0;
      }
      throw err;
    }

    if (staleEmails.length === 0) {
      break;
    }

    for (const email of staleEmails) {
      // 1. Check durable dispatch ledger first to prevent duplicate sends if worker died post-SMTP
      let dispatchedRecord: { messageId?: string; previewUrl?: string; dispatchedAt?: string } | null = null;
      if (redisClient.status === 'ready' || Boolean((redisClient.get as any)?.mock)) {
        try {
          const cached = await redisClient.get(`dispatched:${email.id}`);
          if (cached) {
            dispatchedRecord = JSON.parse(cached);
          }
        } catch {
          // Redis check failure is non-fatal
        }
      }

      if (dispatchedRecord) {
        await prisma.email.update({
          where: { id: email.id },
          data: {
            status: 'sent',
            sentAt: dispatchedRecord.dispatchedAt ? new Date(dispatchedRecord.dispatchedAt) : new Date(),
            messageId: dispatchedRecord.messageId || email.messageId,
            previewUrl: dispatchedRecord.previewUrl || null,
            errorMessage: null,
          },
        });
        logger.info(
          { emailId: email.id, messageId: dispatchedRecord.messageId },
          'Reconciled uncommitted email to sent status from Redis dispatch ledger (prevented duplicate dispatch)'
        );
        continue;
      }

      if (email.attempts >= 3) {
        // Maximum attempts exhausted on stalled worker
        await prisma.email.update({
          where: { id: email.id },
          data: {
            status: 'failed',
            errorMessage: 'Worker process terminated unexpectedly during execution after maximum attempts',
          },
        });
      } else {
        // Reset to scheduled for at-least-once delivery recovery
        await prisma.email.update({
          where: { id: email.id },
          data: {
            status: 'scheduled',
            enqueuedAt: null,
            processingStartedAt: null,
          },
        });
      }
    }

    totalReconciled += staleEmails.length;
    if (staleEmails.length < RECOVERY_CHUNK_SIZE) {
      break;
    }
  }

  if (totalReconciled > 0) {
    logger.info({ count: totalReconciled }, 'Reconciled stale processing emails');
  }

  return totalReconciled;
}

export async function requeueOrphanedEmails(
  chunkSize: number = RECOVERY_CHUNK_SIZE
): Promise<number> {
  const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
  let totalRequeued = 0;

  while (true) {
    let pendingChunk;
    try {
      pendingChunk = await prisma.email.findMany({
        where: {
          status: 'scheduled',
          enqueuedAt: null,
          createdAt: {
            lt: oneMinuteAgo,
          },
        },
        take: chunkSize,
        orderBy: {
          createdAt: 'asc',
        },
      });
    } catch (err: unknown) {
      const error = err as { code?: string };
      if (error?.code === 'P2021') {
        return 0;
      }
      throw err;
    }

    if (pendingChunk.length === 0) {
      break;
    }

    const now = Date.now();
    const jobs = pendingChunk.map((email) => ({
      name: 'send-email',
      data: { emailId: email.id },
      opts: {
        jobId: email.id,
        delay: Math.max(0, email.scheduledAt.getTime() - now),
      },
    }));

    await emailQueue.addBulk(jobs);

    const emailIds = pendingChunk.map((e) => e.id);
    await prisma.email.updateMany({
      where: {
        id: { in: emailIds },
      },
      data: {
        enqueuedAt: new Date(),
      },
    });

    totalRequeued += pendingChunk.length;

    // If fetched chunk is smaller than chunkSize, no more orphaned records remain
    if (pendingChunk.length < chunkSize) {
      break;
    }
  }

  if (totalRequeued > 0) {
    logger.info({ count: totalRequeued }, 'Re-enqueued orphaned scheduled emails');
  }
  return totalRequeued;
}

export async function retryTransientFailedEmails(
  cooldownMs: number = 300000 // 5 minutes cooldown
): Promise<number> {
  const retryThreshold = new Date(Date.now() - cooldownMs);
  let totalRetried = 0;

  while (true) {
    let failedEmails;
    try {
      failedEmails = await prisma.email.findMany({
        where: {
          status: 'failed',
          updatedAt: {
            lt: retryThreshold,
          },
          OR: [
            { errorMessage: { contains: 'timeout', mode: 'insensitive' } },
            { errorMessage: { contains: 'ETIMEDOUT', mode: 'insensitive' } },
            { errorMessage: { contains: 'ECONNREFUSED', mode: 'insensitive' } },
            { errorMessage: { contains: 'EHOSTUNREACH', mode: 'insensitive' } },
            { errorMessage: { contains: 'terminated unexpectedly', mode: 'insensitive' } },
          ],
        },
        take: RECOVERY_CHUNK_SIZE,
        orderBy: {
          updatedAt: 'asc',
        },
      });
    } catch (err: unknown) {
      const error = err as { code?: string };
      if (error?.code === 'P2021') {
        return 0;
      }
      throw err;
    }

    if (failedEmails.length === 0) {
      break;
    }

    const emailIds = failedEmails.map((e) => e.id);

    // Reset status to scheduled with 0 attempts and clear error
    await prisma.email.updateMany({
      where: { id: { in: emailIds } },
      data: {
        status: 'scheduled',
        attempts: 0,
        enqueuedAt: null,
        errorMessage: null,
      },
    });

    const now = Date.now();
    const jobs = failedEmails.map((email, idx) => ({
      name: 'send-email',
      data: { emailId: email.id },
      opts: {
        jobId: `${email.id}-retry-${now}-${idx}`,
        delay: Math.max(0, idx * 2000),
      },
    }));

    await emailQueue.addBulk(jobs);

    await prisma.email.updateMany({
      where: { id: { in: emailIds } },
      data: { enqueuedAt: new Date() },
    });

    totalRetried += failedEmails.length;

    if (failedEmails.length < RECOVERY_CHUNK_SIZE) {
      break;
    }
  }

  if (totalRetried > 0) {
    logger.info({ count: totalRetried }, 'Automatically re-enqueued transiently failed emails');
  }
  return totalRetried;
}

export async function runStartupRecovery(): Promise<{
  staleRecovered: number;
  orphanedRequeued: number;
  failedRetried: number;
}> {
  const staleRecovered = await recoverStaleProcessingEmails();
  const orphanedRequeued = await requeueOrphanedEmails();
  const failedRetried = await retryTransientFailedEmails();
  return { staleRecovered, orphanedRequeued, failedRetried };
}

