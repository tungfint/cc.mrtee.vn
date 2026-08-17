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

config({ path: resolve(__dirname, '../../../../.env'), quiet: true });

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required');
let client: DatabaseClient;
let service: SubmissionIngestionService;
let firstSolves: FirstSolveService;
let level: LevelService;

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
});
