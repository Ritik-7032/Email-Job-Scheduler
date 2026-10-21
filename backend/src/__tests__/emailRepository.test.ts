import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createBatchWithEmails,
  markEmailsAsEnqueued,
  getScheduledEmails,
  getSentEmails,
} from '../repositories/emailRepository.js';
import { getAllSenders } from '../repositories/senderRepository.js';
import { prisma } from '../lib/prisma.js';
import nodemailer from 'nodemailer';
import { EmailStatus } from '@prisma/client';

describe('Email & Sender Repository Database Operations', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockSenders = [
    {
      id: 'sender-1',
      email: 's1@example.com',
      smtpUser: 's1',
      smtpPassword: 'p1',
      createdAt: new Date(),
    },
    {
      id: 'sender-2',
      email: 's2@example.com',
      smtpUser: 's2',
      smtpPassword: 'p2',
      createdAt: new Date(),
    },
  ];

  it('createBatchWithEmails chunks inserts across 1,000-row boundaries inside transaction (chunked strategy)', async () => {
    const recipients = Array.from({ length: 1500 }, (_, i) => `user${i}@example.com`);

    let createBatchCall: any;
    let createManyCalls: any[] = [];

    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
      const mockTx = {
        batch: {
          create: vi.fn().mockImplementation(async (args) => {
            createBatchCall = args;
            return { id: 'batch-test-1', ...args.data, createdAt: new Date() };
          }),
        },
        email: {
          createMany: vi.fn().mockImplementation(async (args) => {
            createManyCalls.push(args);
            return { count: args.data.length };
          }),
        },
      };
      return callback(mockTx);
    });

    const result = await createBatchWithEmails({
      userId: 'user-bench-1',
      subject: 'Batch Subject',
      body: 'Batch Body',
      recipients,
      startAt: new Date(1700000000000),
      delayMs: 2000,
      hourlyLimit: 200,
      senders: mockSenders as any,
      useChunkedStrategy: true,
    });

    expect(result.batch.id).toBe('batch-test-1');
    expect(result.emails.length).toBe(1500);

    // Verify staggered timestamps
    expect(result.emails[0].scheduledAt.getTime()).toBe(1700000000000);
    expect(result.emails[1].scheduledAt.getTime()).toBe(1700000002000);

    // 1500 rows should be split into 2 createMany chunks (1000 and 500)
    expect(createManyCalls.length).toBe(2);
    expect(createManyCalls[0].data.length).toBe(1000);
    expect(createManyCalls[1].data.length).toBe(500);
  });

  describe('Unnest Single-Roundtrip Ingestion Path (Production Default)', () => {
    it('correctly ingests 1 recipient with precise field values, status, and UUID', async () => {
      let rawSqlArgs: any[] = [];
      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const mockTx = {
          batch: {
            create: vi.fn().mockResolvedValue({ id: 'batch-single', userId: 'user-1' }),
          },
          $executeRaw: vi.fn().mockImplementation(async (...args: any[]) => {
            rawSqlArgs = args;
            return 1;
          }),
        };
        return callback(mockTx);
      });

      const startAt = new Date('2026-10-21T10:00:00Z');
      const result = await createBatchWithEmails({
        userId: 'user-1',
        subject: 'Single Email',
        body: 'Single Body Content',
        recipients: ['single@example.com'],
        startAt,
        delayMs: 1500,
        hourlyLimit: 100,
        senders: mockSenders as any,
      });

      expect(result.batch.id).toBe('batch-single');
      expect(result.emails.length).toBe(1);

      const email = result.emails[0];
      expect(email.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(email.userId).toBe('user-1');
      expect(email.batchId).toBe('batch-single');
      expect(email.senderId).toBe('sender-1');
      expect(email.recipient).toBe('single@example.com');
      expect(email.subject).toBe('Single Email');
      expect(email.body).toBe('Single Body Content');
      expect(email.status).toBe(EmailStatus.scheduled);
      expect(email.attempts).toBe(0);
      expect(email.sentAt).toBeNull();
      expect(email.enqueuedAt).toBeNull();
      expect(email.scheduledAt.getTime()).toBe(startAt.getTime());

      // Verify executeRaw arguments passed as parameterized arrays
      expect(rawSqlArgs.length).toBeGreaterThan(0);
      const passedIds = rawSqlArgs[1];
      const passedRecipients = rawSqlArgs[5];
      expect(passedIds).toEqual([email.id]);
      expect(passedRecipients).toEqual(['single@example.com']);
    });

    it('correctly handles 1,000 recipients with round-robin sender assignment and staggered scheduledAt', async () => {
      let executeRawCalled = false;
      let passedValues: any[] = [];
      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const mockTx = {
          batch: {
            create: vi.fn().mockResolvedValue({ id: 'batch-1k', userId: 'user-1' }),
          },
          $executeRaw: vi.fn().mockImplementation(async (...args: any[]) => {
            executeRawCalled = true;
            passedValues = args;
            return 1000;
          }),
        };
        return callback(mockTx);
      });

      const count = 1000;
      const recipients = Array.from({ length: count }, (_, i) => `recip${i}@test.com`);
      const startAt = new Date('2026-10-21T12:00:00Z');
      const delayMs = 3000;

      const result = await createBatchWithEmails({
        userId: 'user-1',
        subject: '1k Campaign',
        body: '1k Campaign Body',
        recipients,
        startAt,
        delayMs,
        hourlyLimit: 500,
        senders: mockSenders as any,
      });

      expect(result.emails.length).toBe(1000);
      expect(executeRawCalled).toBe(true);

      // Verify sender round-robin across the 2 mock senders
      for (let i = 0; i < count; i++) {
        const expectedSender = mockSenders[i % mockSenders.length].id;
        expect(result.emails[i].senderId).toBe(expectedSender);
        expect(result.emails[i].scheduledAt.getTime()).toBe(startAt.getTime() + i * delayMs);
        expect(result.emails[i].status).toBe(EmailStatus.scheduled);
      }
    });

    it('correctly executes a single-roundtrip query for 10,000 recipients', async () => {
      let executeRawCallCount = 0;
      let totalRowsInParams = 0;
      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const mockTx = {
          batch: {
            create: vi.fn().mockResolvedValue({ id: 'batch-10k', userId: 'user-1' }),
          },
          $executeRaw: vi.fn().mockImplementation(async (...args: any[]) => {
            executeRawCallCount++;
            const ids = args[1] as string[];
            totalRowsInParams = ids.length;
            return 10000;
          }),
        };
        return callback(mockTx);
      });

      const count = 10000;
      const recipients = Array.from({ length: count }, (_, i) => `user10k_${i}@test.com`);
      const startAt = new Date('2026-10-21T15:00:00Z');

      const result = await createBatchWithEmails({
        userId: 'user-1',
        subject: '10k Blast',
        body: '10k Blast Body',
        recipients,
        startAt,
        delayMs: 1000,
        hourlyLimit: 1000,
        senders: mockSenders as any,
      });

      expect(result.emails.length).toBe(10000);
      // Confirmed: single executeRaw call for all 10,000 rows
      expect(executeRawCallCount).toBe(1);
      expect(totalRowsInParams).toBe(10000);
    });

    it('rolls back the transaction on failure mid-transaction', async () => {
      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const mockTx = {
          batch: {
            create: vi.fn().mockResolvedValue({ id: 'batch-fail', userId: 'user-1' }),
          },
          $executeRaw: vi.fn().mockRejectedValue(new Error('PostgreSQL foreign key violation or network disconnect')),
        };
        // Simulated Prisma transaction behavior: if callback throws, the transaction rolls back and throws
        return callback(mockTx);
      });

      await expect(
        createBatchWithEmails({
          userId: 'user-1',
          subject: 'Rollback Test',
          body: 'Rollback Body',
          recipients: ['fail@test.com'],
          startAt: new Date(),
          delayMs: 1000,
          hourlyLimit: 100,
          senders: mockSenders as any,
        })
      ).rejects.toThrow('PostgreSQL foreign key violation or network disconnect');
    });
  });

  it('markEmailsAsEnqueued updates rows in chunks of 1000', async () => {
    const ids = Array.from({ length: 1200 }, (_, i) => `email-${i}`);
    const updateManySpy = vi.spyOn(prisma.email, 'updateMany').mockResolvedValue({ count: 1000 });

    await markEmailsAsEnqueued(ids);

    expect(updateManySpy).toHaveBeenCalledTimes(2);
    expect(updateManySpy.mock.calls[0][0].where.id.in.length).toBe(1000);
    expect(updateManySpy.mock.calls[1][0].where.id.in.length).toBe(200);

    // Empty array handles gracefully without db query
    updateManySpy.mockClear();
    await markEmailsAsEnqueued([]);
    expect(updateManySpy).not.toHaveBeenCalled();
  });

  it('getScheduledEmails returns scheduled/processing items with total count and pagination', async () => {
    const mockItems = [
      { id: 'e1', recipient: 'r1@test.com', status: EmailStatus.scheduled },
      { id: 'e2', recipient: 'r2@test.com', status: EmailStatus.processing },
    ];
    vi.spyOn(prisma.email, 'count').mockResolvedValue(42);
    vi.spyOn(prisma.email, 'findMany').mockResolvedValue(mockItems as any);

    const result = await getScheduledEmails('user-1', 10, 0);

    expect(result.total).toBe(42);
    expect(result.items.length).toBe(2);
    expect(prisma.email.count).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        status: { in: [EmailStatus.scheduled, EmailStatus.processing] },
      },
    });
  });

  it('getSentEmails returns sent/failed items with total count and pagination', async () => {
    const mockItems = [
      { id: 'e3', recipient: 'r3@test.com', status: EmailStatus.sent },
      { id: 'e4', recipient: 'r4@test.com', status: EmailStatus.failed },
    ];
    vi.spyOn(prisma.email, 'count').mockResolvedValue(15);
    vi.spyOn(prisma.email, 'findMany').mockResolvedValue(mockItems as any);

    const result = await getSentEmails('user-1', 10, 20);

    expect(result.total).toBe(15);
    expect(result.items.length).toBe(2);
    expect(prisma.email.count).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        status: { in: [EmailStatus.sent, EmailStatus.failed] },
      },
    });
  });

  it('getAllSenders retries on pool contention and auto-seeds Ethereal accounts if DB is empty', async () => {
    // 1st attempt fails with connection error, 2nd attempt succeeds with empty array, triggering auto-seed
    vi.spyOn(prisma.sender, 'findMany')
      .mockRejectedValueOnce(new Error('Connection pool exhausted'))
      .mockResolvedValueOnce([]);

    vi.spyOn(nodemailer, 'createTestAccount').mockResolvedValue({
      user: 'ethereal-auto@ethereal.email',
      pass: 'testpass123',
    } as any);

    const createSpy = vi.spyOn(prisma.sender, 'create').mockResolvedValue({
      id: 'sender-auto-1',
      email: 'ethereal-auto@ethereal.email',
      smtpUser: 'ethereal-auto@ethereal.email',
      smtpPassword: 'testpass123',
      createdAt: new Date(),
    });

    const senders = await getAllSenders();

    expect(senders.length).toBe(3);
    expect(createSpy).toHaveBeenCalledTimes(3);
  });
});
