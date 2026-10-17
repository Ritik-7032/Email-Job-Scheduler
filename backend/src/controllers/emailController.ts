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


