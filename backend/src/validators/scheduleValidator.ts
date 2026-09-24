import { z } from 'zod';
import { env } from '../config/env.js';

export const scheduleEmailSchema = z.object({
  subject: z
    .string()
    .trim()
    .min(1, 'Subject is required')
    .max(200, 'Subject must be 200 characters or less'),
  body: z
    .string()
    .trim()
    .min(1, 'Body is required')
    .max(20000, 'Body must be 20000 characters or less'),
  recipients: z
    .array(z.string().trim().email('Invalid email address'))
    .min(1, 'At least one recipient is required')
    .max(
      env.MAX_RECIPIENTS_PER_REQUEST,
      `Cannot exceed ${env.MAX_RECIPIENTS_PER_REQUEST} recipients per request`
    )
    .transform((emails) => Array.from(new Set(emails.map((e) => e.toLowerCase())))),
  startAt: z
    .string()
    .datetime({ offset: true })
    .refine(
      (val) => new Date(val).getTime() > Date.now(),
      'startAt must be a valid future timestamp'
    ),
  delayMs: z
    .coerce
    .number()
    .min(
      env.MIN_DELAY_BETWEEN_EMAILS_MS,
      `delayMs must be at least ${env.MIN_DELAY_BETWEEN_EMAILS_MS} ms`
    ),
  hourlyLimit: z
    .coerce
    .number()
    .min(1, 'hourlyLimit must be at least 1')
    .max(
      env.MAX_EMAILS_PER_HOUR,
      `hourlyLimit cannot exceed ${env.MAX_EMAILS_PER_HOUR}`
    ),
});

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

export type ScheduleEmailInput = z.infer<typeof scheduleEmailSchema>;
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
