import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { CF_SYNC_QUEUE, type SyncJobData } from '@cc/core';
import { Job, Worker } from 'bullmq';
import { CodeforcesClient } from '../codeforces/codeforces.client';
import { RedisService } from '../redis/redis.service';
import { SubmissionIngestionService } from '../ingestion/submission-ingestion.service';
import { DatabaseService } from '../database/database.service';
import { FirstSolveService } from '../first-solve/first-solve.service';
import { LevelService } from '../level/level.service';

@Injectable()
export class SyncWorkerService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(SyncWorkerService.name);
  private worker: Worker<SyncJobData> | undefined;

  constructor(
    private readonly redis: RedisService,
    private readonly codeforces: CodeforcesClient,
    private readonly ingestion: SubmissionIngestionService,
    private readonly firstSolves: FirstSolveService,
    private readonly level: LevelService,
    private readonly database: DatabaseService,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker<SyncJobData>(
      CF_SYNC_QUEUE,
      async (job: Job<SyncJobData>) => {
        const startedAt = Date.now();
        const [account] = await this.database.sql<{ reward_eligible_from: Date | string | null }[]>`
          UPDATE codeforces_accounts
          SET sync_status = 'SYNCING', last_sync_error = NULL, updated_at = now()
          WHERE id = ${job.data.accountId}
          RETURNING reward_eligible_from
        `;
        if (!account) throw new Error('Codeforces account no longer exists');
        const submissions = await this.codeforces.userStatus(job.data.handle, 1, 100);
        const ingested = await this.ingestion.ingestBatch(job.data.userId, submissions);
        await this.firstSolves.recordBatch(
          job.data.userId,
          ingested,
          account.reward_eligible_from ? new Date(account.reward_eligible_from) : null,
          job.data.mode === 'BACKFILL',
        );
        await this.level.recompute(job.data.userId);
        const maxSubmissionId = submissions.reduce(
          (maximum, submission) => Math.max(maximum, submission.id),
          0,
        );
        await this.database.sql`
          UPDATE codeforces_accounts
          SET
            sync_status = 'READY',
            last_sync_at = now(),
            next_sync_at = now() + interval '2 hours',
            last_seen_submission_id = GREATEST(
              COALESCE(last_seen_submission_id, 0),
              ${String(maxSubmissionId)}
            ),
            updated_at = now()
          WHERE id = ${job.data.accountId}
        `;
        this.logger.log(
          JSON.stringify({
            event: 'sync_ingestion_completed',
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
