import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { CF_SYNC_QUEUE, SYNC_PRIORITY, type SyncJobData } from '@cc/core';
import { Queue } from 'bullmq';
import { EnvironmentService } from '../config/environment';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';
import { cadenceMinutes, syncTier } from './sync-cadence';

interface DueAccount {
  id: string;
  user_id: string;
  handle: string;
  backfill_completed_at: Date | string | null;
  last_seen_at: Date | string | null;
}

interface QueueJobLike {
  getState(): Promise<string>;
  remove(): Promise<void>;
}

export interface SchedulerQueue {
  getJobCounts(...types: string[]): Promise<Record<string, number>>;
  getJob(id: string): Promise<QueueJobLike | undefined>;
  add(name: string, data: SyncJobData, options: Record<string, unknown>): Promise<unknown>;
}

@Injectable()
export class AdaptiveSchedulerService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(AdaptiveSchedulerService.name);
  private queue: Queue<SyncJobData> | undefined;
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
    private readonly environment: EnvironmentService,
  ) {}

  onModuleInit(): void {
    if (!this.environment.values.SCHEDULER_ENABLED) return;
    this.queue = new Queue<SyncJobData>(CF_SYNC_QUEUE, { connection: this.redis.connection });
    this.timer = setInterval(() => void this.tick(), this.environment.values.SCHEDULER_INTERVAL_MS);
    this.timer.unref();
    void this.tick();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.queue?.close();
  }

  async runOnce(queue: SchedulerQueue = this.requiredQueue()): Promise<{
    acquired: boolean;
    enqueued: number;
    backlog: number;
  }> {
    const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'prioritized');
    const backlog = Object.values(counts).reduce((sum, count) => sum + count, 0);
    const environment = this.environment.values;
    const hourlyCapacity = Math.floor(3_600_000 / environment.CF_REQUEST_INTERVAL_MS);
    const scheduledCapacity = Math.max(
      1,
      Math.floor(hourlyCapacity * (1 - environment.SYNC_CAPACITY_RESERVE_PERCENT)),
    );
    const room = Math.max(0, scheduledCapacity - backlog);
    if (room === 0) return { acquired: false, enqueued: 0, backlog };
    const limit = Math.min(environment.SCHEDULER_BATCH_SIZE, room);
    return this.database.sql.begin(async (transaction) => {
      const [{ acquired } = { acquired: false }] = await transaction<{ acquired: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(hashtextextended('cc:adaptive-scheduler', 0)) AS acquired
      `;
      if (!acquired) return { acquired: false, enqueued: 0, backlog };
      const accounts = await transaction<DueAccount[]>`
        SELECT accounts.id, accounts.user_id, accounts.handle, accounts.backfill_completed_at,
          presence.last_seen_at
        FROM codeforces_accounts AS accounts
        JOIN users ON users.id = accounts.user_id
        LEFT JOIN LATERAL (
          SELECT max(last_seen_at) AS last_seen_at FROM auth_sessions
          WHERE user_id = accounts.user_id AND revoked_at IS NULL AND expires_at > now()
        ) AS presence ON true
        WHERE users.status = 'ACTIVE'
          AND accounts.verification_status <> 'UNVERIFIED'
          AND accounts.sync_status NOT IN ('UNVERIFIED', 'INACTIVE', 'SYNCING')
          AND COALESCE(accounts.next_sync_at, now()) <= now()
        ORDER BY accounts.next_sync_at NULLS FIRST, accounts.id
        LIMIT ${limit}
        FOR UPDATE OF accounts SKIP LOCKED
      `;
      let enqueued = 0;
      for (const account of accounts) {
        const data: SyncJobData = {
          userId: account.user_id,
          accountId: account.id,
          handle: account.handle,
          mode: account.backfill_completed_at ? 'INCREMENTAL' : 'BACKFILL',
        };
        if (await this.enqueue(queue, data)) enqueued += 1;
        const tier = syncTier(account.last_seen_at);
        const minutes = cadenceMinutes(tier, {
          online: environment.SYNC_ONLINE_TARGET_MINUTES,
          recent: environment.SYNC_RECENT_TARGET_MINUTES,
          offline: environment.SYNC_OFFLINE_TARGET_MINUTES,
        });
        await transaction`
          UPDATE codeforces_accounts
          SET next_sync_at = now() + ((${minutes})::double precision * interval '1 minute'),
            updated_at = now()
          WHERE id = ${account.id}
        `;
      }
      return { acquired: true, enqueued, backlog };
    });
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const result = await this.runOnce();
      if (result.enqueued > 0) {
        this.logger.log(JSON.stringify({ event: 'scheduler_batch', ...result }));
      }
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'scheduler_failed',
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      this.running = false;
    }
  }

  private async enqueue(queue: SchedulerQueue, data: SyncJobData): Promise<boolean> {
    const jobId = `sync-${data.userId}`;
    const existing = await queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (['waiting', 'active', 'delayed', 'prioritized', 'waiting-children'].includes(state)) {
        return false;
      }
      await existing.remove();
    }
    await queue.add('sync-account', data, {
      jobId,
      priority: SYNC_PRIORITY.LOW,
      attempts: 4,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: true,
      removeOnFail: { age: 86_400 },
    });
    return true;
  }

  private requiredQueue(): SchedulerQueue {
    if (!this.queue) throw new Error('Scheduler queue is not initialized');
    return this.queue;
  }
}
