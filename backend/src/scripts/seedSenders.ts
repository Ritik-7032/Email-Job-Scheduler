import nodemailer from 'nodemailer';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

export async function seedSendersIfNeeded(): Promise<number> {
  const existing = await prisma.sender.count();
  if (existing >= env.SENDER_COUNT) {
    return existing;
  }

  const count = env.SENDER_COUNT - existing;
  logger.info({ existing, toCreate: count }, 'Auto-seeding Ethereal sender accounts for fresh deployment...');

  for (let i = 0; i < count; i++) {
    const testAccount = await nodemailer.createTestAccount();
    await prisma.sender.create({
      data: {
        email: testAccount.user,
        smtpUser: testAccount.user,
        smtpPassword: testAccount.pass,
      },
    });
  }

  const finalTotal = await prisma.sender.count();
  logger.info({ total: finalTotal }, 'Sender accounts verified and ready.');
  return finalTotal;
}

// Allow direct CLI execution via tsx
if (process.argv[1]?.endsWith('seedSenders.ts') || process.argv[1]?.endsWith('seedSenders.js')) {
  seedSendersIfNeeded()
    .catch((err) => {
      logger.error({ err }, 'Failed to seed senders');
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
