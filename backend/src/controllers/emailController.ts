import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/index.js';
import {
  scheduleEmailSchema,
  paginationQuerySchema,
} from '../validators/scheduleValidator.js';
import {
  scheduleEmails,
  listScheduledEmails,
  listSentEmails,
} from '../services/emailService.js';
import { emailQueue } from '../queue/emailQueue.js';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';

import { redisClient } from '../lib/redis.js';

export async function handleScheduleEmails(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const validatedData = scheduleEmailSchema.parse(req.body);
    const userId = req.user!.id;

    const result = await scheduleEmails(userId, validatedData);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function handleGetScheduledEmails(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const query = paginationQuerySchema.parse(req.query);
    const userId = req.user!.id;

    const data = await listScheduledEmails(userId, query.limit, query.offset);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function handleGetSentEmails(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const query = paginationQuerySchema.parse(req.query);
    const userId = req.user!.id;

    const data = await listSentEmails(userId, query.limit, query.offset);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function handleGetQueueStats(
  _req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const counts = await emailQueue.getJobCounts(
      'waiting',
      'active',
      'completed',
      'failed',
      'delayed',
      'paused'
    );
    res.json({
      status: 'healthy',
      concurrency: env.WORKER_CONCURRENCY,
      minDelayMs: env.MIN_DELAY_BETWEEN_EMAILS_MS,
      maxEmailsPerHour: env.MAX_EMAILS_PER_HOUR,
      queue: counts,
    });
  } catch (err) {
    next(err);
  }
}

export async function handlePurgeQueue(
  _req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const countsBefore = await emailQueue.getJobCounts(
      'waiting',
      'active',
      'delayed',
      'completed',
      'failed'
    );

    // 1. Drain waiting jobs
    await emailQueue.drain(true);

    // 2. Remove all delayed jobs from BullMQ explicitly
    try {
      const delayed = await emailQueue.getJobs(['delayed']);
      for (const j of delayed) {
        await j.remove().catch(() => {});
      }
    } catch {
      // Non-fatal
    }

    // 3. Reset rate limiter keys in Redis so senders have full fresh quota
    try {
      const rateKeys = await redisClient.keys('rate:*');
      const gapKeys = await redisClient.keys('gap:*');
      const allKeys = [...rateKeys, ...gapKeys];
      if (allKeys.length > 0) {
        await redisClient.del(...allKeys);
      }
    } catch {
      // Non-fatal
    }

    // 4. Find all currently scheduled emails in DB
    const pending = await prisma.email.findMany({
      where: { status: 'scheduled' },
      orderBy: { scheduledAt: 'asc' },
    });

    // 5. Re-enqueue them with immediate staggered dispatch (2s apart)
    const now = Date.now();
    if (pending.length > 0) {
      const jobs = pending.map((e, idx) => ({
        name: 'send-email',
        data: { emailId: e.id },
        opts: {
          jobId: `${e.id}-${now}-${idx}`,
          delay: Math.max(0, idx * 2000),
        },
      }));
      await emailQueue.addBulk(jobs);

      await prisma.email.updateMany({
        where: { id: { in: pending.map((p) => p.id) } },
        data: { enqueuedAt: new Date() },
      });
    }

    const countsAfter = await emailQueue.getJobCounts(
      'waiting',
      'active',
      'delayed',
      'completed',
      'failed'
    );

    res.json({
      success: true,
      message: `Rate limits reset and re-enqueued ${pending.length} emails for immediate dispatch`,
      cleared: countsBefore,
      requeuedCount: pending.length,
      remaining: countsAfter,
    });
  } catch (err) {
    next(err);
  }
}



