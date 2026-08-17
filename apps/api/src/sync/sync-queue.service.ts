import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { CF_SYNC_QUEUE, SYNC_PRIORITY, type SyncJobData } from '@cc/core';
import { Queue } from 'bullmq';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class SyncQueueService implements OnModuleInit, OnApplicationShutdown {
  private queue: Queue<SyncJobData> | undefined;

  constructor(private readonly redis: RedisService) {}

  onModuleInit(): void {
    this.queue = new Queue<SyncJobData>(CF_SYNC_QUEUE, { connection: this.redis.connection });
  }

  async enqueue(data: SyncJobData, priority: keyof typeof SYNC_PRIORITY): Promise<boolean> {
    if (!this.queue) throw new Error('Sync queue is not initialized');
    const jobId = `sync-${data.userId}`;
    const existing = await this.queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (['waiting', 'active', 'delayed', 'prioritized', 'waiting-children'].includes(state)) {
        return false;
      }
      await existing.remove();
    }
    await this.queue.add('sync-account', data, {
      jobId,
      priority: SYNC_PRIORITY[priority],
      attempts: 4,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: true,
      removeOnFail: { age: 86_400 },
    });
    return true;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue?.close();
  }
}
