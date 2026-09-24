import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBatchWithEmails } from '../repositories/emailRepository.js';
import { scheduleEmails } from '../services/emailService.js';
import { prisma } from '../lib/prisma.js';
import { emailQueue } from '../queue/emailQueue.js';
import * as senderRepo from '../repositories/senderRepository.js';
import { Sender, EmailStatus } from '@prisma/client';

describe('Batch Staggering and Queue Job Dispatching', () => {
  const mockSenders: Sender[] = [
    {
      id: 'sender-1',
      email: 'sender1@ethereal.email',
      smtpUser: 's1',
      smtpPassword: 'p1',
      createdAt: new Date(),
    },
    {
      id: 'sender-2',
      email: 'sender2@ethereal.email',
      smtpUser: 's2',
      smtpPassword: 'p2',
      createdAt: new Date(),
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calculates scheduledAt with correct staggering per email recipient', async () => {
    const startAt = new Date(Date.now() + 60000);
    const delayMs = 2000;
    const recipients = ['user1@test.com', 'user2@test.com', 'user3@test.com'];

    const mockBatch = {
      id: 'batch-123',
      userId: 'user-1',
      delayMs,
      hourlyLimit: 100,
      startAt,
      createdAt: new Date(),
    };

    const mockCreatedEmails = recipients.map((r, i) => ({
      id: `email-${i}`,
      userId: 'user-1',
      batchId: mockBatch.id,
      senderId: mockSenders[i % mockSenders.length].id,
      recipient: r,
      subject: 'Test Subject',
      body: 'Test Body',
      scheduledAt: new Date(startAt.getTime() + i * delayMs),
      sentAt: null,
      status: EmailStatus.scheduled,
      attempts: 0,
      errorMessage: null,
      messageId: null,
      previewUrl: null,
      enqueuedAt: null,
      processingStartedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
      return callback({
        batch: {
          create: vi.fn().mockResolvedValue(mockBatch),
        },
        email: {
          createMany: vi.fn().mockResolvedValue({ count: recipients.length }),
          findMany: vi.fn().mockResolvedValue(mockCreatedEmails),
        },
      });
    });

    const result = await createBatchWithEmails({
      userId: 'user-1',
      subject: 'Test Subject',
      body: 'Test Body',
      recipients,
      startAt,
      delayMs,
      hourlyLimit: 100,
      senders: mockSenders,
    });

    expect(result.emails.length).toBe(3);
    expect(result.emails[0].scheduledAt.getTime()).toBe(startAt.getTime());
    expect(result.emails[1].scheduledAt.getTime()).toBe(startAt.getTime() + 2000);
    expect(result.emails[2].scheduledAt.getTime()).toBe(startAt.getTime() + 4000);

    expect(result.emails[0].senderId).toBe('sender-1');
    expect(result.emails[1].senderId).toBe('sender-2');
    expect(result.emails[2].senderId).toBe('sender-1');
  });

  it('enqueues jobs to BullMQ with jobId = emailId and correct delay', async () => {
    const startAt = new Date(Date.now() + 10000);
    const delayMs = 3000;
    const recipients = ['alpha@test.com', 'beta@test.com'];

    vi.spyOn(senderRepo, 'getAllSenders').mockResolvedValue(mockSenders);

    const mockBatch = {
      id: 'batch-abc',
      userId: 'user-1',
      delayMs,
      hourlyLimit: 50,
      startAt,
      createdAt: new Date(),
    };

    const mockEmails = recipients.map((r, i) => ({
      id: `uuid-email-${i}`,
      userId: 'user-1',
      batchId: mockBatch.id,
      senderId: mockSenders[i % mockSenders.length].id,
      recipient: r,
      subject: 'Subject',
      body: 'Body',
      scheduledAt: new Date(startAt.getTime() + i * delayMs),
      sentAt: null,
      status: EmailStatus.scheduled,
      attempts: 0,
      errorMessage: null,
      messageId: null,
      previewUrl: null,
      enqueuedAt: null,
      processingStartedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
      return callback({
        batch: {
          create: vi.fn().mockResolvedValue(mockBatch),
        },
        email: {
          createMany: vi.fn().mockResolvedValue({ count: recipients.length }),
          findMany: vi.fn().mockResolvedValue(mockEmails),
        },
      });
    });

    const addBulkSpy = vi.spyOn(emailQueue, 'addBulk').mockResolvedValue([] as any);
    const updateManySpy = vi.spyOn(prisma.email, 'updateMany').mockResolvedValue({ count: 2 });

    const response = await scheduleEmails('user-1', {
      subject: 'Subject',
      body: 'Body',
      recipients,
      startAt: startAt.toISOString(),
      delayMs,
      hourlyLimit: 50,
    });

    expect(response.batchId).toBe('batch-abc');
    expect(response.count).toBe(2);

    expect(addBulkSpy).toHaveBeenCalledTimes(1);
    const queuedJobs = addBulkSpy.mock.calls[0][0];

    expect(queuedJobs.length).toBe(2);
    expect(queuedJobs[0].opts.jobId).toBe('uuid-email-0');
    expect(queuedJobs[0].data.emailId).toBe('uuid-email-0');
    expect(queuedJobs[0].opts.delay).toBeGreaterThanOrEqual(9000);

    expect(queuedJobs[1].opts.jobId).toBe('uuid-email-1');
    expect(queuedJobs[1].data.emailId).toBe('uuid-email-1');
    expect(queuedJobs[1].opts.delay).toBeGreaterThanOrEqual(12000);

    expect(updateManySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['uuid-email-0', 'uuid-email-1'] } },
      })
    );
  });
});
