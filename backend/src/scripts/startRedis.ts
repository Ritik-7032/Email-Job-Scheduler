import { RedisMemoryServer } from 'redis-memory-server';

async function main() {
  const redisServer = new RedisMemoryServer({
    instance: {
      port: 6379,
    },
  });

  await redisServer.start();
  const host = await redisServer.getHost();
  const port = await redisServer.getPort();
  console.log(`[Redis] Redis Memory Server running at ${host}:${port}`);
}

main().catch((err) => {
  console.error('[Redis] Failed to start redis memory server:', err);
  process.exit(1);
});

