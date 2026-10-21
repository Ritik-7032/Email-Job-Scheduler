import { performance } from 'perf_hooks';
import { prisma } from '../lib/prisma.js';

async function main() {
  console.log('Connecting to Neon PostgreSQL from local dev machine...');
  await prisma.$connect();
  const user = await prisma.user.findFirst();
  const senders = await prisma.sender.findMany({ take: 5 });
  if (!user || senders.length === 0) {
    console.error('Missing user or senders');
    process.exit(1);
  }

  // 1. Measure ping RTT
  const t0 = performance.now();
  await prisma.$queryRaw`SELECT 1`;
  const pingMs = performance.now() - t0;
  console.log(`Measured Ping RTT (Local India dev machine -> Neon US-East): ${pingMs.toFixed(1)} ms\n`);

  const count = 10000;
  const recipients = Array.from({ length: count }, (_, i) => `unnest.user.${i}@test.com`);
  const now = new Date();

  // Test 1: Chunked Prisma Interactive Transaction (10 chunks of 1,000)
  console.log('=== TEST 1: Baseline 1,000-Row Chunked Interactive Transaction ===');
  const tChunkStart = performance.now();
  const chunkedBatch = await prisma.$transaction(async (tx) => {
    const b = await tx.batch.create({
      data: {
        userId: user.id,
        delayMs: 2000,
        hourlyLimit: 200,
        startAt: now,
      },
    });

    const emailData = recipients.map((recipient, index) => ({
      id: crypto.randomUUID(),
      userId: user.id,
      batchId: b.id,
      senderId: senders[index % senders.length].id,
      recipient,
      subject: 'Baseline Chunked Subject',
      body: 'Baseline Body Text',
      scheduledAt: new Date(now.getTime() + index * 2000),
      status: 'scheduled' as const,
      attempts: 0,
    }));

    for (let i = 0; i < emailData.length; i += 1000) {
      const chunk = emailData.slice(i, i + 1000);
      await tx.email.createMany({ data: chunk });
    }
    return b;
  }, { maxWait: 15000, timeout: 60000 });
  const chunkedDurMs = performance.now() - tChunkStart;
  console.log(`Baseline 10 chunks insert: ${chunkedDurMs.toFixed(1)} ms (${(chunkedDurMs / 1000).toFixed(3)}s)`);

  // Cleanup Test 1
  await prisma.email.deleteMany({ where: { batchId: chunkedBatch.id } });
  await prisma.batch.delete({ where: { id: chunkedBatch.id } });

  // Test 2: Single-Roundtrip Array Unnesting
  console.log('\n=== TEST 2: Single-Roundtrip PostgreSQL Array Unnesting (1 Query) ===');
  const tUnnestStart = performance.now();

  const unnestBatch = await prisma.batch.create({
    data: {
      userId: user.id,
      delayMs: 2000,
      hourlyLimit: 200,
      startAt: now,
    },
  });

  const ids: string[] = [];
  const userIds: string[] = [];
  const batchIds: string[] = [];
  const senderIds: string[] = [];
  const recips: string[] = [];
  const subjects: string[] = [];
  const bodies: string[] = [];
  const scheduledAts: Date[] = [];
  const statuses: string[] = [];
  const attempts: number[] = [];
  const createdAts: Date[] = [];
  const updatedAts: Date[] = [];

  for (let i = 0; i < count; i++) {
    ids.push(crypto.randomUUID());
    userIds.push(user.id);
    batchIds.push(unnestBatch.id);
    senderIds.push(senders[i % senders.length].id);
    recips.push(recipients[i]);
    subjects.push('Unnest Subject');
    bodies.push('Unnest Body Text');
    scheduledAts.push(new Date(now.getTime() + i * 2000));
    statuses.push('scheduled');
    attempts.push(0);
    createdAts.push(now);
    updatedAts.push(now);
  }

  const tQuery = performance.now();
  await prisma.$executeRaw`
    INSERT INTO "Email" (
      "id", "userId", "batchId", "senderId", "recipient",
      "subject", "body", "scheduledAt", "status", "attempts",
      "createdAt", "updatedAt"
    )
    SELECT
      u.id, u.user_id, u.batch_id, u.sender_id, u.recipient,
      u.subject, u.body, u.scheduled_at, u.status::"EmailStatus", u.attempts,
      u.created_at, u.updated_at
    FROM unnest(
      ${ids}::text[],
      ${userIds}::text[],
      ${batchIds}::text[],
      ${senderIds}::text[],
      ${recips}::text[],
      ${subjects}::text[],
      ${bodies}::text[],
      ${scheduledAts}::timestamp[],
      ${statuses}::text[],
      ${attempts}::int[],
      ${createdAts}::timestamp[],
      ${updatedAts}::timestamp[]
    ) AS u(
      id, user_id, batch_id, sender_id, recipient,
      subject, body, scheduled_at, status, attempts,
      created_at, updated_at
    )
  `;
  const queryMs = performance.now() - tQuery;
  const unnestTotalMs = performance.now() - tUnnestStart;

  console.log(`Single-Roundtrip unnest() query execution: ${queryMs.toFixed(1)} ms (${(queryMs / 1000).toFixed(3)}s)`);
  console.log(`Unnest total (batch creation + 10,000 array unnest): ${unnestTotalMs.toFixed(1)} ms (${(unnestTotalMs / 1000).toFixed(3)}s)`);

  // Cleanup Test 2
  await prisma.email.deleteMany({ where: { batchId: unnestBatch.id } });
  await prisma.batch.delete({ where: { id: unnestBatch.id } });

  console.log('\n=== RESULTS SUMMARY ===');
  console.log(`Baseline 10 chunks: ${(chunkedDurMs / 1000).toFixed(2)}s`);
  console.log(`Single Roundtrip unnest(): ${(unnestTotalMs / 1000).toFixed(2)}s`);
  console.log(`Speedup factor: ${(chunkedDurMs / unnestTotalMs).toFixed(1)}x faster!`);

  await prisma.$disconnect();
}

main().catch(console.error);
