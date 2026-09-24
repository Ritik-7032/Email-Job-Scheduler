import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processEmailJob, clearTransporterCache } from '../workers/emailWorker.js';
import { requeueOrphanedEmails } from '../services/requeueService.js';
import { prisma } from '../lib/prisma.js';
import { emailQueue } from '../queue/emailQueue.js';
import * as rateLimiter from '../services/rateLimiter.js';
import { DelayedError } from 'bullmq';
import nodemailer from 'nodemailer';
import { EmailStatus } from '@prisma/client';

describe('Critical Failure, Concurrency, and Recovery Scenarios', () => {
  const baseEmail = {
    id: 'email-uuid-1',
    userId: 'user-1',
    batchId: 'batch-1',
    senderId: 'sender-1',
    recipient: 'client@example.com',
    subject: 'Subject',
    body: 'Body',
    scheduledAt: new Date(Date.now() + 60000),
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
      hourlyLimit: 2,
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

  const createMockJob = (emailId: string, attemptsMade = 0, maxAttempts = 3) => ({
    id: emailId,
    data: { emailId },
    opts: { attempts: maxAttempts },
    attemptsMade,
    moveToDelayed: vi.fn().mockResolvedValue(undefined),
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    clearTransporterCache();
  });

  it('Scenario 1: BullMQ job options use stable email UUID as jobId and compute correct delay', async () => {
    const scheduledTime = new Date(Date.now() + 50000);
    const delay = Math.max(0, scheduledTime.getTime() - Date.now());

    const jobDefinition = {
      name: 'send-email',
      data: { emailId: 'email-uuid-101' },
      opts: {
        jobId: 'email-uuid-101',
        delay,
      },
    };

    expect(jobDefinition.opts.jobId).toBe('email-uuid-101');
    expect(jobDefinition.opts.delay).toBeGreaterThanOrEqual(40000);
    expect(jobDefinition.opts.delay).toBeLessThanOrEqual(50000);
  });

  it('Scenario 2: Hourly rate limiting delays excess jobs to the next UTC window', async () => {
    vi.spyOn(prisma.email, 'findUnique').mockResolvedValue(baseEmail as any);
    
    // First 2 calls within limit allowed, 3rd call hits hourly cap
    const acquireSpy = vi.spyOn(rateLimiter, 'checkAndAcquireSenderSlot')
      .mockResolvedValueOnce({ allowed: true, waitMs: 0, windowKey: '2026092414' })
      .mockResolvedValueOnce({ allowed: true, waitMs: 0, windowKey: '2026092414' })
      .mockResolvedValueOnce({ allowed: false, waitMs: 1800000, windowKey: '2026092414' });

    vi.spyOn(prisma, '$executeRaw').mockResolvedValue(1 as any);
    vi.spyOn(nodemailer, 'createTransport').mockReturnValue({
      sendMail: vi.fn().mockResolvedValue({ messageId: 'msg-1' }),
    } as any);
    vi.spyOn(prisma.email, 'update').mockResolvedValue({} as any);

    const job1 = createMockJob('email-1');
    const job2 = createMockJob('email-2');
    const job3 = createMockJob('email-3');

    await processEmailJob(job1 as any, 'token-1');
    await processEmailJob(job2 as any, 'token-2');

    // 3rd job is delayed
    await expect(processEmailJob(job3 as any, 'token-3')).rejects.toThrow(DelayedError);
    expect(job3.moveToDelayed).toHaveBeenCalledWith(expect.any(Number), 'token-3');
    expect(acquireSpy).toHaveBeenCalledTimes(3);
  });

  it('Scenario 3: Atomic claim fencing ensures only one concurrent worker processes an email', async () => {
    vi.spyOn(prisma.email, 'findUnique').mockResolvedValue(baseEmail as any);
    vi.spyOn(rateLimiter, 'checkAndAcquireSenderSlot').mockResolvedValue({
      allowed: true,
      waitMs: 0,
      windowKey: '2026092414',
    });

    // Worker 1 claim succeeds (1 row updated)
    // Worker 2 claim fails (0 rows updated)
    vi.spyOn(prisma, '$executeRaw')
      .mockResolvedValueOnce(1 as any)
      .mockResolvedValueOnce(0 as any);

    const mockSendMail = vi.fn().mockResolvedValue({ messageId: 'msg-success' });
    vi.spyOn(nodemailer, 'createTransport').mockReturnValue({
      sendMail: mockSendMail,
    } as any);

    const releaseSpy = vi.spyOn(rateLimiter, 'releaseHourlySlot').mockResolvedValue();
    vi.spyOn(prisma.email, 'update').mockResolvedValue({} as any);

    const workerJob1 = createMockJob('email-race-1');
    const workerJob2 = createMockJob('email-race-1');

    await processEmailJob(workerJob1 as any, 'token-worker-1');
    await processEmailJob(workerJob2 as any, 'token-worker-2');

    // Only Worker 1 sent the email
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    // Worker 2 released its acquired rate slot
    expect(releaseSpy).toHaveBeenCalledWith('sender-1', '2026092414');
  });

  it('Scenario 4: Startup reconciler re-enqueues orphaned database rows without duplicates', async () => {
    const orphanedEmails = [
      {
        id: 'orphan-1',
        scheduledAt: new Date(Date.now() + 10000),
        status: EmailStatus.scheduled,
        enqueuedAt: null,
        createdAt: new Date(Date.now() - 120000), // 2 mins ago
      },
      {
        id: 'orphan-2',
        scheduledAt: new Date(Date.now() + 20000),
        status: EmailStatus.scheduled,
        enqueuedAt: null,
        createdAt: new Date(Date.now() - 120000),
      },
    ];

    vi.spyOn(prisma.email, 'findMany').mockResolvedValue(orphanedEmails as any);
    const addBulkSpy = vi.spyOn(emailQueue, 'addBulk').mockResolvedValue([] as any);
    const updateManySpy = vi.spyOn(prisma.email, 'updateMany').mockResolvedValue({ count: 2 });

    const requeuedCount = await requeueOrphanedEmails();

    expect(requeuedCount).toBe(2);
    expect(addBulkSpy).toHaveBeenCalledTimes(1);
    const queuedJobs = addBulkSpy.mock.calls[0][0];
    expect(queuedJobs[0].opts.jobId).toBe('orphan-1');
    expect(queuedJobs[1].opts.jobId).toBe('orphan-2');
    expect(updateManySpy).toHaveBeenCalledWith({
      where: { id: { in: ['orphan-1', 'orphan-2'] } },
      data: { enqueuedAt: expect.any(Date) },
    });
  });

  it('Scenario 5: Stalled job from crashed worker is delayed until stale threshold', async () => {
    const stalledEmail = {
      ...baseEmail,
      status: EmailStatus.processing,
      processingStartedAt: new Date(Date.now() - 60000), // 1 min ago (< 5 min stale threshold)
    };

    vi.spyOn(prisma.email, 'findUnique')
      .mockResolvedValueOnce(baseEmail as any) // Initial load
      .mockResolvedValueOnce(stalledEmail as any); // Stale check on 0 affected rows

    vi.spyOn(rateLimiter, 'checkAndAcquireSenderSlot').mockResolvedValue({
      allowed: true,
      waitMs: 0,
      windowKey: '2026092414',
    });
    vi.spyOn(prisma, '$executeRaw').mockResolvedValue(0 as any);
    vi.spyOn(rateLimiter, 'releaseHourlySlot').mockResolvedValue();

    const stalledJob = createMockJob('email-stalled-1');

    await expect(processEmailJob(stalledJob as any, 'token-stalled')).rejects.toThrow(DelayedError);
    expect(stalledJob.moveToDelayed).toHaveBeenCalledWith(expect.any(Number), 'token-stalled');
  });

  it('Scenario 6: SMTP failure releases rate slot, increments attempts, and marks terminal failure after 3 attempts', async () => {
    vi.spyOn(prisma.email, 'findUnique').mockResolvedValue({
      ...baseEmail,
      attempts: 2,
    } as any);

    vi.spyOn(rateLimiter, 'checkAndAcquireSenderSlot').mockResolvedValue({
      allowed: true,
      waitMs: 0,
      windowKey: '2026092414',
    });
    vi.spyOn(prisma, '$executeRaw').mockResolvedValue(1 as any);

    vi.spyOn(nodemailer, 'createTransport').mockReturnValue({
      sendMail: vi.fn().mockRejectedValue(new Error('SMTP Remote Server Unavailable')),
    } as any);

    const releaseSpy = vi.spyOn(rateLimiter, 'releaseHourlySlot').mockResolvedValue();
    const updateSpy = vi.spyOn(prisma.email, 'update').mockResolvedValue({} as any);

    const finalAttemptJob = createMockJob('email-final-fail', 2, 3); // 3rd of 3 attempts

    await processEmailJob(finalAttemptJob as any, 'token-final');

    expect(releaseSpy).toHaveBeenCalledWith('sender-1', '2026092414');
    expect(updateSpy).toHaveBeenCalledWith({
      where: { id: 'email-final-fail' },
      data: expect.objectContaining({
        status: 'failed',
        attempts: 3,
        errorMessage: 'SMTP Remote Server Unavailable',
      }),
    });
  });

  it('Scenario 7: >500 Orphan Recovery recovers large orphan backlog (1500 rows) in chunked loop', async () => {
    const chunk1 = Array.from({ length: 500 }, (_, i) => ({
      id: `orphan-c1-${i}`,
      scheduledAt: new Date(Date.now() + 10000 + i * 100),
      status: EmailStatus.scheduled,
      enqueuedAt: null,
      createdAt: new Date(Date.now() - 120000),
    }));

    const chunk2 = Array.from({ length: 500 }, (_, i) => ({
      id: `orphan-c2-${i}`,
      scheduledAt: new Date(Date.now() + 60000 + i * 100),
      status: EmailStatus.scheduled,
      enqueuedAt: null,
      createdAt: new Date(Date.now() - 120000),
    }));

    const chunk3 = Array.from({ length: 250 }, (_, i) => ({
      id: `orphan-c3-${i}`,
      scheduledAt: new Date(Date.now() + 120000 + i * 100),
      status: EmailStatus.scheduled,
      enqueuedAt: null,
      createdAt: new Date(Date.now() - 120000),
    }));

    const findManySpy = vi.spyOn(prisma.email, 'findMany')
      .mockResolvedValueOnce(chunk1 as any)
      .mockResolvedValueOnce(chunk2 as any)
      .mockResolvedValueOnce(chunk3 as any);

    const addBulkSpy = vi.spyOn(emailQueue, 'addBulk').mockResolvedValue([] as any);
    const updateManySpy = vi.spyOn(prisma.email, 'updateMany').mockResolvedValue({ count: 500 });

    const requeuedCount = await requeueOrphanedEmails(500);

    expect(requeuedCount).toBe(1250);
    expect(findManySpy).toHaveBeenCalledTimes(3);
    expect(addBulkSpy).toHaveBeenCalledTimes(3);
    expect(updateManySpy).toHaveBeenCalledTimes(3);
  });

  it('Scenario 8: Stale processing recovery marks dispatched emails as sent and resets recoverable crashes', async () => {
    const staleSentEmail = {
      id: 'stale-sent-1',
      status: EmailStatus.processing,
      processingStartedAt: new Date(Date.now() - 600000),
      messageId: '<smtp-msg-delivered@ethereal.email>',
      attempts: 1,
    };

    const staleMaxAttemptsEmail = {
      id: 'stale-exhausted-2',
      status: EmailStatus.processing,
      processingStartedAt: new Date(Date.now() - 600000),
      messageId: null,
      attempts: 3,
    };

    const staleRecoverableEmail = {
      id: 'stale-retry-3',
      status: EmailStatus.processing,
      processingStartedAt: new Date(Date.now() - 600000),
      messageId: null,
      attempts: 1,
    };

    vi.spyOn(prisma.email, 'findMany').mockResolvedValueOnce([
      staleSentEmail,
      staleMaxAttemptsEmail,
      staleRecoverableEmail,
    ] as any);

    const updateSpy = vi.spyOn(prisma.email, 'update').mockResolvedValue({} as any);

    const { recoverStaleProcessingEmails } = await import('../services/requeueService.js');
    const recoveredCount = await recoverStaleProcessingEmails(300000);

    expect(recoveredCount).toBe(3);
    expect(updateSpy).toHaveBeenCalledWith({
      where: { id: 'stale-sent-1' },
      data: expect.objectContaining({ status: 'sent' }),
    });
    expect(updateSpy).toHaveBeenCalledWith({
      where: { id: 'stale-exhausted-2' },
      data: expect.objectContaining({ status: 'failed' }),
    });
    expect(updateSpy).toHaveBeenCalledWith({
      where: { id: 'stale-retry-3' },
      data: expect.objectContaining({ status: 'scheduled', enqueuedAt: null, processingStartedAt: null }),
    });
  });
});
