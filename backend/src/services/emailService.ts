import { getAllSenders } from '../repositories/senderRepository.js';
import {
  createBatchWithEmails,
  markEmailsAsEnqueued,
  getScheduledEmails,
  getSentEmails,
} from '../repositories/emailRepository.js';
import { emailQueue } from '../queue/emailQueue.js';
import { ScheduleEmailInput } from '../validators/scheduleValidator.js';
import { logger } from '../lib/logger.js';

export async function scheduleEmails(
  userId: string,
  input: ScheduleEmailInput
): Promise<{ batchId: string; count: number }> {
  const senders = await getAllSenders();
  if (senders.length === 0) {
    throw new Error('No sender accounts configured. Please seed sender accounts first.');
  }

  const startAt = new Date(input.startAt);

  const { batch, emails } = await createBatchWithEmails({
    userId,
    subject: input.subject,
    body: input.body,
    recipients: input.recipients,
    startAt,
    delayMs: input.delayMs,
    hourlyLimit: input.hourlyLimit,
    senders,
  });

  const now = Date.now();
  const jobs = emails.map((email) => ({
    name: 'send-email',
    data: {
      emailId: email.id,
    },
    opts: {
      jobId: email.id,
      delay: Math.max(0, email.scheduledAt.getTime() - now),
    },
  }));

  const QUEUE_CHUNK_SIZE = 1000;
  for (let i = 0; i < jobs.length; i += QUEUE_CHUNK_SIZE) {
    const chunk = jobs.slice(i, i + QUEUE_CHUNK_SIZE);
    await emailQueue.addBulk(chunk);
  }

  const emailIds = emails.map((e) => e.id);
  await markEmailsAsEnqueued(emailIds);

  logger.info(
    { batchId: batch.id, count: emails.length, userId },
    'Successfully scheduled email batch'
  );

  return {
    batchId: batch.id,
    count: emails.length,
  };
}

export async function listScheduledEmails(
  userId: string,
  limit: number,
  offset: number
) {
  return getScheduledEmails(userId, limit, offset);
}

export async function listSentEmails(
  userId: string,
  limit: number,
  offset: number
) {
  return getSentEmails(userId, limit, offset);
}
