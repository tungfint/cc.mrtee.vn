import { Injectable } from '@nestjs/common';
import type { SyncJobData } from '@cc/core';
import { CodeforcesClient } from '../codeforces/codeforces.client';
import { EnvironmentService } from '../config/environment';
import { DatabaseService } from '../database/database.service';
import { FirstSolveService } from '../first-solve/first-solve.service';
import { SubmissionIngestionService } from '../ingestion/submission-ingestion.service';
import { LevelService } from '../level/level.service';
import { RewardEngineService } from '../reward/reward-engine.service';
import { ReconciliationService } from '../reconciliation/reconciliation.service';

interface AccountState {
  reward_eligible_from: Date | string | null;
  backfill_next_from: number | null;
}

@Injectable()
export class SyncProcessorService {
  constructor(
    private readonly codeforces: CodeforcesClient,
    private readonly ingestion: SubmissionIngestionService,
    private readonly firstSolves: FirstSolveService,
    private readonly level: LevelService,
    private readonly rewards: RewardEngineService,
    private readonly reconciliation: ReconciliationService,
    private readonly database: DatabaseService,
    private readonly environment: EnvironmentService,
  ) {}

  async process(data: SyncJobData): Promise<{ upstreamRows: number; newFirstSolves: number }> {
    const [account] = await this.database.sql<AccountState[]>`
      UPDATE codeforces_accounts
      SET sync_status = 'SYNCING', last_sync_error = NULL, updated_at = now()
      WHERE id = ${data.accountId} AND user_id = ${data.userId}
      RETURNING reward_eligible_from, backfill_next_from
    `;
    if (!account) throw new Error('Codeforces account no longer exists');
    const codeforcesUser = await this.codeforces.userInfo(data.handle);
    await this.database.sql`
      UPDATE codeforces_accounts SET
        current_rating = ${codeforcesUser.rating ?? null},
        max_rating = ${codeforcesUser.maxRating ?? null},
        rank = ${codeforcesUser.rank ?? null},
        max_rank = ${codeforcesUser.maxRank ?? null},
        updated_at = now()
      WHERE id = ${data.accountId}
    `;
    return data.mode === 'BACKFILL'
      ? this.backfill(data, account)
      : this.incremental(data, account);
  }

  private async incremental(
    data: SyncJobData,
    account: AccountState,
  ): Promise<{ upstreamRows: number; newFirstSolves: number }> {
    const submissions = await this.codeforces.userStatus(data.handle, 1, 100);
    const ingested = await this.ingestion.ingestBatch(data.userId, submissions);
    const eligibleFrom = account.reward_eligible_from
      ? new Date(account.reward_eligible_from)
      : null;
    await this.reconciliation.reconcileUser(data.userId, eligibleFrom);
    const results = [];
    for (const submission of ingested) {
      results.push(await this.rewards.process(data.userId, submission, eligibleFrom));
    }
    await this.finish(
      data.accountId,
      submissions.map((submission) => submission.id),
    );
    return {
      upstreamRows: submissions.length,
      newFirstSolves: results.filter((result) => result.firstSolveCreated).length,
    };
  }

  private async backfill(
    data: SyncJobData,
    account: AccountState,
  ): Promise<{ upstreamRows: number; newFirstSolves: number }> {
    const pageSize = this.environment.values.BACKFILL_PAGE_SIZE;
    let from = account.backfill_next_from ?? 1;
    let upstreamRows = 0;
    let newFirstSolves = 0;
    const seenIds: number[] = [];

    while (true) {
      const page = await this.codeforces.userStatus(data.handle, from, pageSize);
      if (page.length === 0) break;
      const ingested = await this.ingestion.ingestBatch(data.userId, page);
      const recorded = await this.firstSolves.recordBatch(data.userId, ingested, null, true);
      await this.level.recompute(data.userId);
      upstreamRows += page.length;
      newFirstSolves += recorded.filter((solve) => solve.created).length;
      seenIds.push(...page.map((submission) => submission.id));
      from += page.length;
      const pageMaximum = Math.max(...page.map((submission) => submission.id));
      await this.database.sql`
        UPDATE codeforces_accounts
        SET
          backfill_next_from = ${from},
          last_seen_submission_id = GREATEST(
            COALESCE(last_seen_submission_id, 0), ${String(pageMaximum)}
          ),
          updated_at = now()
        WHERE id = ${data.accountId}
      `;
      if (page.length < pageSize) break;
    }

    await this.database.sql`
      UPDATE codeforces_accounts
      SET backfill_completed_at = now(), backfill_next_from = NULL
      WHERE id = ${data.accountId}
    `;
    await this.finish(data.accountId, seenIds);
    return { upstreamRows, newFirstSolves };
  }

  private async finish(accountId: string, submissionIds: number[]): Promise<void> {
    const maximum = submissionIds.length > 0 ? Math.max(...submissionIds) : 0;
    const onlineMinutes = this.environment.values.SYNC_ONLINE_TARGET_MINUTES ?? 15;
    const recentMinutes = this.environment.values.SYNC_RECENT_TARGET_MINUTES ?? 30;
    const offlineMinutes = this.environment.values.SYNC_OFFLINE_TARGET_MINUTES ?? 1440;
    await this.database.sql`
      UPDATE codeforces_accounts
      SET
        sync_status = 'READY',
        last_sync_at = now(),
        next_sync_at = now() + (
          CASE
            WHEN (
              SELECT max(last_seen_at) FROM auth_sessions
              WHERE user_id = codeforces_accounts.user_id
                AND revoked_at IS NULL AND expires_at > now()
            ) >= now() - interval '10 minutes' THEN (${onlineMinutes})::double precision
            WHEN (
              SELECT max(last_seen_at) FROM auth_sessions
              WHERE user_id = codeforces_accounts.user_id
                AND revoked_at IS NULL AND expires_at > now()
            ) >= now() - interval '30 minutes' THEN (${recentMinutes})::double precision
            ELSE (${offlineMinutes})::double precision
          END * interval '1 minute'
        ),
        last_seen_submission_id = GREATEST(COALESCE(last_seen_submission_id, 0), ${String(maximum)}),
        updated_at = now()
      WHERE id = ${accountId}
    `;
  }
}
