import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processEmailJob, clearTransporterCache } from '../workers/emailWorker.js';
import { prisma } from '../lib/prisma.js';
import * as rateLimiter from '../services/rateLimiter.js';
import { DelayedError } from 'bullmq';
import nodemailer from 'nodemailer';
import { EmailStatus } from '@prisma/client';

describe('Worker Lifecycle and Job Processing Engine', () => {
  const mockEmail = {
    id: 'email-123',
    userId: 'user-1',
    batchId: 'batch-1',
    senderId: 'sender-1',
    recipient: 'client@example.com',
    subject: 'Welcome',
    body: 'Hello and welcome!',
    scheduledAt: new Date(),
    sentAt: null,
    status: EmailStatus.scheduled,
    attempts: 0,
    errorMessage: null,
    messageId: null,
    previewUrl: null,
    enqueuedAt: new Date(),
    processingStartedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    batch: {
      id: 'batch-1',
      userId: 'user-1',
      delayMs: 2000,
      hourlyLimit: 100,
      startAt: new Date(),
      createdAt: new Date(),
    },
    sender: {
      id: 'sender-1',
      email: 'sender@ethereal.email',
      smtpUser: 's1',
      smtpPassword: 'p1',
      createdAt: new Date(),
    },
  };

  const createMockJob = (attemptsMade = 0, maxAttempts = 3) => ({
    id: 'job-123',
    data: { emailId: 'email-123' },
    opts: { attempts: maxAttempts },
    attemptsMade,
    moveToDelayed: vi.fn().mockResolvedValue(undefined),
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    clearTransporterCache();
  });

  it('reschedules with DelayedError when rate limited', async () => {
    vi.spyOn(prisma.email, 'findUnique').mockResolvedValue(mockEmail as any);
    const updateSpy = vi.spyOn(prisma.email, 'update').mockResolvedValue({} as any);
    vi.spyOn(rateLimiter, 'checkAndAcquireSenderSlot').mockResolvedValue({
      allowed: false,
      waitMs: 1500,
      windowKey: '2026092414',
    });

    const mockJob = createMockJob();

    await expect(
      processEmailJob(mockJob as any, 'mock-token-xyz')
    ).rejects.toThrow(DelayedError);

    expect(mockJob.moveToDelayed).toHaveBeenCalledWith(
      expect.any(Number),
      'mock-token-xyz'
    );
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('skips already sent or failed emails', async () => {
    vi.spyOn(prisma.email, 'findUnique').mockResolvedValue({
      ...mockEmail,
      status: EmailStatus.sent,
    } as any);
    const acquireSpy = vi.spyOn(rateLimiter, 'checkAndAcquireSenderSlot').mockResolvedValue({
      allowed: true,
      waitMs: 0,
      windowKey: '2026092414',
    });

    const mockJob = createMockJob();

    await processEmailJob(mockJob as any, 'token');

    expect(acquireSpy).not.toHaveBeenCalled();
  });

  it('delays job until stale timeout when claiming a recently crashed stalled job', async () => {
    const processingStartedAt = new Date(Date.now() - 30000); // 30s ago (< 5m)
    vi.spyOn(prisma.email, 'findUnique')
      .mockResolvedValueOnce(mockEmail as any)
      .mockResolvedValueOnce({
        status: EmailStatus.processing,
        processingStartedAt,
      } as any);

    vi.spyOn(rateLimiter, 'checkAndAcquireSenderSlot').mockResolvedValue({
      allowed: true,
      waitMs: 0,
      windowKey: '2026092414',
    });
    vi.spyOn(prisma, '$executeRaw').mockResolvedValue(0 as any);
    const releaseSpy = vi.spyOn(rateLimiter, 'releaseHourlySlot').mockResolvedValue();

    const mockJob = createMockJob();

    await expect(
      processEmailJob(mockJob as any, 'token-stalled')
    ).rejects.toThrow(DelayedError);

    expect(releaseSpy).toHaveBeenCalledWith('sender-1', '2026092414');
    expect(mockJob.moveToDelayed).toHaveBeenCalledWith(
      expect.any(Number),
      'token-stalled'
    );
  });

  it('sends email successfully, updates status to sent and records previewUrl', async () => {
    vi.spyOn(prisma.email, 'findUnique').mockResolvedValue(mockEmail as any);
    vi.spyOn(rateLimiter, 'checkAndAcquireSenderSlot').mockResolvedValue({
      allowed: true,
      waitMs: 0,
      windowKey: '2026092414',
    });
    vi.spyOn(prisma, '$executeRaw').mockResolvedValue(1 as any);

    const mockSendMail = vi.fn().mockResolvedValue({
      messageId: '<msg-123@ethereal.email>',
    });

    vi.spyOn(nodemailer, 'createTransport').mockReturnValue({
      sendMail: mockSendMail,
    } as any);

    vi.spyOn(nodemailer, 'getTestMessageUrl').mockReturnValue(
      'https://ethereal.email/message/xyz' as any
    );

    const updateSpy = vi.spyOn(prisma.email, 'update').mockResolvedValue({} as any);

    const mockJob = createMockJob();

    await processEmailJob(mockJob as any, 'token');

    expect(mockSendMail).toHaveBeenCalled();
    expect(updateSpy).toHaveBeenCalledWith({
      where: { id: 'email-123' },
      data: expect.objectContaining({
        status: 'sent',
        messageId: '<msg-123@ethereal.email>',
        previewUrl: 'https://ethereal.email/message/xyz',
      }),
    });
  });

  it('handles transient SMTP failure: sets status back to scheduled, releases slot and rethrows', async () => {
    vi.spyOn(prisma.email, 'findUnique').mockResolvedValue(mockEmail as any);
    vi.spyOn(rateLimiter, 'checkAndAcquireSenderSlot').mockResolvedValue({
      allowed: true,
      waitMs: 0,
      windowKey: '2026092414',
    });
    vi.spyOn(prisma, '$executeRaw').mockResolvedValue(1 as any);

    vi.spyOn(nodemailer, 'createTransport').mockReturnValue({
      sendMail: vi.fn().mockRejectedValue(new Error('SMTP Connection timeout')),
    } as any);

    const releaseSpy = vi.spyOn(rateLimiter, 'releaseHourlySlot').mockResolvedValue();
    const updateSpy = vi.spyOn(prisma.email, 'update').mockResolvedValue({} as any);

    const mockJob = createMockJob(0, 3);

    await expect(processEmailJob(mockJob as any, 'token')).rejects.toThrow('SMTP Connection timeout');

    expect(releaseSpy).toHaveBeenCalledWith('sender-1', '2026092414');
    expect(updateSpy).toHaveBeenCalledWith({
      where: { id: 'email-123' },
      data: expect.objectContaining({
        status: 'scheduled',
        attempts: 1,
        errorMessage: 'SMTP Connection timeout',
      }),
    });
  });

  it('handles final attempt failure: marks email as failed when attempts exhausted', async () => {
    vi.spyOn(prisma.email, 'findUnique').mockResolvedValue({
      ...mockEmail,
      attempts: 2,
    } as any);
    vi.spyOn(rateLimiter, 'checkAndAcquireSenderSlot').mockResolvedValue({
      allowed: true,
      waitMs: 0,
      windowKey: '2026092414',
    });
    vi.spyOn(prisma, '$executeRaw').mockResolvedValue(1 as any);

    vi.spyOn(nodemailer, 'createTransport').mockReturnValue({
      sendMail: vi.fn().mockRejectedValue(new Error('Invalid recipient mailbox')),
    } as any);

    const releaseSpy = vi.spyOn(rateLimiter, 'releaseHourlySlot').mockResolvedValue();
    const updateSpy = vi.spyOn(prisma.email, 'update').mockResolvedValue({} as any);

    const mockJob = createMockJob(2, 3);

    await processEmailJob(mockJob as any, 'token');

    expect(releaseSpy).toHaveBeenCalledWith('sender-1', '2026092414');
    expect(updateSpy).toHaveBeenCalledWith({
      where: { id: 'email-123' },
      data: expect.objectContaining({
        status: 'failed',
        attempts: 3,
        errorMessage: 'Invalid recipient mailbox',
      }),
    });
  });
});
