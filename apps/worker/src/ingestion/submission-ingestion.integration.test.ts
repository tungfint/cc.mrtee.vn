import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { migrateDatabase, type DatabaseClient, createDatabaseClient } from '@cc/database';
import type { CodeforcesSubmission } from '@cc/core';
import { config } from 'dotenv';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseService } from '../database/database.service';
import { SubmissionIngestionService } from './submission-ingestion.service';

config({ path: resolve(__dirname, '../../../../.env'), quiet: true });

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required');
let client: DatabaseClient;
let service: SubmissionIngestionService;

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
    client = createDatabaseClient(databaseUrl, 1);
    service = new SubmissionIngestionService({ sql: client.connection } as DatabaseService);
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
});
