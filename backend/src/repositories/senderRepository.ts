import { prisma } from '../lib/prisma.js';
import { Sender } from '@prisma/client';
import nodemailer from 'nodemailer';
import { logger } from '../lib/logger.js';

export async function getAllSenders(): Promise<Sender[]> {
  let senders = await prisma.sender.findMany({
    orderBy: { createdAt: 'asc' },
  });

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
