import nodemailer from 'nodemailer';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

export async function seedSendersIfNeeded(): Promise<number> {
  const senders = await prisma.sender.findMany();

  // 1. Verify existing Ethereal sender accounts to ensure they haven't expired on Ethereal's server
  for (const sender of senders) {
    if (sender.email.endsWith('@ethereal.email')) {
      const transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        auth: {
          user: sender.smtpUser,
          pass: sender.smtpPassword,
        },
      });

      try {
        await transporter.verify();
      } catch {
        logger.warn(
          { senderId: sender.id, email: sender.email },
          'Ethereal sender account expired on server. Refreshing with fresh active credentials...'
        );
        try {
          const freshAccount = await nodemailer.createTestAccount();
          await prisma.sender.update({
            where: { id: sender.id },
            data: {
              email: freshAccount.user,
              smtpUser: freshAccount.user,
              smtpPassword: freshAccount.pass,
            },
          });
          logger.info(
            { senderId: sender.id, newEmail: freshAccount.user },
            'Successfully refreshed expired Ethereal sender account'
          );
        } catch (createErr) {
          logger.error({ err: createErr }, 'Failed to create replacement Ethereal account');
        }
      }
    }
  }

  // 2. Seed any missing senders up to SENDER_COUNT
  const existing = await prisma.sender.count();
  if (existing < env.SENDER_COUNT) {
    const count = env.SENDER_COUNT - existing;
    logger.info({ existing, toCreate: count }, 'Auto-seeding additional Ethereal sender accounts...');
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
