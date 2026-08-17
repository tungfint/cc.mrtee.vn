import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import postgres, { type Sql } from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrateDatabase } from './migrate';

config({ path: resolve(__dirname, '../../../.env'), quiet: true });

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL is required for database integration tests');
}

const connection = postgres(testDatabaseUrl, { max: 1 });

async function resetDatabase(sql: Sql): Promise<void> {
  await sql.unsafe(`
    TRUNCATE TABLE
      audit_logs,
      point_transactions,
      reward_orders,
      rewards,
      season_awards,
      season_user_snapshots,
      season_user_totals,
      user_wallets,
      user_problem_solves,
      cf_submissions,
      cf_problems,
      codeforces_accounts,
      user_skill_state,
      organization_memberships,
      seasons,
      organizations,
      scoring_policies,
      users
    RESTART IDENTITY CASCADE
  `);

  await sql`
    INSERT INTO scoring_policies (
      version,
      level_decay,
      level_denominator,
      default_cc_base,
      reward_min,
      reward_max,
      reward_midpoint_delta,
      reward_scale,
      effective_from
    ) VALUES ('v2.0', 0.95, 20, 800, 0.05, 30.00, 50, 80, '2026-08-18T00:00:00+07:00')
  `;
}

async function insertUser(sql: Sql, displayName = 'Student'): Promise<string> {
  const userId = randomUUID();
  await sql`
    INSERT INTO users (id, full_name, display_name)
    VALUES (${userId}, ${`${displayName} Full Name`}, ${displayName})
  `;
  return userId;
}

async function insertProblemAndSubmission(
  sql: Sql,
  userId: string,
  submissionId: string,
  contestId: string,
): Promise<string> {
  const problemKey = `contest:${contestId}:A`;
  await sql`
    INSERT INTO cf_problems (
      problem_key,
      contest_id,
      problem_index,
      name,
      type,
      current_rating
    ) VALUES (${problemKey}, ${contestId}, 'A', 'Test Problem', 'PROGRAMMING', 1200)
  `;
  await sql`
    INSERT INTO cf_submissions (
      cf_submission_id,
      user_id,
      problem_key,
      creation_time,
      verdict,
      participant_type,
      is_team,
      problem_rating_observed
    ) VALUES (
      ${submissionId},
      ${userId},
      ${problemKey},
      '2026-08-18T00:00:00Z',
      'OK',
      'PRACTICE',
      false,
      1200
    )
  `;
  return problemKey;
}

async function expectPostgresError(action: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await action();
    throw new Error(`Expected PostgreSQL error ${code}`);
  } catch (error: unknown) {
    expect((error as { code?: string }).code).toBe(code);
  }
}

beforeAll(async () => {
  await migrateDatabase(testDatabaseUrl);
});

beforeEach(async () => {
  await resetDatabase(connection);
});

afterAll(async () => {
  await connection.end({ timeout: 5 });
});

