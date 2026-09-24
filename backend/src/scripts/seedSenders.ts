import nodemailer from 'nodemailer';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

async function seedSenders() {
  logger.info({ count: env.SENDER_COUNT }, 'Starting sender account generation via Ethereal SMTP...');

  const count = env.SENDER_COUNT;
  const createdSenders = [];

  for (let i = 0; i < count; i++) {
    const testAccount = await nodemailer.createTestAccount();
    
    const sender = await prisma.sender.create({
      data: {
        email: testAccount.user,
        smtpUser: testAccount.user,
        smtpPassword: testAccount.pass,
      },
    });

    createdSenders.push(sender);
    logger.info({ senderId: sender.id, email: sender.email }, `Created sender ${i + 1}/${count}`);
  }

  logger.info({ total: createdSenders.length }, 'Successfully seeded Ethereal sender accounts.');
}

seedSenders()
  .catch((err) => {
    logger.error({ err }, 'Failed to seed senders');
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
