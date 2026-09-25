import { prisma } from '../lib/prisma.js';

async function main() {
  const emails = await prisma.email.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: {
      sender: true,
      batch: true,
    },
  });

  console.log('--- RECENT EMAILS IN DB ---');
  for (const email of emails) {
    console.log({
      id: email.id,
      recipient: email.recipient,
      subject: email.subject,
      status: email.status,
      scheduledAt: email.scheduledAt,
      sentAt: email.sentAt,
      attempts: email.attempts,
      messageId: email.messageId,
      previewUrl: email.previewUrl,
      senderEmail: email.sender.email,
    });
  }
}

main().finally(() => prisma.$disconnect());
