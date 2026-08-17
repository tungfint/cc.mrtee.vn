import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { CF_SYNC_QUEUE, type SyncJobData } from '@cc/core';
import { Job, Worker } from 'bullmq';
import { CodeforcesClient } from '../codeforces/codeforces.client';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class SyncWorkerService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(SyncWorkerService.name);
  private worker: Worker<SyncJobData> | undefined;

  constructor(
    private readonly redis: RedisService,
    private readonly codeforces: CodeforcesClient,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker<SyncJobData>(
      CF_SYNC_QUEUE,
      async (job: Job<SyncJobData>) => {
        const startedAt = Date.now();
        const submissions = await this.codeforces.userStatus(job.data.handle, 1, 1);
        this.logger.log(
          JSON.stringify({
            event: 'sync_probe_completed',
            jobId: job.id,
            userId: job.data.userId,
            mode: job.data.mode,
            upstreamRows: submissions.length,
            durationMs: Date.now() - startedAt,
          }),
        );
        return { upstreamRows: submissions.length };
      },
      { connection: this.redis.connection, concurrency: 2 },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        JSON.stringify({ event: 'sync_job_failed', jobId: job?.id, message: error.message }),
      );
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
  }
}
