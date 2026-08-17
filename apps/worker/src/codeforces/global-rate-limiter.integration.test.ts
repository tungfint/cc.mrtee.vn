import Redis from 'ioredis';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { EnvironmentService } from '../config/environment';
import type { RedisService } from '../redis/redis.service';
import { GlobalRateLimiter } from './global-rate-limiter';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const connection = new Redis(redisUrl, { maxRetriesPerRequest: 1 });
const environment = {
  values: { CF_REQUEST_INTERVAL_MS: 25 },
} as EnvironmentService;
const redisService = { connection } as RedisService;

describe('global Codeforces request limiter', () => {
  beforeEach(async () => connection.del('rate-limit:codeforces:next-slot'));
  afterAll(async () => connection.quit());

  it('serializes request slots across independent worker instances', async () => {
    const firstWorker = new GlobalRateLimiter(redisService, environment);
    const secondWorker = new GlobalRateLimiter(redisService, environment);
    const completedAt: number[] = [];
    const startedAt = Date.now();
    await Promise.all(
      [firstWorker, secondWorker, firstWorker, secondWorker].map(async (limiter) => {
        await limiter.acquire();
        completedAt.push(Date.now() - startedAt);
      }),
    );
    completedAt.sort((a, b) => a - b);
    expect(completedAt[3]! - completedAt[0]!).toBeGreaterThanOrEqual(60);
  });
});
