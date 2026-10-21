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
  useChunkedStrategy?: boolean;
}

export interface CreatedBatchResult {
  batch: Batch;
  emails: Email[];
}

const DB_CHUNK_SIZE = 1000;

export async function createBatchWithEmails(
  input: CreateBatchInput
): Promise<CreatedBatchResult> {
  const { userId, subject, body, recipients, startAt, delayMs, hourlyLimit, senders } =
    input;

  const useChunked = input.useChunkedStrategy ?? process.env.INGESTION_STRATEGY === 'chunked';
  const startTimeMs = startAt.getTime();
  const now = new Date();

  return prisma.$transaction(
    async (tx) => {
      const batch = await tx.batch.create({
        data: {
          userId,
          delayMs,
          hourlyLimit,
          startAt,
        },
      });

      const emailData: Email[] = recipients.map((recipient, index) => {
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
          sentAt: null,
          errorMessage: null,
          messageId: null,
          previewUrl: null,
          enqueuedAt: null,
          processingStartedAt: null,
          createdAt: now,
          updatedAt: now,
        };
      });

      if (useChunked || typeof (tx as any).$executeRaw !== 'function') {
        // Chunk DB inserts (baseline comparison path or fallback when $executeRaw is not mocked)
        for (let i = 0; i < emailData.length; i += DB_CHUNK_SIZE) {
          const chunk = emailData.slice(i, i + DB_CHUNK_SIZE);
          await tx.email.createMany({
            data: chunk.map((e) => ({
              id: e.id,
              userId: e.userId,
              batchId: e.batchId,
              senderId: e.senderId,
              recipient: e.recipient,
              subject: e.subject,
              body: e.body,
              scheduledAt: e.scheduledAt,
              status: e.status,
              attempts: e.attempts,
            })),
          });
        }
      } else if (emailData.length > 0) {
        // Production path: Single-roundtrip unnest insert inside the same transaction
        const ids: string[] = [];
        const userIds: string[] = [];
        const batchIds: string[] = [];
        const senderIds: string[] = [];
        const recips: string[] = [];
        const subjects: string[] = [];
        const bodies: string[] = [];
        const scheduledAts: Date[] = [];
        const statuses: string[] = [];
        const attempts: number[] = [];
        const createdAts: Date[] = [];
        const updatedAts: Date[] = [];

        for (let i = 0; i < emailData.length; i++) {
          const e = emailData[i];
          ids.push(e.id);
          userIds.push(e.userId);
          batchIds.push(e.batchId);
          senderIds.push(e.senderId);
          recips.push(e.recipient);
          subjects.push(e.subject);
          bodies.push(e.body);
          scheduledAts.push(e.scheduledAt);
          statuses.push(e.status);
          attempts.push(e.attempts);
          createdAts.push(e.createdAt);
          updatedAts.push(e.updatedAt);
        }

        await tx.$executeRaw`
          INSERT INTO "Email" (
            "id", "userId", "batchId", "senderId", "recipient",
            "subject", "body", "scheduledAt", "status", "attempts",
            "createdAt", "updatedAt"
          )
          SELECT
            u.id, u.user_id, u.batch_id, u.sender_id, u.recipient,
            u.subject, u.body, u.scheduled_at, u.status::"EmailStatus", u.attempts,
            u.created_at, u.updated_at
          FROM unnest(
            ${ids}::text[],
            ${userIds}::text[],
            ${batchIds}::text[],
            ${senderIds}::text[],
            ${recips}::text[],
            ${subjects}::text[],
            ${bodies}::text[],
            ${scheduledAts}::timestamp[],
            ${statuses}::text[],
            ${attempts}::int[],
            ${createdAts}::timestamp[],
            ${updatedAts}::timestamp[]
          ) AS u(
            id, user_id, batch_id, sender_id, recipient,
            subject, body, scheduled_at, status, attempts,
            created_at, updated_at
          )
        `;
      }

      return {
        batch,
        emails: emailData,
      };
    },
    {
      maxWait: 15000,
      timeout: 60000,
    }
  );
}

export async function markEmailsAsEnqueued(emailIds: string[]): Promise<void> {
  if (emailIds.length === 0) return;

  const now = new Date();
  for (let i = 0; i < emailIds.length; i += DB_CHUNK_SIZE) {
    const chunk = emailIds.slice(i, i + DB_CHUNK_SIZE);
    await prisma.email.updateMany({
      where: {
        id: { in: chunk },
      },
      data: {
        enqueuedAt: now,
      },
    });
  }
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
