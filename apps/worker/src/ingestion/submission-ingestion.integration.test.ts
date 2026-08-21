import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { migrateDatabase, type DatabaseClient, createDatabaseClient } from '@cc/database';
import { calculateReward, type CodeforcesSubmission } from '@cc/core';
import { config } from 'dotenv';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseService } from '../database/database.service';
import { SubmissionIngestionService } from './submission-ingestion.service';
import { FirstSolveService } from '../first-solve/first-solve.service';
import { LevelService } from '../level/level.service';
import { SyncProcessorService } from '../sync/sync-processor.service';
import type { CodeforcesClient } from '../codeforces/codeforces.client';
import type { EnvironmentService } from '../config/environment';
import { RewardEngineService } from '../reward/reward-engine.service';
import { AdaptiveSchedulerService, type SchedulerQueue } from '../sync/adaptive-scheduler.service';
import type { RedisService } from '../redis/redis.service';
import { ReconciliationService } from '../reconciliation/reconciliation.service';

config({ path: resolve(__dirname, '../../../../.env'), quiet: true });

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required');
let client: DatabaseClient;
let service: SubmissionIngestionService;
let firstSolves: FirstSolveService;
let level: LevelService;
let rewards: RewardEngineService;
let reconciliation: ReconciliationService;

const makeSubmission = (overrides: Partial<CodeforcesSubmission> = {}): CodeforcesSubmission => ({
  id: 123456,
  creationTimeSeconds: 1_700_000_000,
  verdict: 'OK',
  programmingLanguage: 'GNU C++17',
  author: { participantType: 'PRACTICE', members: [{ handle: 'student' }] },
  problem: {
    contestId: 1000,
    index: 'A',
    name: 'Original name',
    type: 'PROGRAMMING',
    rating: 1200,
    tags: ['math'],
  },
  ...overrides,
});

