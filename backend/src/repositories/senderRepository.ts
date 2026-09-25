import { prisma } from '../lib/prisma.js';
import { Sender } from '@prisma/client';
import nodemailer from 'nodemailer';
import { logger } from '../lib/logger.js';

export async function getAllSenders(): Promise<Sender[]> {
  let senders: Sender[] = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      senders = await prisma.sender.findMany({
        orderBy: { createdAt: 'asc' },
      });
      break;
    } catch (err) {
      if (attempt === 3) throw err;
      logger.warn({ attempt, err }, 'Retrying prisma.sender.findMany due to database pool wait');
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }

  if (senders.length === 0) {
    logger.info('No senders found in database. Auto-seeding initial Ethereal test senders...');
    try {
      const created: Sender[] = [];
      for (let i = 0; i < 3; i++) {
        const testAccount = await nodemailer.createTestAccount();
        const sender = await prisma.sender.create({
          data: {
            email: testAccount.user,
            smtpUser: testAccount.user,
            smtpPassword: testAccount.pass,
          },
        });
        created.push(sender);
      }
      senders = created;
    } catch (err) {
      logger.error({ err }, 'Failed to auto-seed Ethereal senders');
    }
  }

  return senders;
}
