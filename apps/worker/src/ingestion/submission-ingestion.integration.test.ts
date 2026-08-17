import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { migrateDatabase, type DatabaseClient, createDatabaseClient } from '@cc/database';
import type { CodeforcesSubmission } from '@cc/core';
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

config({ path: resolve(__dirname, '../../../../.env'), quiet: true });

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required');
let client: DatabaseClient;
let service: SubmissionIngestionService;
let firstSolves: FirstSolveService;
let level: LevelService;
let rewards: RewardEngineService;

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
  });
  beforeEach(async () => {
    await client.connection`
      TRUNCATE cf_submissions, cf_problems, scoring_policies, users RESTART IDENTITY CASCADE
    `;
    await client.connection`
      INSERT INTO scoring_policies (
        version, level_decay, level_denominator, default_cc_base,
        reward_min, reward_max, reward_midpoint_delta, reward_scale, effective_from
      ) VALUES ('v2.0', 0.95, 20, 800, 0.05, 30, 50, 80, now())
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

  it('persists the versioned CC level while respecting the default base', async () => {
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
    expect(result.version).toBe('v2.0');
    expect(result.level).toBe(800);
    const [state] = await client.connection<{ cc_base: string; cc_level: string }[]>`
      SELECT cc_base, cc_level FROM user_skill_state WHERE user_id = ${user.id}
    `;
    expect(Number(state?.cc_base)).toBe(800);
    expect(Number(state?.cc_level)).toBe(800);
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
      userStatus: (_handle: string, from: number) =>
        from === 1 ? Promise.resolve(pages.slice(0, 2)) : Promise.reject(new Error('crash')),
    } as CodeforcesClient;
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
      { sql: client.connection } as DatabaseService,
      environment,
    );
    await expect(firstProcessor.process(job)).rejects.toThrow('crash');
    const [checkpoint] = await client.connection<{ backfill_next_from: number }[]>`
      SELECT backfill_next_from FROM codeforces_accounts WHERE id = ${account.id}
    `;
    expect(checkpoint?.backfill_next_from).toBe(3);

    const resumeClient = {
      userStatus: (_handle: string, from: number) =>
        Promise.resolve(from === 3 ? pages.slice(2) : []),
    } as CodeforcesClient;
    const resumedProcessor = new SyncProcessorService(
      resumeClient,
      service,
      firstSolves,
      level,
      rewards,
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
      { solves: number; earns: number; ledger: string; wallet: string; season_score: string }[]
    >`
      SELECT
        (SELECT count(*)::int FROM user_problem_solves) AS solves,
        (SELECT count(*)::int FROM point_transactions WHERE type = 'EARN') AS earns,
        (SELECT COALESCE(sum(amount), 0)::text FROM point_transactions WHERE affects_wallet) AS ledger,
        (SELECT balance::text FROM user_wallets WHERE user_id = ${user.id}) AS wallet,
        (SELECT score::text FROM season_user_totals WHERE user_id = ${user.id}) AS season_score
    `;
    expect(totals?.solves).toBe(1);
    expect(totals?.earns).toBe(1);
    expect(totals?.wallet).toBe(totals?.ledger);
    expect(totals?.season_score).toBe(totals?.ledger);

    await expect(
      client.connection`UPDATE point_transactions SET amount = amount + 1 WHERE type = 'EARN'`,
    ).rejects.toThrow('append-only');
    await expect(
      client.connection`DELETE FROM point_transactions WHERE type = 'EARN'`,
    ).rejects.toThrow('append-only');
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
        SYNC_HOT_TARGET_HOURS: 2,
        SYNC_WARM_TARGET_HOURS: 6,
        SYNC_COLD_TARGET_HOURS: 24,
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
});
