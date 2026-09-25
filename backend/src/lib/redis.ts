import { Redis, RedisOptions } from 'ioredis';
import { env } from '../config/env.js';

export function parseRedisOptions(urlStr: string): RedisOptions {
  try {
    const isTls = urlStr.startsWith('rediss://');
    const u = new URL(urlStr);
    return {
      host: u.hostname,
      port: parseInt(u.port || '6379', 10),
      username: u.username || undefined,
      password: u.password || undefined,
      tls: isTls ? { rejectUnauthorized: false } : undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      connectTimeout: 10000,
    };
  } catch {
    return {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };
  }
}

export const redis = new Redis(env.REDIS_URL, parseRedisOptions(env.REDIS_URL));

redis.on('error', (err) => {
  // Log redis connection errors gracefully without unhandled event crashing
  console.error('[Redis Client Error]', err.message);
});
