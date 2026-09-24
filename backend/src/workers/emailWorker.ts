import { Worker, Job, DelayedError } from 'bullmq';
import nodemailer from 'nodemailer';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { EMAIL_QUEUE_NAME } from '../queue/emailQueue.js';
import { checkAndAcquireSenderSlot, releaseHourlySlot } from '../services/rateLimiter.js';
import { ScheduleJobData } from '../types/index.js';

export async function processEmailJob(job: Job<ScheduleJobData>, token?: string): Promise<void> {
  const { emailId } = job.data;

  // 1. Load email
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

  // 2. Check & acquire rate/gap slot
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

  // 3. Atomic claim
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
    logger.info({ emailId }, 'Email already claimed or not in schedulable state');
    await releaseHourlySlot(sender.id, windowKey);
    return;
  }

  // 4. Send email via nodemailer
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: {
      user: sender.smtpUser,
      pass: sender.smtpPassword,
    },
  });

  try {
    const info = await transporter.sendMail({
      from: `"${sender.email}" <${sender.email}>`,
      to: email.recipient,
      subject: email.subject,
      text: email.body,
      html: email.body.replace(/\n/g, '<br/>'),
    });

    const previewUrl = nodemailer.getTestMessageUrl(info) || null;

    await prisma.email.update({
      where: { id: emailId },
      data: {
        status: 'sent',
        sentAt: new Date(),
        messageId: info.messageId,
        previewUrl: previewUrl ? String(previewUrl) : null,
        errorMessage: null,
      },
    });

    logger.info(
      { emailId, recipient: email.recipient, messageId: info.messageId, previewUrl },
      'Email sent'
    );
  } catch (err: any) {
    logger.error({ emailId, err: err.message }, 'Email failed');

    // Release reserved slot
    await releaseHourlySlot(sender.id, windowKey);

    const nextAttempts = email.attempts + 1;
    const maxAttempts = job.opts.attempts || 3;

    if (job.attemptsMade + 1 < maxAttempts) {
      await prisma.email.update({
        where: { id: emailId },
        data: {
          status: 'scheduled',
          attempts: nextAttempts,
          errorMessage: err.message || 'SMTP dispatch error',
        },
      });
      throw err;
    } else {
      await prisma.email.update({
        where: { id: emailId },
        data: {
          status: 'failed',
          attempts: nextAttempts,
          errorMessage: err.message || 'SMTP dispatch error',
        },
      });
    }
  }

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
