import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { afterAll, describe, expect, it } from 'vitest';
import type { RedisService } from '../redis/redis.service';
import { RateLimitService } from './rate-limit.service';

const connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: 1,
});

describe('distributed API rate limit', () => {
  afterAll(() => connection.quit());

  it('shares a fixed-window budget across service instances', async () => {
    const bucket = `test:${randomUUID()}`;
    const first = new RateLimitService({ connection } as RedisService);
    const second = new RateLimitService({ connection } as RedisService);
    await first.consume(bucket, 2, 60);
    await second.consume(bucket, 2, 60);
    await expect(first.consume(bucket, 2, 60)).rejects.toMatchObject({ status: 429 });
  });
});
