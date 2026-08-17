import { randomUUID } from 'node:crypto';
import { CF_SYNC_QUEUE } from '@cc/core';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { afterAll, describe, expect, it } from 'vitest';
import type { RedisService } from '../redis/redis.service';
import { SyncQueueService } from './sync-queue.service';

const connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: 1,
});
const queue = new Queue(CF_SYNC_QUEUE, { connection });

describe('sync queue deduplication', () => {
  afterAll(async () => {
    await queue.close();
    await connection.quit();
  });

  it('prevents an equivalent job while it is pending', async () => {
    const service = new SyncQueueService({ connection } as RedisService);
    service.onModuleInit();
    const userId = randomUUID();
    const data = {
      userId,
      accountId: randomUUID(),
      handle: 'tourist',
      mode: 'INCREMENTAL' as const,
    };
    await expect(service.enqueue(data, 'HIGH')).resolves.toBe(true);
    await expect(service.enqueue(data, 'LOW')).resolves.toBe(false);
    await queue.remove(`sync-${userId}`);
    await service.onApplicationShutdown();
  });
});
