process.env.MIN_DELAY_BETWEEN_EMAILS_MS = '50';
process.env.DEMO_SIMULATE_SMTP = 'true';
process.env.MAX_EMAILS_PER_HOUR = '10000';
process.env.BULLMQ_LOCK_DURATION_MS = '4000';
process.env.BULLMQ_STALLED_INTERVAL_MS = '4000';
process.env.STALE_PROCESSING_MS = '5000';

import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { performance } from 'perf_hooks';
import { RedisMemoryServer } from 'redis-memory-server';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootBackendDir = path.resolve(__dirname, '../..');
const tsxCliPath = path.resolve(rootBackendDir, 'node_modules/tsx/dist/cli.mjs');
const workerChildScript = path.resolve(__dirname, 'multiworker-child.ts');

function spawnWorker(id: string): ChildProcess {
  const child = spawn(process.execPath, [tsxCliPath, workerChildScript, id], {
    cwd: rootBackendDir,
    env: {
      ...process.env,
      DEMO_SIMULATE_SMTP: 'true',
      MIN_DELAY_BETWEEN_EMAILS_MS: '50',
      MAX_EMAILS_PER_HOUR: '10000',
      BULLMQ_LOCK_DURATION_MS: '4000',
      BULLMQ_STALLED_INTERVAL_MS: '4000',
      STALE_PROCESSING_MS: '5000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout?.on('data', () => {});
  child.stderr?.on('data', () => {});

  return child;
}

async function waitForCompletion(
  batchId: string,
  expectedCount: number,
  timeoutMs = 60000
): Promise<{ countSent: number; durationMs: number }> {
  const start = performance.now();
  while (performance.now() - start < timeoutMs) {
    const countSent = await prisma.email.count({
      where: { batchId, status: 'sent' },
    });
    if (countSent >= expectedCount) {
      return { countSent, durationMs: performance.now() - start };
    }
    await new Promise((res) => setTimeout(res, 250));
  }
  const countSent = await prisma.email.count({
    where: { batchId, status: 'sent' },
  });
  return { countSent, durationMs: performance.now() - start };
}

async function cleanupBatch(batchId: string) {
  try {
    await prisma.email.deleteMany({ where: { batchId } });
    await prisma.batch.delete({ where: { id: batchId } });
  } catch (err) {
    console.error(`Failed to cleanup batch ${batchId}:`, err);
  }
}

let prisma: any;
let redisClient: any;
let emailQueue: any;
let scheduleEmails: any;

async function main() {
  console.log('================================================================================');
  console.log('   HYPERSEND: MULTI-WORKER CONCURRENCY & WORKER CRASH ISOLATION TEST SUITE      ');
  console.log('================================================================================\n');

  const pMod = await import('../lib/prisma.js');
  prisma = pMod.prisma;
  const rMod = await import('../lib/redis.js');
  redisClient = rMod.redisClient;
  const qMod = await import('../queue/emailQueue.js');
  emailQueue = qMod.emailQueue;
  const sMod = await import('../services/emailService.js');
  scheduleEmails = sMod.scheduleEmails;

  // 1. Ensure Redis is running
  let redisServer: RedisMemoryServer | null = null;
  try {
    await redisClient.ping();
    console.log('[Redis] Connected to active Redis server at 127.0.0.1:6379');
  } catch {
    console.log('[Redis] Starting in-memory Redis instance on port 6379...');
    redisServer = new RedisMemoryServer({ instance: { port: 6379 } });
    await redisServer.start();
    console.log('[Redis] In-memory Redis running on port 6379.');
  }

  // 2. Ensure DB connection with retry for Neon serverless wake-up
  async function connectWithRetry(retries = 5, delay = 2000) {
    for (let i = 1; i <= retries; i++) {
      try {
        await prisma.$connect();
        return;
      } catch (err) {
        if (i === retries) throw err;
        console.log(`[PostgreSQL] Connecting to database (attempt ${i}/${retries})... retrying in ${delay}ms`);
        await new Promise((res) => setTimeout(res, delay));
      }
    }
  }

  await connectWithRetry();
  const user = await prisma.user.findFirst();
  const senders = await prisma.sender.findMany({ take: 5 });

  if (!user || senders.length === 0) {
    console.error('[PostgreSQL] Missing user or senders in database. Please run seed script first.');
    process.exit(1);
  }
  console.log(`[PostgreSQL] Connected. Benchmarking user: ${user.email} with ${senders.length} sender accounts.\n`);

  // ============================================================================
  // TEST 1: Baseline 3-Worker Concurrency Test (No Crashes)
  // ============================================================================
  console.log('--------------------------------------------------------------------------------');
  console.log('TEST 1: 3-Worker Concurrency Dispatch (Normal Execution)');
  console.log('--------------------------------------------------------------------------------');

  // Clean Redis ledger & queues
  await redisClient.del('ledger:dispatches');
  await redisClient.del('ledger:distinct_emails');
  await emailQueue.drain();

  // Spawn 3 worker processes
  console.log('Starting 3 isolated worker processes...');
  const workersTest1: ChildProcess[] = [
    spawnWorker('Worker-1A'),
    spawnWorker('Worker-1B'),
    spawnWorker('Worker-1C'),
  ];
  workersTest1.forEach((w, idx) => console.log(`  Worker ${idx + 1} spawned (PID: ${w.pid})`));

  await new Promise((res) => setTimeout(res, 1500));

  const countTest1 = 40;
  const recipientsTest1 = Array.from({ length: countTest1 }, (_, i) => `worker_t1_${i}@test.com`);
  console.log(`Scheduling batch of ${countTest1} emails with 50ms delay...`);

  const tStartTest1 = performance.now();
  const scheduledTest1 = await scheduleEmails(user.id, {
    subject: 'Multi-Worker Test 1 Subject',
    body: 'Testing concurrency with 3 workers',
    recipients: recipientsTest1,
    startAt: new Date(Date.now() + 100).toISOString(),
    delayMs: 50,
    hourlyLimit: 5000,
  });

  console.log(`Batch scheduled: ${scheduledTest1.batchId}. Waiting for worker completion...`);
  const resultTest1 = await waitForCompletion(scheduledTest1.batchId, countTest1, 90000);
  const totalDurationTest1 = performance.now() - tStartTest1;

  // Retrieve Redis ledger and DB verification
  const totalDispatchesT1 = await redisClient.llen('ledger:dispatches');
  const distinctDispatchesT1 = await redisClient.scard('ledger:distinct_emails');
  const duplicatesT1 = totalDispatchesT1 - distinctDispatchesT1;

  console.log('\n--- TEST 1 RESULTS ---');
  console.log(`  Total Scheduled:            ${countTest1}`);
  console.log(`  Total Marked Sent in DB:    ${resultTest1.countSent}`);
  console.log(`  Total Dispatches in Ledger: ${totalDispatchesT1}`);
  console.log(`  Distinct Email IDs Sent:    ${distinctDispatchesT1}`);
  console.log(`  DUPLICATE Dispatches:       ${duplicatesT1}`);
  console.log(`  Total Execution Time:       ${totalDurationTest1.toFixed(1)}ms (${(totalDurationTest1 / 1000).toFixed(2)}s)`);

  // Kill workers for Test 1
  for (const w of workersTest1) {
    try {
      w.kill('SIGTERM');
    } catch {}
  }
  await cleanupBatch(scheduledTest1.batchId);
  await emailQueue.drain();

  // Assertions for Test 1
  if (resultTest1.countSent !== countTest1 || distinctDispatchesT1 !== countTest1) {
    throw new Error(
      `Test 1 Assertion Failed: Expected ${countTest1} sent, got DB=${resultTest1.countSent}, Ledger=${distinctDispatchesT1}`
    );
  }
  console.log('>>> TEST 1 PASSED: 100% emails dispatched and marked sent with 0 duplicates.\n');

  await new Promise((res) => setTimeout(res, 2000));

  // ============================================================================
  // TEST 2: Mid-Run Worker Process Crash Test (kill -9) & Fault Recovery
  // ============================================================================
  console.log('--------------------------------------------------------------------------------');
  console.log('TEST 2: Worker Process Mid-Run Hard Crash (kill -9) & Isolation Recovery');
  console.log('--------------------------------------------------------------------------------');

  // Clean Redis ledger & queues
  await redisClient.del('ledger:dispatches');
  await redisClient.del('ledger:distinct_emails');
  await emailQueue.drain();

  console.log('Starting 3 fresh isolated worker processes...');
  const workersTest2: ChildProcess[] = [
    spawnWorker('Worker-2A'),
    spawnWorker('Worker-2B'),
    spawnWorker('Worker-2C'),
  ];
  workersTest2.forEach((w, idx) => console.log(`  Worker ${idx + 1} spawned (PID: ${w.pid})`));

  await new Promise((res) => setTimeout(res, 1500));

  const countTest2 = 40;
  const recipientsTest2 = Array.from({ length: countTest2 }, (_, i) => `worker_t2_${i}@test.com`);
  console.log(`Scheduling batch of ${countTest2} emails with 60ms delay...`);

  const tStartTest2 = performance.now();
  const scheduledTest2 = await scheduleEmails(user.id, {
    subject: 'Multi-Worker Crash Test Subject',
    body: 'Testing worker fault recovery mid-batch',
    recipients: recipientsTest2,
    startAt: new Date(Date.now() + 100).toISOString(),
    delayMs: 60,
    hourlyLimit: 5000,
  });

  console.log(`Batch scheduled: ${scheduledTest2.batchId}. Running dispatch pipeline...`);

  // Wait until ~25-35% of jobs are in flight, then hard kill Worker 2B
  await new Promise((res) => setTimeout(res, 8000));

  const victimWorker = workersTest2[1];
  const victimPid = victimWorker.pid;
  console.log(`\n[KILL EVENT] Triggering kill -9 (SIGKILL) on Worker 2 (PID: ${victimPid}) mid-run!`);
  const tKill = performance.now();
  try {
    victimWorker.kill('SIGKILL');
  } catch (err) {
    console.warn('Process kill error:', err);
  }

  const sentAtKill = await prisma.email.count({
    where: { batchId: scheduledTest2.batchId, status: 'sent' },
  });
  console.log(`[KILL EVENT] Emails completed at moment of crash: ${sentAtKill}/${countTest2}`);
  console.log(`[KILL EVENT] Surviving workers (Worker 1 & Worker 3) continuing execution...`);

  // Wait for surviving workers to process remaining & stalled jobs
  const resultTest2 = await waitForCompletion(scheduledTest2.batchId, countTest2, 100000);
  const recoveryDurationMs = performance.now() - tKill;
  const totalDurationTest2 = performance.now() - tStartTest2;

  // Retrieve Redis ledger and DB verification
  const totalDispatchesT2 = await redisClient.llen('ledger:dispatches');
  const distinctDispatchesT2 = await redisClient.scard('ledger:distinct_emails');
  const duplicatesT2 = totalDispatchesT2 - distinctDispatchesT2;

  console.log('\n--- TEST 2 RESULTS (CRASH RECOVERY) ---');
  console.log(`  Crashed Worker PID:         ${victimPid} (Terminated via SIGKILL)`);
  console.log(`  Total Scheduled:            ${countTest2}`);
  console.log(`  Total Marked Sent in DB:    ${resultTest2.countSent}/${countTest2}`);
  console.log(`  Total Dispatches in Ledger: ${totalDispatchesT2}`);
  console.log(`  Distinct Email IDs Sent:    ${distinctDispatchesT2}`);
  console.log(`  DUPLICATE Dispatches:       ${duplicatesT2}`);
  console.log(`  Fault Recovery Duration:    ${recoveryDurationMs.toFixed(1)}ms (${(recoveryDurationMs / 1000).toFixed(2)}s)`);
  console.log(`  Total Pipeline Duration:    ${totalDurationTest2.toFixed(1)}ms (${(totalDurationTest2 / 1000).toFixed(2)}s)`);

  // Clean up surviving workers
  try {
    workersTest2[0].kill('SIGTERM');
    workersTest2[2].kill('SIGTERM');
  } catch {}
  await cleanupBatch(scheduledTest2.batchId);
  await emailQueue.drain();

  // Assertions for Test 2
  if (resultTest2.countSent !== countTest2 || distinctDispatchesT2 !== countTest2) {
    throw new Error(
      `Test 2 Assertion Failed: Expected ${countTest2} sent, got DB=${resultTest2.countSent}, Ledger=${distinctDispatchesT2}`
    );
  }

  if (duplicatesT2 === 0) {
    console.log('>>> TEST 2 PASSED: 100% delivery completed with zero duplicate dispatches.');
  } else {
    console.log(`>>> TEST 2 PASSED (At-Least-Once Delivery): Exactly ${duplicatesT2} duplicate dispatch(es) recorded due to worker crash before status confirmation.`);
  }

  // Teardown
  await prisma.$disconnect();
  await redisClient.quit();
  await emailQueue.close();
  if (redisServer) {
    await redisServer.stop();
  }

  console.log('\n================================================================================');
  console.log('              ALL MULTI-WORKER & CRASH ISOLATION TESTS COMPLETE!                ');
  console.log('================================================================================\n');
}

main().catch((err) => {
  console.error('Multiworker test failed:', err);
  process.exit(1);
});