describe('submission ingestion', () => {
  beforeAll(async () => {
    await migrateDatabase(databaseUrl, resolve(__dirname, '../../../../packages/database/drizzle'));
    client = createDatabaseClient(databaseUrl, 4);
    service = new SubmissionIngestionService({ sql: client.connection } as DatabaseService);
    firstSolves = new FirstSolveService({ sql: client.connection } as DatabaseService);
    level = new LevelService({ sql: client.connection } as DatabaseService);
    rewards = new RewardEngineService({ sql: client.connection } as DatabaseService);
    reconciliation = new ReconciliationService({ sql: client.connection } as DatabaseService);
  });
  beforeEach(async () => {
    await client.connection`
      TRUNCATE cf_submissions, cf_problems, scoring_policies, users RESTART IDENTITY CASCADE
    `;
    await client.connection`
      INSERT INTO scoring_policies (
        version, level_decay, level_denominator, level_mastery_factor,
        level_mastery_scale, level_mastery_rating_step, default_cc_base,
        reward_min, reward_max, reward_midpoint_delta, reward_scale, effective_from
      ) VALUES
        ('v2.0', 0.95, 20, 0, 4, 400, 800, 0.05, 30, 50, 80, now()),
        ('v2.1', 0.95, 20, 8, 4, 400, 800, 0.05, 30, 50, 80, now()),
        ('v3.0', 0.95, 20, 0, 4, 400, 800, 0.25, 12.5, 50, 120, now())
    `;
  });
  afterAll(async () => client.close());

  it('upserts the same submission and preserves canonical problem identity across rename', async () => {
    const [user] = await client.connection<{ id: string }[]>`
      INSERT INTO users (id, full_name, display_name)
      VALUES (${randomUUID()}, 'Student', 'Student') RETURNING id
    `;
    if (!user) throw new Error('Missing fixture user');
    await service.ingest(user.id, makeSubmission());
    await service.ingest(
      user.id,
      makeSubmission({ problem: { ...makeSubmission().problem, name: 'Renamed problem' } }),
    );
    const [countRow] = await client.connection<{ count: number }[]>`
      SELECT count(*)::int AS count FROM cf_submissions
    `;
    if (!countRow) throw new Error('Missing submission count');
    const [problem] = await client.connection<{ problem_key: string; name: string }[]>`
      SELECT problem_key, name FROM cf_problems
    `;
    expect(countRow.count).toBe(1);
    expect(problem).toEqual({ problem_key: 'contest:1000:A', name: 'Renamed problem' });
  });

  it('records team and unrated metadata without inventing a rating', async () => {
    const [user] = await client.connection<{ id: string }[]>`
      INSERT INTO users (full_name, display_name) VALUES ('Student', 'Student') RETURNING id
    `;
    if (!user) throw new Error('Missing fixture user');
    await service.ingest(
      user.id,
      makeSubmission({
        author: { members: [{ handle: 'one' }, { handle: 'two' }] },
        problem: {
          contestId: 1000,
          index: 'A',
          name: 'Unrated problem',
          type: 'PROGRAMMING',
          tags: ['math'],
        },
      }),
    );
    const [stored] = await client.connection<
      { is_team: boolean; problem_rating_observed: number | null }[]
    >`
      SELECT is_team, problem_rating_observed FROM cf_submissions
    `;
    expect(stored).toEqual({ is_team: true, problem_rating_observed: null });
  });

  it('creates one deterministic first solve under retries and concurrent submissions', async () => {
    const [user] = await client.connection<{ id: string }[]>`
      INSERT INTO users (full_name, display_name) VALUES ('Student', 'Student') RETURNING id
    `;
    if (!user) throw new Error('Missing fixture user');
    const first = await service.ingest(
      user.id,
      makeSubmission({ id: 200, creationTimeSeconds: 100 }),
    );
    const second = await service.ingest(
      user.id,
      makeSubmission({ id: 201, creationTimeSeconds: 101 }),
    );
    const results = await Promise.all([
      firstSolves.record(user.id, first, new Date(0)),
      firstSolves.record(user.id, first, new Date(0)),
      firstSolves.record(user.id, second, new Date(0)),
    ]);
    expect(results.filter((result) => result.created)).toHaveLength(1);
    const [stored] = await client.connection<
      { first_ok_submission_id: string; first_solved_at: Date }[]
    >`
      SELECT first_ok_submission_id, first_solved_at FROM user_problem_solves
    `;
    expect(stored?.first_ok_submission_id).toBe('200');
  });

  it('does not create a personal first solve for a team submission', async () => {
    const [user] = await client.connection<{ id: string }[]>`
      INSERT INTO users (full_name, display_name) VALUES ('Student', 'Student') RETURNING id
    `;
    if (!user) throw new Error('Missing fixture user');
    const team = await service.ingest(
      user.id,
      makeSubmission({ author: { members: [{ handle: 'one' }, { handle: 'two' }] } }),
    );
    await expect(firstSolves.record(user.id, team, new Date(0))).resolves.toMatchObject({
      created: false,
    });
  });

  it('replays rated first solves chronologically with scoring policy v3.0', async () => {
    const [user] = await client.connection<{ id: string }[]>`
      INSERT INTO users (full_name, display_name) VALUES ('Student', 'Student') RETURNING id
    `;
    if (!user) throw new Error('Missing fixture user');
    const ingested = await service.ingestBatch(user.id, [
      makeSubmission({ id: 300, problem: { ...makeSubmission().problem, rating: 1200 } }),
      makeSubmission({
        id: 301,
        problem: { ...makeSubmission().problem, contestId: 1001, rating: 1400 },
      }),
    ]);
    await firstSolves.recordBatch(user.id, ingested, new Date(0), false);
    const result = await level.recompute(user.id);
    expect(result.version).toBe('v3.0');
    expect(result.level).toBe(807.9013);
    const [state] = await client.connection<{ cc_base: string; cc_level: string }[]>`
      SELECT cc_base, cc_level FROM user_skill_state WHERE user_id = ${user.id}
    `;
    expect(Number(state?.cc_base)).toBe(800);
    expect(Number(state?.cc_level)).toBe(807.9013);
  });

  it('resumes a crashed backfill from its persisted cursor without creating EARN', async () => {
    const [user] = await client.connection<{ id: string }[]>`
      INSERT INTO users (full_name, display_name) VALUES ('Student', 'Student') RETURNING id
    `;
    if (!user) throw new Error('Missing fixture user');
    const [account] = await client.connection<{ id: string }[]>`
      INSERT INTO codeforces_accounts (
        user_id, handle, verification_status, verified_at,
        reward_eligible_from, sync_status
      ) VALUES (
        ${user.id}, 'student', 'TEACHER_VERIFIED', now(), now(), 'INITIALIZING'
      ) RETURNING id
    `;
    if (!account) throw new Error('Missing fixture account');
    const pages = [
      makeSubmission({
        id: 401,
        problem: { ...makeSubmission().problem, contestId: 2000 },
      }),
      makeSubmission({
        id: 402,
        problem: { ...makeSubmission().problem, contestId: 2001 },
      }),
      makeSubmission({
        id: 403,
        problem: { ...makeSubmission().problem, contestId: 2002 },
      }),
    ];
    const environment = { values: { BACKFILL_PAGE_SIZE: 2 } } as EnvironmentService;
    const failingClient = {
      userInfo: () => Promise.resolve({ handle: 'student', rating: 1200 }),
      userStatus: (_handle: string, from: number) =>
        from === 1 ? Promise.resolve(pages.slice(0, 2)) : Promise.reject(new Error('crash')),
    } as unknown as CodeforcesClient;
    const job = {
      userId: user.id,
      accountId: account.id,
      handle: 'student',
      mode: 'BACKFILL' as const,
    };
    const firstProcessor = new SyncProcessorService(
      failingClient,
      service,
      firstSolves,
      level,
      rewards,
      reconciliation,
      { sql: client.connection } as DatabaseService,
      environment,
    );
    await expect(firstProcessor.process(job)).rejects.toThrow('crash');
    const [checkpoint] = await client.connection<{ backfill_next_from: number }[]>`
      SELECT backfill_next_from FROM codeforces_accounts WHERE id = ${account.id}
    `;
    expect(checkpoint?.backfill_next_from).toBe(3);

    const resumeClient = {
      userInfo: () => Promise.resolve({ handle: 'student', rating: 1200 }),
      userStatus: (_handle: string, from: number) =>
        Promise.resolve(from === 3 ? pages.slice(2) : []),
    } as unknown as CodeforcesClient;
    const resumedProcessor = new SyncProcessorService(
      resumeClient,
      service,
      firstSolves,
      level,
      rewards,
      reconciliation,
      { sql: client.connection } as DatabaseService,
      environment,
    );
    await expect(resumedProcessor.process(job)).resolves.toMatchObject({ upstreamRows: 1 });
    const [counts] = await client.connection<{ solves: number; earns: number; eligible: number }[]>`
      SELECT
        (SELECT count(*)::int FROM user_problem_solves) AS solves,
        (SELECT count(*)::int FROM point_transactions WHERE type = 'EARN') AS earns,
        (SELECT count(*)::int FROM user_problem_solves WHERE reward_eligible) AS eligible
    `;
    expect(counts).toEqual({ solves: 3, earns: 0, eligible: 0 });
    const [completed] = await client.connection<
      { backfill_completed_at: string | null; backfill_next_from: number | null }[]
    >`
      SELECT backfill_completed_at, backfill_next_from
      FROM codeforces_accounts WHERE id = ${account.id}
    `;
    expect(completed?.backfill_completed_at).not.toBeNull();
    expect(completed?.backfill_next_from).toBeNull();
  });

  it('awards one immutable EARN and one wallet increment across ten retries', async () => {
    const [user] = await client.connection<{ id: string }[]>`
      INSERT INTO users (full_name, display_name) VALUES ('Student', 'Student') RETURNING id
    `;
    if (!user) throw new Error('Missing fixture user');
    await client.connection`
      INSERT INTO seasons (
        name, start_at, end_at, status, scoring_policy_version
      ) VALUES (
        'Active season', '2023-11-01T00:00:00Z', '2023-12-01T00:00:00Z',
        'ACTIVE', 'v2.0'
      )
    `;
    const ingested = await service.ingest(user.id, makeSubmission({ id: 500 }));
    const results = await Promise.all(
      Array.from({ length: 10 }, () => rewards.process(user.id, ingested, new Date(0))),
    );
    expect(results.filter((result) => result.awarded)).toHaveLength(1);
    const [totals] = await client.connection<
      {
        solves: number;
        earns: number;
        ledger: string;
        wallet: string;
        season_score: string;
        streak_bonuses: number;
        earn_metadata: {
          ccLevelAfter: number;
          ccLevelDelta: number;
          displayCcLevelBefore: number;
          rewardReferenceLevelBefore: number;
        };
      }[]
    >`
      SELECT
        (SELECT count(*)::int FROM user_problem_solves) AS solves,
        (SELECT count(*)::int FROM point_transactions WHERE type = 'EARN') AS earns,
        (SELECT COALESCE(sum(amount), 0)::text FROM point_transactions WHERE affects_wallet) AS ledger,
        (SELECT balance::text FROM user_wallets WHERE user_id = ${user.id}) AS wallet,
        (SELECT score::text FROM season_user_totals WHERE user_id = ${user.id}) AS season_score,
        (SELECT count(*)::int FROM point_transactions
          WHERE metadata ->> 'mode' = 'DAILY') AS streak_bonuses,
        (SELECT metadata FROM point_transactions WHERE type = 'EARN') AS earn_metadata
    `;
    expect(totals?.solves).toBe(1);
    expect(totals?.earns).toBe(1);
    expect(totals?.streak_bonuses).toBe(1);
    expect(totals?.wallet).toBe(totals?.ledger);
    expect(Number(totals?.season_score)).toBe(
      calculateReward(1200, 800, {
        min: 0.25,
        max: 12.5,
        midpointDelta: 50,
        scale: 120,
        maxPositiveDelta: 500,
      }),
    );
    expect(Number(totals?.wallet)).toBe(
      calculateReward(1200, 800, {
        min: 0.25,
        max: 12.5,
        midpointDelta: 50,
        scale: 120,
        maxPositiveDelta: 500,
      }) + 1,
    );
    expect(totals?.earn_metadata).toEqual({
      ccLevelAfter: 803.9281,
      ccLevelDelta: 3.9281,
      displayCcLevelBefore: 800,
      rewardReferenceLevelBefore: 800,
    });

    await expect(
      client.connection`UPDATE point_transactions SET amount = amount + 1 WHERE type = 'EARN'`,
    ).rejects.toThrow('append-only');
    await expect(
      client.connection`DELETE FROM point_transactions WHERE type = 'EARN'`,
    ).rejects.toThrow('append-only');
  });

  it('increases CC Level, CC Point and CC Balance after an eligible rated first solve', async () => {
    const [user] = await client.connection<{ id: string }[]>`
      INSERT INTO users (full_name, display_name) VALUES ('Progress', 'Progress') RETURNING id
    `;
    if (!user) throw new Error('Missing progress fixture user');

    for (let index = 0; index < 40; index += 1) {
      const historical = await service.ingest(
        user.id,
        makeSubmission({
          id: 10_000 + index,
          problem: {
            ...makeSubmission().problem,
            contestId: 20_000 + index,
            rating: 1400,
          },
        }),
      );
      await rewards.process(user.id, historical, null);
    }
    const [before] = await client.connection<{ cc_level: string }[]>`
      SELECT cc_level::text FROM user_skill_state WHERE user_id = ${user.id}
    `;
    if (!before) throw new Error('Missing CC Level before new solve');

    const accepted = await service.ingest(
      user.id,
      makeSubmission({
        id: 20_100,
        problem: { ...makeSubmission().problem, contestId: 30_100, rating: 1600 },
      }),
    );
    const result = await rewards.process(user.id, accepted, new Date(0));
    const [after] = await client.connection<
      { cc_level: string; cc_point: string; cc_balance: string }[]
    >`
      SELECT skill.cc_level::text,
        COALESCE((SELECT sum(amount) FROM point_transactions
          WHERE user_id = ${user.id} AND type NOT IN ('REDEEM', 'REFUND')), 0)::text AS cc_point,
        wallets.balance::text AS cc_balance
      FROM user_skill_state AS skill
      JOIN user_wallets AS wallets ON wallets.user_id = skill.user_id
      WHERE skill.user_id = ${user.id}
    `;
    expect(result).toMatchObject({ firstSolveCreated: true, awarded: true });
    expect(result.amount).toBeGreaterThan(0);
    expect(Number(after?.cc_level)).toBeGreaterThan(Number(before.cc_level));
    expect(Number(after?.cc_point)).toBe(result.amount + 1);
    expect(after?.cc_balance).toBe(after?.cc_point);
  });

  it('awards points immediately while flagging a burst of unusually hard solves', async () => {
    const [user] = await client.connection<{ id: string }[]>`
      INSERT INTO users (full_name, display_name) VALUES ('Risk', 'Risk') RETURNING id
    `;
    if (!user) throw new Error('Missing risk fixture user');

    for (let index = 0; index < 5; index += 1) {
      const ingested = await service.ingest(
        user.id,
        makeSubmission({
          id: 80_000 + index,
          creationTimeSeconds: 1_700_000_000 + index * 60,
          problem: {
            ...makeSubmission().problem,
            contestId: 80_000 + index,
            rating: 1500,
          },
        }),
      );
      await expect(rewards.process(user.id, ingested, new Date(0))).resolves.toMatchObject({
        awarded: true,
      });
    }

    const [result] = await client.connection<
      { activity_risk_score: number; activity_risk_level: string; earns: number; wallet: string }[]
    >`
      SELECT users.activity_risk_score, users.activity_risk_level,
        (SELECT count(*)::int FROM point_transactions
          WHERE user_id = users.id AND type = 'EARN') AS earns,
        wallets.balance::text AS wallet
      FROM users JOIN user_wallets AS wallets ON wallets.user_id = users.id
      WHERE users.id = ${user.id}
    `;
    expect(result?.earns).toBe(5);
    expect(Number(result?.wallet)).toBeGreaterThan(0);
    expect(result?.activity_risk_score).toBeGreaterThanOrEqual(10);
    expect(result?.activity_risk_level).toBe('PRIORITY');
  });

  it('coordinates multiple schedulers and recovers due state after queue loss', async () => {
    const [user] = await client.connection<{ id: string }[]>`
      INSERT INTO users (full_name, display_name) VALUES ('Scheduled', 'Scheduled') RETURNING id
    `;
    if (!user) throw new Error('Missing scheduler user fixture');
    await client.connection`
      INSERT INTO codeforces_accounts (
        user_id, handle, verification_status, verified_at, reward_eligible_from,
        sync_status, next_sync_at, backfill_completed_at
      ) VALUES (
        ${user.id}, 'scheduled_user', 'TEACHER_VERIFIED', now(), now(),
        'READY', now() - interval '1 minute', now()
      )
    `;

    class MemoryQueue implements SchedulerQueue {
      readonly jobs = new Set<string>();
      addCalls = 0;

      getJobCounts() {
        return Promise.resolve({ waiting: this.jobs.size, active: 0, delayed: 0, prioritized: 0 });
      }

      getJob(id: string) {
        if (!this.jobs.has(id)) return Promise.resolve(undefined);
        return Promise.resolve({
          getState: () => Promise.resolve('waiting'),
          remove: () => {
            this.jobs.delete(id);
            return Promise.resolve();
          },
        });
      }

      add(_name: string, _data: unknown, options: Record<string, unknown>) {
        this.jobs.add(String(options.jobId));
        this.addCalls += 1;
        return Promise.resolve({});
      }
    }

    const queue = new MemoryQueue();
    const environment = {
      values: {
        CF_REQUEST_INTERVAL_MS: 2200,
        SYNC_CAPACITY_RESERVE_PERCENT: 0.25,
        SCHEDULER_BATCH_SIZE: 25,
        SYNC_ONLINE_TARGET_MINUTES: 15,
        SYNC_RECENT_TARGET_MINUTES: 30,
        SYNC_OFFLINE_TARGET_MINUTES: 1440,
      },
    } as EnvironmentService;
    const makeScheduler = () =>
      new AdaptiveSchedulerService(
        { sql: client.connection } as DatabaseService,
        {} as RedisService,
        environment,
      );
    const results = await Promise.all([
      makeScheduler().runOnce(queue),
      makeScheduler().runOnce(queue),
    ]);
    expect(results.reduce((sum, result) => sum + result.enqueued, 0)).toBe(1);
    expect(queue.addCalls).toBe(1);
    const [scheduled] = await client.connection<{ next_sync_at: Date }[]>`
      SELECT next_sync_at FROM codeforces_accounts WHERE user_id = ${user.id}
    `;
    expect(new Date(scheduled!.next_sync_at).getTime()).toBeGreaterThan(Date.now());

    queue.jobs.clear();
    await client.connection`
      UPDATE codeforces_accounts SET next_sync_at = now() - interval '1 minute'
      WHERE user_id = ${user.id}
    `;
    const recovered = await makeScheduler().runOnce(queue);
    expect(recovered.enqueued).toBe(1);
    expect(queue.addCalls).toBe(2);
  });

  it('reverses an invalidated reward and promotes the next valid first solve', async () => {
    const [user] = await client.connection<{ id: string }[]>`
      INSERT INTO users (full_name, display_name) VALUES ('Rejudge', 'Rejudge') RETURNING id
    `;
    if (!user) throw new Error('Missing rejudge user fixture');
    const [season] = await client.connection<{ id: string }[]>`
      INSERT INTO seasons (name, start_at, end_at, status, scoring_policy_version)
      VALUES (
        'Rejudge season', '2023-11-01T00:00:00Z', '2023-12-01T00:00:00Z',
        'ACTIVE', 'v2.0'
      ) RETURNING id
    `;
    if (!season) throw new Error('Missing rejudge season fixture');
    const first = await service.ingest(
      user.id,
      makeSubmission({ id: 700, creationTimeSeconds: 1_700_000_000 }),
    );
    const later = await service.ingest(
      user.id,
      makeSubmission({ id: 701, creationTimeSeconds: 1_700_000_100 }),
    );
    await rewards.process(user.id, first, new Date(0));
    await rewards.process(user.id, later, new Date(0));
    const [original] = await client.connection<{ id: string; amount: string }[]>`
      SELECT id, amount FROM point_transactions WHERE type = 'EARN' AND source_submission_id = 700
    `;
    if (!original) throw new Error('Missing original EARN fixture');
    await service.ingest(
      user.id,
      makeSubmission({ id: 700, creationTimeSeconds: 1_700_000_000, verdict: 'WRONG_ANSWER' }),
    );

    await expect(reconciliation.reconcileUser(user.id, new Date(0))).resolves.toEqual({
      corrected: 1,
    });
    const [result] = await client.connection<
      {
        canonical: string;
        original_amount: string;
        reversals: number;
        replacement_earns: number;
        wallet: string;
        ledger: string;
        season_score: string;
        season_ledger: string;
      }[]
    >`
      SELECT
        (SELECT first_ok_submission_id::text FROM user_problem_solves
          WHERE user_id = ${user.id}) AS canonical,
        (SELECT amount::text FROM point_transactions WHERE id = ${original.id}) AS original_amount,
        (SELECT count(*)::int FROM point_transactions
          WHERE type = 'REVERSAL' AND related_transaction_id = ${original.id}) AS reversals,
        (SELECT count(*)::int FROM point_transactions
          WHERE type = 'EARN' AND source_submission_id = 701) AS replacement_earns,
        (SELECT balance::text FROM user_wallets WHERE user_id = ${user.id}) AS wallet,
        (SELECT sum(amount)::text FROM point_transactions
          WHERE user_id = ${user.id} AND affects_wallet) AS ledger,
        (SELECT score::text FROM season_user_totals
          WHERE season_id = ${season.id} AND user_id = ${user.id}) AS season_score,
        (SELECT sum(amount)::text FROM point_transactions
          WHERE season_id = ${season.id} AND user_id = ${user.id} AND affects_season) AS season_ledger
    `;
    expect(result).toMatchObject({
      canonical: '701',
      original_amount: original.amount,
      reversals: 1,
      replacement_earns: 1,
    });
    expect(result?.wallet).toBe(result?.ledger);
    expect(result?.season_score).toBe(result?.season_ledger);
  });

  it('records an explicit closed-season correction while retaining immutable history', async () => {
    const [user] = await client.connection<{ id: string }[]>`
      INSERT INTO users (full_name, display_name) VALUES ('Closed', 'Closed') RETURNING id
    `;
    if (!user) throw new Error('Missing closed-season user fixture');
    const [season] = await client.connection<{ id: string }[]>`
      INSERT INTO seasons (name, start_at, end_at, status, scoring_policy_version)
      VALUES (
        'Closed correction', '2023-11-01T00:00:00Z', '2023-12-01T00:00:00Z',
        'ACTIVE', 'v2.0'
      ) RETURNING id
    `;
    if (!season) throw new Error('Missing closed season fixture');
    const submission = await service.ingest(
      user.id,
      makeSubmission({ id: 800, creationTimeSeconds: 1_700_000_000 }),
    );
    await rewards.process(user.id, submission, new Date(0));
    const [earn] = await client.connection<{ id: string; amount: string }[]>`
      SELECT id, amount FROM point_transactions WHERE type = 'EARN' AND source_submission_id = 800
    `;
    if (!earn) throw new Error('Missing closed-season EARN fixture');
    await client.connection`UPDATE seasons SET status = 'CLOSED' WHERE id = ${season.id}`;
    await service.ingest(
      user.id,
      makeSubmission({ id: 800, creationTimeSeconds: 1_700_000_000, verdict: 'SKIPPED' }),
    );
    await reconciliation.reconcileUser(user.id, new Date(0));
    const [result] = await client.connection<
      { earn_amount: string; reversals: number; solves: number; workflow_audits: number }[]
    >`
      SELECT
        (SELECT amount::text FROM point_transactions WHERE id = ${earn.id}) AS earn_amount,
        (SELECT count(*)::int FROM point_transactions
          WHERE type = 'REVERSAL' AND related_transaction_id = ${earn.id}) AS reversals,
        (SELECT count(*)::int FROM user_problem_solves WHERE user_id = ${user.id}) AS solves,
        (SELECT count(*)::int FROM audit_logs
          WHERE action = 'CLOSED_SEASON_CORRECTION_RECORDED' AND entity_id = ${season.id}) AS workflow_audits
    `;
    expect(result).toEqual({
      earn_amount: earn.amount,
      reversals: 1,
      solves: 0,
      workflow_audits: 1,
    });
  });
});
