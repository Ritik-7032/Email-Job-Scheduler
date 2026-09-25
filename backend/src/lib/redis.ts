import { Redis, RedisOptions } from 'ioredis';
import { env } from '../config/env.js';

export function parseRedisOptions(urlStr: string): RedisOptions {
  try {
    const isTls = urlStr.startsWith('rediss://');
    const u = new URL(urlStr);
    return {
      host: u.hostname,
      port: parseInt(u.port || (isTls ? '6380' : '6379'), 10),
      username: u.username ? decodeURIComponent(u.username) : undefined,
      password: u.password ? decodeURIComponent(u.password) : undefined,
      tls: isTls ? { rejectUnauthorized: false, servername: u.hostname } : undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      connectTimeout: 15000,
      family: 4,
      retryStrategy(times) {
        return Math.min(times * 100, 3000);
      },
    };
  } catch {
    return {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      family: 4,
    };
  }
}

export const redis = new Redis(parseRedisOptions(env.REDIS_URL));

redis.on('error', (err) => {
  // Log redis connection errors gracefully without unhandled event crashing
  console.error('[Redis Client Error]', err.message);
});
