import { Queue } from 'bullmq';
import { env } from '../config/env.js';
import { ScheduleJobData } from '../types/index.js';

export const EMAIL_QUEUE_NAME = 'email-queue';

export const emailQueue = new Queue<ScheduleJobData>(EMAIL_QUEUE_NAME, {
  connection: {
    url: env.REDIS_URL,
    connectTimeout: 5000,
    maxRetriesPerRequest: null,
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: {
      count: 1000,
      age: 86400,
    },
    removeOnFail: {
      count: 1000,
      age: 86400,
    },
  },
});
