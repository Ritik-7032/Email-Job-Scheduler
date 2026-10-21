import { createEmailWorker } from '../workers/emailWorker.js';
import { prisma } from '../lib/prisma.js';

const workerId = process.argv[2] || `worker-${process.pid}`;

const worker = createEmailWorker({
  concurrency: 3,
  lockDuration: 4000,
  stalledInterval: 4000,
});

const shutdown = async () => {
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log(`[Worker ${workerId}] Started with PID ${process.pid}`);
