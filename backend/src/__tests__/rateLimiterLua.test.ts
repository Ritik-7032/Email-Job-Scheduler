import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkAndAcquireSenderSlot,
  getUtcHourWindow,
  releaseHourlySlot,
} from '../services/rateLimiter.js';
import { redis } from '../lib/redis.js';

describe('Rate Limiter Lua Script Logic (Requirement 4)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('computes correct UTC hour window and msToNextHour', () => {
    const fixedDate = new Date('2026-09-24T14:15:30.000Z');
    const { windowKey, msToNextHour } = getUtcHourWindow(fixedDate);

    expect(windowKey).toBe('2026092414');
    // From 14:15:30 to 15:00:00 is 44 minutes and 30 seconds = 2670000 ms
    expect(msToNextHour).toBe(2670000);
  });

  it('allows send when within gap and hourly limits', async () => {
    vi.spyOn(redis, 'eval').mockResolvedValue(0);

    const result = await checkAndAcquireSenderSlot('sender-1', 2000, 100);

    expect(result.allowed).toBe(true);
    expect(result.waitMs).toBe(0);
    expect(result.windowKey).toBeDefined();
  });

  it('rejects with waitMs when sender is in minimum gap interval', async () => {
    // Lua returns remaining gap TTL, e.g. 1500ms
    vi.spyOn(redis, 'eval').mockResolvedValue(1500);

    const result = await checkAndAcquireSenderSlot('sender-1', 2000, 100);

    expect(result.allowed).toBe(false);
    expect(result.waitMs).toBe(1500);
  });

  it('rejects with msToNextHour when hourly limit is reached', async () => {
    // Lua returns remaining ms in current UTC hour, e.g. 1800000 (30 mins)
    vi.spyOn(redis, 'eval').mockResolvedValue(1800000);

    const result = await checkAndAcquireSenderSlot('sender-1', 2000, 100);

    expect(result.allowed).toBe(false);
    expect(result.waitMs).toBe(1800000);
  });

  it('releases reserved hourly slot on delivery error', async () => {
    const decrSpy = vi.spyOn(redis, 'decr').mockResolvedValue(4);

    await releaseHourlySlot('sender-1', '2026092414');

    expect(decrSpy).toHaveBeenCalledWith('rate:sender-1:2026092414');
  });

  it('cleans up hourly key if counter drops to zero', async () => {
    vi.spyOn(redis, 'decr').mockResolvedValue(0);
    const delSpy = vi.spyOn(redis, 'del').mockResolvedValue(1);

    await releaseHourlySlot('sender-1', '2026092414');

    expect(delSpy).toHaveBeenCalledWith('rate:sender-1:2026092414');
  });
});
