import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import { Sender, Batch, Email, EmailStatus } from '@prisma/client';

export interface CreateBatchInput {
  userId: string;
  subject: string;
  body: string;
  recipients: string[];
  startAt: Date;
  delayMs: number;
  hourlyLimit: number;
  senders: Sender[];
}

export interface CreatedBatchResult {
  batch: Batch;
  emails: Email[];
}

export async function createBatchWithEmails(
  input: CreateBatchInput
): Promise<CreatedBatchResult> {
  const { userId, subject, body, recipients, startAt, delayMs, hourlyLimit, senders } =
    input;

  const startTimeMs = startAt.getTime();

  return prisma.$transaction(async (tx) => {
    const batch = await tx.batch.create({
      data: {
        userId,
        delayMs,
        hourlyLimit,
        startAt,
      },
    });

    const emailData = recipients.map((recipient, index) => {
      const assignedSender = senders[index % senders.length];
      const scheduledAt = new Date(startTimeMs + index * delayMs);
      return {
        id: crypto.randomUUID(),
        userId,
        batchId: batch.id,
        senderId: assignedSender.id,
        recipient,
        subject,
        body,
        scheduledAt,
        status: EmailStatus.scheduled,
        attempts: 0,
      };
    });

    await tx.email.createMany({
      data: emailData,
    });

    const createdEmails = await tx.email.findMany({
      where: {
        batchId: batch.id,
      },
      orderBy: {
        scheduledAt: 'asc',
      },
    });

    return {
      batch,
      emails: createdEmails,
    };
  });
}

export async function markEmailsAsEnqueued(emailIds: string[]): Promise<void> {
  if (emailIds.length === 0) return;

  await prisma.email.updateMany({
    where: {
      id: { in: emailIds },
    },
    data: {
      enqueuedAt: new Date(),
    },
  });
}

export async function getScheduledEmails(
  userId: string,
  limit: number,
  offset: number
): Promise<{ items: Email[]; total: number }> {
  const where = {
    userId,
    status: {
      in: [EmailStatus.scheduled, EmailStatus.processing],
    },
  };

  const [total, items] = await Promise.all([
    prisma.email.count({ where }),
    prisma.email.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: {
        scheduledAt: 'asc',
      },
      include: {
        sender: {
          select: {
            email: true,
          },
        },
      },
    }),
  ]);

  return { items, total };
}

export async function getSentEmails(
  userId: string,
  limit: number,
  offset: number
): Promise<{ items: Email[]; total: number }> {
  const where = {
    userId,
    status: {
      in: [EmailStatus.sent, EmailStatus.failed],
    },
  };

  const [total, items] = await Promise.all([
    prisma.email.count({ where }),
    prisma.email.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: [{ sentAt: 'desc' }, { updatedAt: 'desc' }],
      include: {
        sender: {
          select: {
            email: true,
          },
        },
      },
    }),
  ]);

  return { items, total };
}