describe('Phase 1 database invariants', () => {
  it('seeds scoring policy v2.0 with the approved parameters', async () => {
    const [policy] = await connection`
      SELECT
        version,
        level_decay,
        level_denominator,
        default_cc_base,
        reward_min,
        reward_max,
        reward_midpoint_delta,
        reward_scale
      FROM scoring_policies
      WHERE version = 'v2.0'
    `;

    expect(policy).toMatchObject({
      version: 'v2.0',
      level_decay: '0.9500000',
      level_denominator: '20.0000',
      default_cc_base: '800.00',
      reward_min: '0.05',
      reward_max: '30.00',
      reward_midpoint_delta: '50.00',
      reward_scale: '80.00',
    });
  });

  it('enforces Codeforces submission and canonical first-solve uniqueness', async () => {
    const userId = await insertUser(connection);
    const submissionId = '9000000001';
    const problemKey = await insertProblemAndSubmission(connection, userId, submissionId, '1000');

    await expectPostgresError(
      async () =>
        connection`
          INSERT INTO cf_submissions (
            cf_submission_id,
            user_id,
            problem_key,
            creation_time,
            verdict,
            is_team
          ) VALUES (${submissionId}, ${userId}, ${problemKey}, now(), 'OK', false)
        `,
      '23505',
    );

    await connection`
      INSERT INTO user_problem_solves (
        user_id,
        problem_key,
        first_ok_submission_id,
        first_solved_at,
        rating_snapshot,
        reward_eligible
      ) VALUES (${userId}, ${problemKey}, ${submissionId}, now(), 1200, true)
    `;

    await expectPostgresError(
      async () =>
        connection`
          INSERT INTO user_problem_solves (
            user_id,
            problem_key,
            first_ok_submission_id,
            first_solved_at,
            rating_snapshot,
            reward_eligible
          ) VALUES (${userId}, ${problemKey}, ${submissionId}, now(), 1200, true)
        `,
      '23505',
    );
  });

  it('enforces EARN uniqueness and command idempotency at database level', async () => {
    const userId = await insertUser(connection);
    const submissionId = '9000000002';
    await insertProblemAndSubmission(connection, userId, submissionId, '1001');

    await connection`
      INSERT INTO point_transactions (
        user_id,
        type,
        amount,
        source_submission_id,
        idempotency_key,
        affects_wallet,
        affects_season,
        cc_level_before,
        problem_rating_snapshot,
        scoring_policy_version,
        event_at
      ) VALUES (
        ${userId},
        'EARN',
        19.56,
        ${submissionId},
        'earn:submission:9000000002',
        true,
        false,
        1100,
        1200,
        'v2.0',
        now()
      )
    `;

    await expectPostgresError(
      async () =>
        connection`
          INSERT INTO point_transactions (
            user_id,
            type,
            amount,
            source_submission_id,
            idempotency_key,
            cc_level_before,
            problem_rating_snapshot,
            scoring_policy_version,
            event_at
          ) VALUES (
            ${userId},
            'EARN',
            19.56,
            ${submissionId},
            'different-command-key',
            1100,
            1200,
            'v2.0',
            now()
          )
        `,
      '23505',
    );

    await expectPostgresError(
      async () =>
        connection`
          INSERT INTO point_transactions (
            user_id,
            type,
            amount,
            idempotency_key,
            event_at
          ) VALUES (${userId}, 'BONUS', 1.00, 'earn:submission:9000000002', now())
        `,
      '23505',
    );
  });

  it('keeps ledger ownership, season attribution, and adjustment idempotency consistent', async () => {
    const ownerId = await insertUser(connection, 'Owner');
    const otherUserId = await insertUser(connection, 'Other');
    const submissionId = '9000000003';
    await insertProblemAndSubmission(connection, ownerId, submissionId, '1002');

    await expectPostgresError(
      async () =>
        connection`
          INSERT INTO point_transactions (
            user_id,
            type,
            amount,
            source_submission_id,
            idempotency_key,
            event_at
          ) VALUES (
            ${otherUserId},
            'BONUS',
            1.00,
            ${submissionId},
            'cross-user-submission',
            now()
          )
        `,
      '23503',
    );

    await expectPostgresError(
      async () =>
        connection`
          INSERT INTO point_transactions (
            user_id,
            type,
            amount,
            affects_season,
            event_at
          ) VALUES (${ownerId}, 'BONUS', 1.00, true, now())
        `,
      '23514',
    );

    await expectPostgresError(
      async () =>
        connection`
          INSERT INTO point_transactions (user_id, type, amount, event_at)
          VALUES (${ownerId}, 'ADJUSTMENT', 1.00, now())
        `,
      '23514',
    );
  });

  it('allows membership history but only one active membership', async () => {
    const userId = await insertUser(connection);
    const organizationId = randomUUID();
    await connection`
      INSERT INTO organizations (id, name, slug)
      VALUES (${organizationId}, 'Class A', 'class-a')
    `;
    const [membership] = await connection`
      INSERT INTO organization_memberships (organization_id, user_id, role)
      VALUES (${organizationId}, ${userId}, 'MEMBER')
      RETURNING id
    `;

    await expectPostgresError(
      async () =>
        connection`
          INSERT INTO organization_memberships (organization_id, user_id, role)
          VALUES (${organizationId}, ${userId}, 'MEMBER')
        `,
      '23505',
    );

    await connection`
      UPDATE organization_memberships
      SET status = 'LEFT', left_at = now()
      WHERE id = ${membership?.id as string}
    `;
    await expect(
      connection`
        INSERT INTO organization_memberships (organization_id, user_id, role)
        VALUES (${organizationId}, ${userId}, 'MEMBER')
      `,
    ).resolves.toBeDefined();
  });

  it('enforces one season snapshot per user and season', async () => {
    const userId = await insertUser(connection);
    const seasonId = randomUUID();
    await connection`
      INSERT INTO seasons (
        id,
        name,
        start_at,
        end_at,
        status,
        scoring_policy_version
      ) VALUES (
        ${seasonId},
        'August 2026',
        '2026-08-01T00:00:00+07:00',
        '2026-09-01T00:00:00+07:00',
        'CLOSED',
        'v2.0'
      )
    `;

    const insertSnapshot = async () =>
      connection`
        INSERT INTO season_user_snapshots (
          season_id,
          user_id,
          cc_level_start,
          cc_level_end,
          cc_level_growth,
          season_score,
          qualifying_solves,
          active_days,
          longest_streak,
          final_rank,
          closed_at
        ) VALUES (${seasonId}, ${userId}, 800, 900, 100, 50, 5, 4, 3, 1, now())
      `;

    await insertSnapshot();
    await expectPostgresError(insertSnapshot, '23505');
  });

  it('uses case-insensitive Codeforces handles and requires atomic verification timestamps', async () => {
    const firstUserId = await insertUser(connection, 'First');
    const secondUserId = await insertUser(connection, 'Second');

    await connection`
      INSERT INTO codeforces_accounts (user_id, handle)
      VALUES (${firstUserId}, 'Tourist')
    `;
    await expectPostgresError(
      async () =>
        connection`
          INSERT INTO codeforces_accounts (user_id, handle)
          VALUES (${secondUserId}, 'tourist')
        `,
      '23505',
    );

    await expectPostgresError(
      async () =>
        connection`
          UPDATE codeforces_accounts
          SET verification_status = 'TEACHER_VERIFIED', verified_at = now()
          WHERE user_id = ${firstUserId}
        `,
      '23514',
    );
  });

  it('stores ledger and wallet values as NUMERIC(12,2) and permits correction debt', async () => {
    const numericColumns = await connection`
      SELECT table_name, column_name, numeric_precision, numeric_scale
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (table_name, column_name) IN (
          ('point_transactions', 'amount'),
          ('user_wallets', 'balance'),
          ('rewards', 'cost'),
          ('reward_orders', 'cost_snapshot')
        )
      ORDER BY table_name, column_name
    `;

    expect(numericColumns).toHaveLength(4);
    for (const column of numericColumns) {
      expect(column.numeric_precision).toBe(12);
      expect(column.numeric_scale).toBe(2);
    }

    const userId = await insertUser(connection);
    await expect(
      connection`
        INSERT INTO user_wallets (user_id, balance)
        VALUES (${userId}, -5.00)
      `,
    ).resolves.toBeDefined();
  });

  it('prevents duplicate redeem commands with a stable idempotency key', async () => {
    const userId = await insertUser(connection);
    const otherUserId = await insertUser(connection, 'Other redeemer');
    const rewardId = randomUUID();
    await connection`
      INSERT INTO rewards (id, name, description, cost, stock)
      VALUES (${rewardId}, 'Notebook', 'School notebook', 25.00, 10)
    `;

    const [order] = await connection<{ id: string }[]>`
      INSERT INTO reward_orders (user_id, reward_id, cost_snapshot, idempotency_key)
      VALUES (${userId}, ${rewardId}, 25.00, 'redeem:test-command')
      RETURNING id
    `;
    if (!order) {
      throw new Error('Expected the reward order insert to return an id');
    }

    await expectPostgresError(
      async () =>
        connection`
          INSERT INTO point_transactions (
            user_id,
            type,
            amount,
            source_reward_order_id,
            event_at
          ) VALUES (${otherUserId}, 'REDEEM', -25.00, ${order.id}, now())
        `,
      '23503',
    );

    await expectPostgresError(
      async () =>
        connection`
          INSERT INTO reward_orders (user_id, reward_id, cost_snapshot, idempotency_key)
          VALUES (${userId}, ${rewardId}, 25.00, 'redeem:test-command')
        `,
      '23505',
    );
  });
});
