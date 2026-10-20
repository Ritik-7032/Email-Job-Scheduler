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
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
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
  const effectiveLimit = Math.min(batch.hourlyLimit, env.MAX_EMAILS_PER_HOUR);

  const { allowed, waitMs, windowKey } = await checkAndAcquireSenderSlot(
    sender.id,
    batch.delayMs,
    effectiveLimit
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
  const deterministicMessageId = `<${email.id}@scheduler.internal>`;

  let sendInfo: nodemailer.SentMessageInfo;
  try {
    const isSafeUrl = (url: string) =>
      /^(https?:\/\/|data:(image|application|text)\/[a-zA-Z0-9.+-]+;base64,)/i.test(url.trim());

    const escapeHtmlAttr = (str: string) =>
      str
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const sanitizeRawHtml = (raw: string) =>
      raw
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
        .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
        .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '')
        .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, '')
        .replace(/\son\w+\s*=[^\s>]+/gi, '')
        .replace(
          /(href|src)\s*=\s*(?:"(?:javascript|data):[^"]*"|'(?:javascript|data):[^']*'|(?:javascript|data):[^\s>]+)/gi,
          '$1="#"'
        );

    const formatBodyToHtml = (content: string) => {
      // 1. Process images and attachments first to avoid syntax collisions with asterisks in URLs
      let html = content
        .replace(
          /!\[(.*?)\]\((.*?)\)/g,
          (_match, alt, src) =>
            isSafeUrl(src)
              ? `<div style="margin: 12px 0;"><img src="${escapeHtmlAttr(src)}" alt="${escapeHtmlAttr(alt)}" style="max-width: 100%; max-height: 400px; border-radius: 12px; display: block;" /></div>`
              : `<div style="margin: 12px 0;">[Image: ${escapeHtmlAttr(alt)}]</div>`
        )
        .replace(
          /📎\s*\[Attachment:\s*(.*?)\]\((.*?)\)/g,
          (_match, name, href) =>
            isSafeUrl(href)
              ? `<div style="margin: 8px 0;"><a href="${escapeHtmlAttr(href)}" download="${escapeHtmlAttr(name)}" style="display:inline-block; padding:8px 14px; background:#f4f6f5; border:1px solid #e0e0e0; border-radius:8px; text-decoration:none; color:#1a1a1a; font-family:sans-serif; font-size:12px; font-weight:600;">📎 ${escapeHtmlAttr(name)}</a></div>`
              : `<div style="margin: 8px 0;">📎 ${escapeHtmlAttr(name)}</div>`
        )
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
        .replace(/\*(.*?)\*/g, '<i>$1</i>')
        .replace(/~~(.*?)~~/g, '<s>$1</s>');

      if (!/<[a-z][\s\S]*>/i.test(content)) {
        html = html.replace(/\n/g, '<br/>');
      } else {
        html = sanitizeRawHtml(html);
      }
      return html;
    };

    // Extract genuine MIME attachments from body if embedded as data URLs
    const mimeAttachments: Array<{ filename: string; content: Buffer; contentType?: string }> = [];
    const attachmentRegex = /📎\s*\[Attachment:\s*(.*?)\]\((data:([^;]+);base64,([^)]+))\)/g;
    let match: RegExpExecArray | null;
    while ((match = attachmentRegex.exec(email.body)) !== null) {
      try {
        const filename = match[1].replace(/\s*\([^)]*\)$/, '').trim() || 'attachment';
        const contentType = match[3];
        const base64Data = match[4];
        mimeAttachments.push({
          filename,
          content: Buffer.from(base64Data, 'base64'),
          contentType,
        });
      } catch {
        // Ignore malformed attachment payloads
      }
    }

    try {
      sendInfo = await transporter.sendMail({
        from: `"${sender.email}" <${sender.email}>`,
        to: email.recipient,
        subject: email.subject,
        text: email.body,
        html: formatBodyToHtml(email.body),
        messageId: deterministicMessageId,
        attachments: mimeAttachments.length > 0 ? mimeAttachments : undefined,
      });
    } catch (smtpErr: unknown) {
      const err = smtpErr instanceof Error ? smtpErr : new Error(String(smtpErr));
      const isDemoMode = env.DEMO_SIMULATE_SMTP || process.env.DEMO_SIMULATE_SMTP === 'true';

      if (isDemoMode) {
        logger.warn(
          { emailId, err: err.message },
          'DEMO_SIMULATE_SMTP enabled: executing simulated delivery for restricted cloud environment'
        );
        const fallbackTransporter = nodemailer.createTransport({ jsonTransport: true });
        sendInfo = await fallbackTransporter.sendMail({
          from: `"${sender.email}" <${sender.email}>`,
          to: email.recipient,
          subject: email.subject,
          text: email.body,
          html: formatBodyToHtml(email.body),
          messageId: deterministicMessageId,
        });
        sendInfo.messageId = deterministicMessageId;
      } else {
        throw err;
      }
    }
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

  // Once message accepted, status update is retried separately to prevent duplicate sending
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
    logger.error({ emailId, messageId: sendInfo.messageId }, 'Failed to record sent status after dispatch');
  }

  logger.info(
    { emailId, recipient: email.recipient, messageId: sendInfo.messageId, previewUrl },
    'Email sent'
  );
  logger.info({ jobId: job.id, emailId }, 'Job processed');
}

import { parseRedisOptions } from '../lib/redis.js';

export function createEmailWorker(): Worker<ScheduleJobData> {
  const worker = new Worker<ScheduleJobData>(
    EMAIL_QUEUE_NAME,
    async (job, token) => {
      await processEmailJob(job, token);
    },
    {
      connection: parseRedisOptions(env.REDIS_URL),
      concurrency: env.WORKER_CONCURRENCY,
    }
  );

  worker.on('failed', (job, err) => {
    if (err instanceof DelayedError) {
      return;
    }
    logger.warn({ jobId: job?.id, err: err.message }, 'Worker job failure handler triggered');
  });

  worker.on('error', (err) => {
    logger.error({ err: err.message }, 'BullMQ Worker connection error');
  });

  return worker;
}
