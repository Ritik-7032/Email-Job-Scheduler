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
