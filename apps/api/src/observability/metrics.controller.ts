import {
  Controller,
  Get,
  Header,
  OnApplicationShutdown,
  OnModuleInit,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { CF_SYNC_QUEUE } from '@cc/core';
import { Queue } from 'bullmq';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { Public } from '../auth/auth.decorators';
import { EnvironmentService } from '../config/environment';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';

@Controller()
export class MetricsController implements OnModuleInit, OnApplicationShutdown {
  private queue: Queue | undefined;

  constructor(
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
    private readonly environment: EnvironmentService,
  ) {}

  onModuleInit(): void {
    this.queue = new Queue(CF_SYNC_QUEUE, { connection: this.redis.connection });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue?.close();
  }

  @Public()
  @Get('metrics')
  @Header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
  async metrics(@Req() request: Request) {
    this.authorize(request);
    const [counts, queuedJobs, syncStatuses, [{ mismatches } = { mismatches: 0 }]] =
      await Promise.all([
        this.queue?.getJobCounts('waiting', 'active', 'delayed', 'prioritized', 'failed') ?? {},
        this.queue?.getJobs(['waiting', 'delayed', 'prioritized'], 0, 99, true) ?? [],
        this.database.sql<{ sync_status: string; count: number }[]>`
        SELECT sync_status, count(*)::int AS count
        FROM codeforces_accounts GROUP BY sync_status ORDER BY sync_status
      `,
        this.database.sql<{ mismatches: number }[]>`
        WITH ledger AS (
          SELECT user_id, COALESCE(sum(amount) FILTER (WHERE affects_wallet), 0) AS balance
          FROM point_transactions GROUP BY user_id
        ), compared AS (
          SELECT COALESCE(wallets.user_id, ledger.user_id) AS user_id,
            COALESCE(wallets.balance, 0) AS wallet_balance,
            COALESCE(ledger.balance, 0) AS ledger_balance
          FROM user_wallets AS wallets FULL JOIN ledger ON ledger.user_id = wallets.user_id
        )
        SELECT count(*) FILTER (WHERE wallet_balance <> ledger_balance)::int AS mismatches
        FROM compared
      `,
      ]);
    const oldestQueuedAt = queuedJobs.reduce(
      (oldest, job) => Math.min(oldest, job.timestamp),
      Date.now(),
    );
    const oldestQueuedSeconds = queuedJobs.length
      ? Math.max(0, Math.round((Date.now() - oldestQueuedAt) / 1000))
      : 0;
    const lines = [
      '# HELP cc_wallet_reconciliation_mismatch Wallets whose balance differs from immutable ledger.',
      '# TYPE cc_wallet_reconciliation_mismatch gauge',
      `cc_wallet_reconciliation_mismatch ${mismatches}`,
      '# HELP cc_sync_queue_jobs BullMQ jobs by state.',
      '# TYPE cc_sync_queue_jobs gauge',
      ...Object.entries(counts as Record<string, number>).map(
        ([state, count]) => `cc_sync_queue_jobs{state="${state}"} ${count}`,
      ),
      '# HELP cc_sync_queue_oldest_waiting_seconds Age of the oldest sampled queued sync job.',
      '# TYPE cc_sync_queue_oldest_waiting_seconds gauge',
      `cc_sync_queue_oldest_waiting_seconds ${oldestQueuedSeconds}`,
      '# HELP cc_codeforces_accounts Codeforces accounts by sync state.',
      '# TYPE cc_codeforces_accounts gauge',
      ...syncStatuses.map(
        (row) => `cc_codeforces_accounts{status="${row.sync_status}"} ${row.count}`,
      ),
    ];
    return `${lines.join('\n')}\n`;
  }

  private authorize(request: Request) {
    const expected = this.environment.values.METRICS_TOKEN;
    const received = request.header('authorization')?.replace(/^Bearer\s+/i, '');
    if (!expected || !received) throw new UnauthorizedException();
    const expectedBytes = Buffer.from(expected);
    const receivedBytes = Buffer.from(received);
    if (
      expectedBytes.length !== receivedBytes.length ||
      !timingSafeEqual(expectedBytes, receivedBytes)
    ) {
      throw new UnauthorizedException();
    }
  }
}
