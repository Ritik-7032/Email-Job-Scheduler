import { redis } from '../lib/redis.js';

const RATE_LIMITER_LUA = `
local gapPttl = redis.call('PTTL', KEYS[1])
if gapPttl > 0 then
  return gapPttl
end

local currentCount = tonumber(redis.call('GET', KEYS[2]) or '0')
local hourlyLimit = tonumber(ARGV[2])

if currentCount >= hourlyLimit then
  local msToNextHour = tonumber(ARGV[4])
  if msToNextHour <= 0 then
    return 1000
  end
  return msToNextHour
end

local newCount = redis.call('INCR', KEYS[2])
if newCount == 1 then
  redis.call('EXPIRE', KEYS[2], 7200)
end

local delayMs = tonumber(ARGV[1])
if delayMs > 0 then
  redis.call('PSETEX', KEYS[1], delayMs, '1')
end

return 0
`;

export function getUtcHourWindow(date = new Date()): { windowKey: string; msToNextHour: number } {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  const windowKey = `${year}${month}${day}${hour}`;

  const nextHour = new Date(Date.UTC(year, date.getUTCMonth(), date.getUTCDate(), date.getUTCHours() + 1, 0, 0, 0));
  const msToNextHour = Math.max(1000, nextHour.getTime() - date.getTime());

  return { windowKey, msToNextHour };
}

export async function checkAndAcquireSenderSlot(
  senderId: string,
  delayMs: number,
  hourlyLimit: number
): Promise<{ allowed: boolean; waitMs: number; windowKey: string }> {
  const now = new Date();
  const { windowKey, msToNextHour } = getUtcHourWindow(now);

  const gapKey = `gap:${senderId}`;
  const rateKey = `rate:${senderId}:${windowKey}`;

  const waitMs = (await redis.eval(
    RATE_LIMITER_LUA,
    2,
    gapKey,
    rateKey,
    delayMs.toString(),
    hourlyLimit.toString(),
    now.getTime().toString(),
    msToNextHour.toString()
  )) as number;

  if (waitMs > 0) {
    return { allowed: false, waitMs, windowKey };
  }

  return { allowed: true, waitMs: 0, windowKey };
}

export async function releaseHourlySlot(senderId: string, windowKey: string): Promise<void> {
  const key = `rate:${senderId}:${windowKey}`;
  const count = await redis.decr(key);
  if (count <= 0) {
    await redis.del(key);
  }
}
