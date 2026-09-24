import { Worker, Job, DelayedError } from 'bullmq';
import nodemailer from 'nodemailer';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { EMAIL_QUEUE_NAME } from '../queue/emailQueue.js';
import { checkAndAcquireSenderSlot, releaseHourlySlot } from '../services/rateLimiter.js';
import { ScheduleJobData } from '../types/index.js';

export const transporterCache = new Map<string, nodemailer.Transporter>();

export function clearTransporterCache(): void {
  transporterCache.clear();
}

function getOrCreateTransporter(sender: { id: string; smtpUser: string; smtpPassword: string }): nodemailer.Transporter {
  let transporter = transporterCache.get(sender.id);
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: {
        user: sender.smtpUser,
        pass: sender.smtpPassword,
      },
    });
    transporterCache.set(sender.id, transporter);
  }
  return transporter;
}

export async function processEmailJob(job: Job<ScheduleJobData>, token?: string): Promise<void> {
  const { emailId } = job.data;

  const email = await prisma.email.findUnique({
    where: { id: emailId },
    include: {
      batch: true,
      sender: true,
    },
  });

  if (!email) {
    logger.warn({ emailId }, 'Email not found in database, skipping job');
    return;
  }

  if (email.status === 'sent' || email.status === 'failed') {
    logger.info({ emailId, status: email.status }, 'Email already resolved, skipping job');
    return;
  }

  const { batch, sender } = email;

  const { allowed, waitMs, windowKey } = await checkAndAcquireSenderSlot(
    sender.id,
    batch.delayMs,
    batch.hourlyLimit
  );

  if (!allowed && waitMs > 0) {
    logger.info(
      { emailId, senderId: sender.id, waitMs },
      'Job rescheduled by rate limit'
    );

    if (!token) {
      throw new Error('Worker job token required for rescheduling');
    }

    await job.moveToDelayed(Date.now() + waitMs, token);
    throw new DelayedError();
  }

  const now = new Date();
  const staleTime = new Date(Date.now() - env.STALE_PROCESSING_MS);

  const affectedRows = await prisma.$executeRaw`
    UPDATE "Email"
    SET "status" = 'processing'::"EmailStatus",
        "processingStartedAt" = ${now},
        "updatedAt" = ${now}
    WHERE "id" = ${emailId}
      AND (
        "status" = 'scheduled'::"EmailStatus"
        OR ("status" = 'processing'::"EmailStatus" AND "processingStartedAt" < ${staleTime})
      )
  `;

  if (Number(affectedRows) === 0) {
    await releaseHourlySlot(sender.id, windowKey);
    const current = await prisma.email.findUnique({
      where: { id: emailId },
      select: { status: true, processingStartedAt: true },
    });
    if (current?.status === 'processing' && current.processingStartedAt && token) {
      const delayUntilStale = Math.max(
        1000,
        current.processingStartedAt.getTime() + env.STALE_PROCESSING_MS + 1000 - Date.now()
      );
      await job.moveToDelayed(Date.now() + delayUntilStale, token);
      throw new DelayedError();
    }
    return;
  }

  const transporter = getOrCreateTransporter(sender);

  let sendInfo: nodemailer.SentMessageInfo;
  try {
    sendInfo = await transporter.sendMail({
      from: `"${sender.email}" <${sender.email}>`,
      to: email.recipient,
      subject: email.subject,
      text: email.body,
      html: email.body.replace(/\n/g, '<br/>'),
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error({ emailId, err: error.message }, 'Email failed');

    await releaseHourlySlot(sender.id, windowKey);

    const nextAttempts = email.attempts + 1;
    const maxAttempts = job.opts.attempts || 3;

    if (job.attemptsMade + 1 < maxAttempts) {
      await prisma.email.update({
        where: { id: emailId },
        data: {
          status: 'scheduled',
          attempts: nextAttempts,
          errorMessage: error.message,
        },
      });
      throw error;
    } else {
      await prisma.email.update({
        where: { id: emailId },
        data: {
          status: 'failed',
          attempts: nextAttempts,
          errorMessage: error.message,
        },
      });
      return;
    }
  }

  // Once SMTP accepts the message, status update is retried separately to prevent duplicate sending
  const previewUrl = nodemailer.getTestMessageUrl(sendInfo) || null;
  let dbUpdateSuccess = false;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await prisma.email.update({
        where: { id: emailId },
        data: {
          status: 'sent',
          sentAt: new Date(),
          messageId: sendInfo.messageId,
          previewUrl: previewUrl ? String(previewUrl) : null,
          errorMessage: null,
        },
      });
      dbUpdateSuccess = true;
      break;
    } catch (dbErr: unknown) {
      const dbError = dbErr instanceof Error ? dbErr : new Error(String(dbErr));
      logger.warn({ emailId, attempt, err: dbError.message }, 'Retrying DB update to sent status');
      await new Promise((res) => setTimeout(res, 200 * attempt));
    }
  }

  if (!dbUpdateSuccess) {
    logger.error({ emailId, messageId: sendInfo.messageId }, 'Failed to record sent status after successful SMTP dispatch');
  }

  logger.info(
    { emailId, recipient: email.recipient, messageId: sendInfo.messageId, previewUrl },
    'Email sent'
  );
  logger.info({ jobId: job.id, emailId }, 'Job processed');
}

export function createEmailWorker(): Worker<ScheduleJobData> {
  const worker = new Worker<ScheduleJobData>(
    EMAIL_QUEUE_NAME,
    async (job, token) => {
      await processEmailJob(job, token);
    },
    {
      connection: {
        url: env.REDIS_URL,
      },
      concurrency: env.WORKER_CONCURRENCY,
    }
  );

  worker.on('failed', (job, err) => {
    if (err instanceof DelayedError) {
      return;
    }
    logger.warn({ jobId: job?.id, err: err.message }, 'Worker job failure handler triggered');
  });

  return worker;
}
