import { performance } from 'perf_hooks';
import { prisma } from '../lib/prisma.js';
import { createBatchWithEmails } from '../repositories/emailRepository.js';
import { scheduleEmails } from '../services/emailService.js';
import { RedisMemoryServer } from 'redis-memory-server';
import { redisClient } from '../lib/redis.js';
import { emailQueue } from '../queue/emailQueue.js';

interface RunStats {
  runs: number[];
  min: number;
  median: number;
  max: number;
}

function calculateStats(times: number[]): RunStats {
  const sorted = [...times].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { runs: sorted, min, median, max };
}

async function main() {
  console.log('================================================================================');
  console.log('       HYPERSEND INGESTION BENCHMARK: CHUNKED vs UNNEST (HONEST EMPIRICAL)      ');
  console.log('================================================================================\n');

  // Check Redis or start RedisMemoryServer if needed
  let redisServer: RedisMemoryServer | null = null;
  try {
    await redisClient.ping();
    console.log('[Redis] Connected to existing Redis instance at 127.0.0.1:6379.');
  } catch {
    console.log('[Redis] Starting local in-memory Redis instance on port 6379...');
    redisServer = new RedisMemoryServer({ instance: { port: 6379 } });
    await redisServer.start();
    console.log('[Redis] In-memory Redis running on port 6379.');
  }

  console.log('\n[PostgreSQL] Connecting to remote Neon PostgreSQL database...');
  await prisma.$connect();
  const user = await prisma.user.findFirst();
  const senders = await prisma.sender.findMany({ take: 5 });

  if (!user || senders.length === 0) {
    console.error('Missing user or senders in database. Run seed first.');
    process.exit(1);
  }

  // Measure Ping RTT to PostgreSQL (5 pings)
  const pingSamples: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    await prisma.$queryRaw`SELECT 1`;
    pingSamples.push(performance.now() - t0);
  }
  const pingStats = calculateStats(pingSamples);
  console.log(
    `[RTT] Measured Ping RTT to Neon PostgreSQL (5 samples): Min = ${pingStats.min.toFixed(1)}ms | Median = ${pingStats.median.toFixed(1)}ms | Max = ${pingStats.max.toFixed(1)}ms\n`
  );

  const NUM_RUNS = 5;

  // Helper for DB cleanup
  async function cleanupBatch(batchId: string) {
    try {
      await prisma.email.deleteMany({ where: { batchId } });
      await prisma.batch.delete({ where: { id: batchId } });
    } catch (err) {
      console.error(`Failed to cleanup batch ${batchId}:`, err);
    }
  }

  // SECTION 1: DB-Level Ingestion (createBatchWithEmails)
  console.log('================================================================================');
  console.log('  SECTION 1: DATABASE INGESTION LAYER (createBatchWithEmails - DB Transaction)  ');
  console.log('================================================================================\n');

  // 1A: 1,000 recipients
  console.log(`--> Measuring 1,000 Recipients (DB Transaction) across ${NUM_RUNS} runs each...`);
  const recips1k = Array.from({ length: 1000 }, (_, i) => `bench1k_${i}@test.com`);
  const db1kChunkedTimes: number[] = [];
  const db1kUnnestTimes: number[] = [];

  for (let r = 1; r <= NUM_RUNS; r++) {
    const startAt = new Date(Date.now() + 60000);
    // Chunked
    const t0 = performance.now();
    const resChunked = await createBatchWithEmails({
      userId: user.id,
      subject: `Bench 1k Chunked Run ${r}`,
      body: 'Body text',
      recipients: recips1k,
      startAt,
      delayMs: 2000,
      hourlyLimit: 500,
      senders,
      useChunkedStrategy: true,
    });
    const durChunked = performance.now() - t0;
    db1kChunkedTimes.push(durChunked);
    await cleanupBatch(resChunked.batch.id);

    // Unnest
    const t1 = performance.now();
    const resUnnest = await createBatchWithEmails({
      userId: user.id,
      subject: `Bench 1k Unnest Run ${r}`,
      body: 'Body text',
      recipients: recips1k,
      startAt,
      delayMs: 2000,
      hourlyLimit: 500,
      senders,
      useChunkedStrategy: false,
    });
    const durUnnest = performance.now() - t1;
    db1kUnnestTimes.push(durUnnest);
    await cleanupBatch(resUnnest.batch.id);

    console.log(`  Run ${r}/${NUM_RUNS}: Chunked = ${durChunked.toFixed(1)}ms | Unnest = ${durUnnest.toFixed(1)}ms`);
  }

  const db1kChunkedStats = calculateStats(db1kChunkedTimes);
  const db1kUnnestStats = calculateStats(db1kUnnestTimes);

  // 1B: 10,000 recipients
  console.log(`\n--> Measuring 10,000 Recipients (DB Transaction) across ${NUM_RUNS} runs each...`);
  const recips10k = Array.from({ length: 10000 }, (_, i) => `bench10k_${i}@test.com`);
  const db10kChunkedTimes: number[] = [];
  const db10kUnnestTimes: number[] = [];

  for (let r = 1; r <= NUM_RUNS; r++) {
    const startAt = new Date(Date.now() + 60000);
    // Chunked
    const t0 = performance.now();
    const resChunked = await createBatchWithEmails({
      userId: user.id,
      subject: `Bench 10k Chunked Run ${r}`,
      body: 'Body text',
      recipients: recips10k,
      startAt,
      delayMs: 2000,
      hourlyLimit: 500,
      senders,
      useChunkedStrategy: true,
    });
    const durChunked = performance.now() - t0;
    db10kChunkedTimes.push(durChunked);
    await cleanupBatch(resChunked.batch.id);

    // Unnest
    const t1 = performance.now();
    const resUnnest = await createBatchWithEmails({
      userId: user.id,
      subject: `Bench 10k Unnest Run ${r}`,
      body: 'Body text',
      recipients: recips10k,
      startAt,
      delayMs: 2000,
      hourlyLimit: 500,
      senders,
      useChunkedStrategy: false,
    });
    const durUnnest = performance.now() - t1;
    db10kUnnestTimes.push(durUnnest);
    await cleanupBatch(resUnnest.batch.id);

    console.log(`  Run ${r}/${NUM_RUNS}: Chunked = ${durChunked.toFixed(1)}ms | Unnest = ${durUnnest.toFixed(1)}ms`);
  }

  const db10kChunkedStats = calculateStats(db10kChunkedTimes);
  const db10kUnnestStats = calculateStats(db10kUnnestTimes);

  // SECTION 2: End-to-End API Measurement (scheduleEmails)
  console.log('\n================================================================================');
  console.log('  SECTION 2: END-TO-END API PIPELINE (scheduleEmails: DB + BullMQ + Enqueued)   ');
  console.log('================================================================================\n');

  // 2A: 1,000 recipients
  console.log(`--> Measuring 1,000 Recipients (End-to-End API) across ${NUM_RUNS} runs each...`);
  const api1kChunkedTimes: number[] = [];
  const api1kUnnestTimes: number[] = [];

  for (let r = 1; r <= NUM_RUNS; r++) {
    const startAt = new Date(Date.now() + 3600000); // 1 hr in future to avoid instant worker trigger
    // Chunked
    const t0 = performance.now();
    const resChunked = await scheduleEmails(user.id, {
      subject: `API 1k Chunked Run ${r}`,
      body: 'API Body',
      recipients: recips1k,
      startAt: startAt.toISOString(),
      delayMs: 2000,
      hourlyLimit: 500,
      useChunkedStrategy: true,
    });
    const durChunked = performance.now() - t0;
    api1kChunkedTimes.push(durChunked);
    await cleanupBatch(resChunked.batchId);
    await emailQueue.drain();

    // Unnest
    const t1 = performance.now();
    const resUnnest = await scheduleEmails(user.id, {
      subject: `API 1k Unnest Run ${r}`,
      body: 'API Body',
      recipients: recips1k,
      startAt: startAt.toISOString(),
      delayMs: 2000,
      hourlyLimit: 500,
      useChunkedStrategy: false,
    });
    const durUnnest = performance.now() - t1;
    api1kUnnestTimes.push(durUnnest);
    await cleanupBatch(resUnnest.batchId);
    await emailQueue.drain();

    console.log(`  Run ${r}/${NUM_RUNS}: Chunked = ${durChunked.toFixed(1)}ms | Unnest = ${durUnnest.toFixed(1)}ms`);
  }

  const api1kChunkedStats = calculateStats(api1kChunkedTimes);
  const api1kUnnestStats = calculateStats(api1kUnnestTimes);

  // 2B: 10,000 recipients
  console.log(`\n--> Measuring 10,000 Recipients (End-to-End API) across ${NUM_RUNS} runs each...`);
  const api10kChunkedTimes: number[] = [];
  const api10kUnnestTimes: number[] = [];

  for (let r = 1; r <= NUM_RUNS; r++) {
    const startAt = new Date(Date.now() + 3600000);
    // Chunked
    const t0 = performance.now();
    const resChunked = await scheduleEmails(user.id, {
      subject: `API 10k Chunked Run ${r}`,
      body: 'API Body',
      recipients: recips10k,
      startAt: startAt.toISOString(),
      delayMs: 2000,
      hourlyLimit: 500,
      useChunkedStrategy: true,
    });
    const durChunked = performance.now() - t0;
    api10kChunkedTimes.push(durChunked);
    await cleanupBatch(resChunked.batchId);
    await emailQueue.drain();

    // Unnest
    const t1 = performance.now();
    const resUnnest = await scheduleEmails(user.id, {
      subject: `API 10k Unnest Run ${r}`,
      body: 'API Body',
      recipients: recips10k,
      startAt: startAt.toISOString(),
      delayMs: 2000,
      hourlyLimit: 500,
      useChunkedStrategy: false,
    });
    const durUnnest = performance.now() - t1;
    api10kUnnestTimes.push(durUnnest);
    await cleanupBatch(resUnnest.batchId);
    await emailQueue.drain();

    console.log(`  Run ${r}/${NUM_RUNS}: Chunked = ${durChunked.toFixed(1)}ms | Unnest = ${durUnnest.toFixed(1)}ms`);
  }

  const api10kChunkedStats = calculateStats(api10kChunkedTimes);
  const api10kUnnestStats = calculateStats(api10kUnnestTimes);

  // FINAL SUMMARY REPORT
  console.log('\n================================================================================');
  console.log('                          FINAL EMPIRICAL RESULTS SUMMARY                       ');
  console.log('================================================================================\n');

  console.log(`Database Ping RTT: Min = ${pingStats.min.toFixed(1)}ms | Median = ${pingStats.median.toFixed(1)}ms | Max = ${pingStats.max.toFixed(1)}ms\n`);

  console.log('--- 1. Database Ingestion Layer (createBatchWithEmails) ---');
  console.log('1,000 Recipients (5 runs):');
  console.log(`  Chunked Baseline: Min = ${db1kChunkedStats.min.toFixed(1)}ms | Median = ${db1kChunkedStats.median.toFixed(1)}ms | Max = ${db1kChunkedStats.max.toFixed(1)}ms`);
  console.log(`  Unnest Query:     Min = ${db1kUnnestStats.min.toFixed(1)}ms | Median = ${db1kUnnestStats.median.toFixed(1)}ms | Max = ${db1kUnnestStats.max.toFixed(1)}ms`);
  console.log(`  DB Speedup (1k):  ${(db1kChunkedStats.median / db1kUnnestStats.median).toFixed(2)}x faster\n`);

  console.log('10,000 Recipients (5 runs):');
  console.log(`  Chunked Baseline: Min = ${db10kChunkedStats.min.toFixed(1)}ms | Median = ${db10kChunkedStats.median.toFixed(1)}ms | Max = ${db10kChunkedStats.max.toFixed(1)}ms`);
  console.log(`  Unnest Query:     Min = ${db10kUnnestStats.min.toFixed(1)}ms | Median = ${db10kUnnestStats.median.toFixed(1)}ms | Max = ${db10kUnnestStats.max.toFixed(1)}ms`);
  console.log(`  DB Speedup (10k): ${(db10kChunkedStats.median / db10kUnnestStats.median).toFixed(2)}x faster\n`);

  console.log('--- 2. End-to-End API Pipeline (Validation + DB + BullMQ + Enqueued) ---');
  console.log('1,000 Recipients (5 runs):');
  console.log(`  Chunked Baseline: Min = ${api1kChunkedStats.min.toFixed(1)}ms | Median = ${api1kChunkedStats.median.toFixed(1)}ms | Max = ${api1kChunkedStats.max.toFixed(1)}ms`);
  console.log(`  Unnest Pipeline:  Min = ${api1kUnnestStats.min.toFixed(1)}ms | Median = ${api1kUnnestStats.median.toFixed(1)}ms | Max = ${api1kUnnestStats.max.toFixed(1)}ms`);
  console.log(`  E2E Speedup (1k): ${(api1kChunkedStats.median / api1kUnnestStats.median).toFixed(2)}x faster\n`);

  console.log('10,000 Recipients (5 runs):');
  console.log(`  Chunked Baseline: Min = ${api10kChunkedStats.min.toFixed(1)}ms | Median = ${api10kChunkedStats.median.toFixed(1)}ms | Max = ${api10kChunkedStats.max.toFixed(1)}ms`);
  console.log(`  Unnest Pipeline:  Min = ${api10kUnnestStats.min.toFixed(1)}ms | Median = ${api10kUnnestStats.median.toFixed(1)}ms | Max = ${api10kUnnestStats.max.toFixed(1)}ms`);
  console.log(`  E2E Speedup (10k): ${(api10kChunkedStats.median / api10kUnnestStats.median).toFixed(2)}x faster\n`);

  // Cleanup
  await prisma.$disconnect();
  await redisClient.quit();
  await emailQueue.close();
  if (redisServer) {
    await redisServer.stop();
  }
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
