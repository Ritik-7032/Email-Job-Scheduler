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

  it('createBatchWithEmails chunks inserts across 1,000-row boundaries inside transaction', async () => {
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
