import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processEmailJob } from '../workers/emailWorker.js';
import { prisma } from '../lib/prisma.js';
import * as rateLimiter from '../services/rateLimiter.js';
import { DelayedError } from 'bullmq';
import nodemailer from 'nodemailer';
import { EmailStatus } from '@prisma/client';

describe('Worker Execution Engine (Requirements 5, 6, 7)', () => {
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
  });

  it('reschedules with DelayedError when rate limited (Requirement 5)', async () => {
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
    // Email in database remains scheduled, no status change
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('skips already sent or failed emails (Requirement 6 - Idempotency)', async () => {
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

  it('skips if atomic claim fails due to concurrent worker (Requirement 6 - Concurrency)', async () => {
    vi.spyOn(prisma.email, 'findUnique').mockResolvedValue(mockEmail as any);
    vi.spyOn(rateLimiter, 'checkAndAcquireSenderSlot').mockResolvedValue({
      allowed: true,
      waitMs: 0,
      windowKey: '2026092414',
    });
    // Atomic update raw query returns 0 affected rows (already claimed by another worker)
    vi.spyOn(prisma, '$executeRaw').mockResolvedValue(0 as any);
    const releaseSpy = vi.spyOn(rateLimiter, 'releaseHourlySlot').mockResolvedValue();
    const updateSpy = vi.spyOn(prisma.email, 'update').mockResolvedValue({} as any);

    const mockJob = createMockJob();

    await processEmailJob(mockJob as any, 'token');

    expect(releaseSpy).toHaveBeenCalledWith('sender-1', '2026092414');
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('sends email successfully, updates status to sent and records previewUrl (Requirement 7 - Success)', async () => {
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

  it('handles transient failure: sets status back to scheduled, releases slot and rethrows (Requirement 7 - Retry)', async () => {
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

    const mockJob = createMockJob(0, 3); // 1st attempt out of 3

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

  it('handles final failure: marks email as failed when all attempts exhausted (Requirement 7 - Final Failure)', async () => {
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

    const mockJob = createMockJob(2, 3); // 3rd attempt (final attempt: 2 + 1 = 3)

    // On final attempt, error is caught and marked as failed without throwing
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
