import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { CF_SYNC_QUEUE, type SyncJobData } from '@cc/core';
import { Job, Worker } from 'bullmq';
import { RedisService } from '../redis/redis.service';
import { DatabaseService } from '../database/database.service';
import { SyncProcessorService } from './sync-processor.service';

@Injectable()
export class SyncWorkerService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(SyncWorkerService.name);
  private worker: Worker<SyncJobData> | undefined;

  constructor(
    private readonly redis: RedisService,
    private readonly processor: SyncProcessorService,
    private readonly database: DatabaseService,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker<SyncJobData>(
      CF_SYNC_QUEUE,
      async (job: Job<SyncJobData>) => {
        const startedAt = Date.now();
        const result = await this.processor.process(job.data);
        this.logger.log(
          JSON.stringify({
            event: 'sync_ingestion_completed',
            jobId: job.id,
            userId: job.data.userId,
            mode: job.data.mode,
            upstreamRows: result.upstreamRows,
            newFirstSolves: result.newFirstSolves,
            durationMs: Date.now() - startedAt,
          }),
        );
        return result;
      },
      { connection: this.redis.connection, concurrency: 2 },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        JSON.stringify({ event: 'sync_job_failed', jobId: job?.id, message: error.message }),
      );
      if (job) void this.markFailed(job.data.accountId, error.message);
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
  }

  private async markFailed(accountId: string, message: string): Promise<void> {
    await this.database.sql`
      UPDATE codeforces_accounts
      SET sync_status = 'ERROR', last_sync_error = ${message.slice(0, 2000)}, updated_at = now()
      WHERE id = ${accountId}
    `;
  }
}
