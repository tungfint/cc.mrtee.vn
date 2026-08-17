import { resolve } from 'node:path';
import { config } from 'dotenv';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrateDatabase } from '@cc/database';
import type { DatabaseService } from '../database/database.service';
import type { AuthUser } from '../auth/auth.types';
import { AuthService } from '../auth/auth.service';
import type { EnvironmentService } from '../config/environment';
import { CodeforcesAccountsService } from '../codeforces-accounts/codeforces-accounts.service';
import { SeasonClosureService } from '../seasons/season-closure.service';
import { AuthorizationService } from './authorization.service';

config({ path: resolve(__dirname, '../../../../.env'), quiet: true });

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required');
const connection = postgres(testDatabaseUrl, { max: 1 });
const service = new AuthorizationService({ sql: connection } as DatabaseService);
const authService = new AuthService(
  { sql: connection } as DatabaseService,
  { values: { SESSION_TTL_HOURS: 168 } } as EnvironmentService,
);
const codeforcesAccounts = new CodeforcesAccountsService(
  { sql: connection } as DatabaseService,
  service,
  {
    enqueue: () => Promise.resolve(true),
  } as unknown as import('../sync/sync-queue.service').SyncQueueService,
);
const seasonClosure = new SeasonClosureService({ sql: connection } as DatabaseService, service);

const authUser = (userId: string, systemRole: AuthUser['systemRole'] = 'USER'): AuthUser => ({
  sessionId: 'test-session',
  userId,
  displayName: 'Test user',
  systemRole,
  csrfTokenHash: 'test-csrf',
});

describe('authorization matrix', () => {
  const ids: Record<string, string> = {};

  beforeAll(async () =>
    migrateDatabase(testDatabaseUrl, resolve(__dirname, '../../../../packages/database/drizzle')),
  );
  beforeEach(async () => {
    await connection`
      TRUNCATE auth_sessions, user_credentials, audit_logs, organization_memberships,
        organizations, scoring_policies, users RESTART IDENTITY CASCADE
    `;
    await connection`
      INSERT INTO scoring_policies (
        version, level_decay, level_denominator, default_cc_base,
        reward_min, reward_max, reward_midpoint_delta, reward_scale, effective_from
      ) VALUES ('v2.0', 0.95, 20, 800, 0.05, 30, 50, 80, now())
    `;
    for (const name of ['member', 'teacher', 'orgAdmin', 'systemAdmin']) {
      const [user] = await connection<{ id: string }[]>`
        INSERT INTO users (full_name, display_name, system_role)
        VALUES (
          ${name},
          ${name},
          ${name === 'systemAdmin' ? 'SYSTEM_ADMIN' : 'USER'}
        ) RETURNING id
      `;
      if (!user) throw new Error('Failed to create authorization fixture');
      ids[name] = user.id;
    }
    for (const [key, visibility] of [
      ['publicOrg', 'PUBLIC'],
      ['closedOrg', 'CLOSED'],
      ['privateOrg', 'PRIVATE'],
      ['otherPrivateOrg', 'PRIVATE'],
    ] as const) {
      const [organization] = await connection<{ id: string }[]>`
        INSERT INTO organizations (name, slug, visibility)
        VALUES (${key}, ${key.toLowerCase()}, ${visibility}) RETURNING id
      `;
      if (!organization) throw new Error('Failed to create organization fixture');
      ids[key] = organization.id;
    }
    await connection`
      INSERT INTO organization_memberships (organization_id, user_id, role)
      VALUES
        (${ids.privateOrg!}, ${ids.member!}, 'MEMBER'),
        (${ids.privateOrg!}, ${ids.teacher!}, 'TEACHER'),
        (${ids.privateOrg!}, ${ids.orgAdmin!}, 'ORG_ADMIN')
    `;
  });
  afterAll(async () => connection.end({ timeout: 5 }));

  it('allows guest only for PUBLIC organizations', async () => {
    const publicAccess = await service.organizationAccess(ids.publicOrg!);
    expect(() => service.assertCanView(publicAccess)).not.toThrow();
    const closedAccess = await service.organizationAccess(ids.closedOrg!);
    expect(() => service.assertCanView(closedAccess)).toThrow();
    const privateAccess = await service.organizationAccess(ids.privateOrg!);
    expect(() => service.assertCanView(privateAccess)).toThrow();
  });

  it('allows authenticated users into CLOSED and only own PRIVATE organization', async () => {
    const member = authUser(ids.member!);
    const closedAccess = await service.organizationAccess(ids.closedOrg!, member);
    expect(() => service.assertCanView(closedAccess, member)).not.toThrow();
    const ownAccess = await service.organizationAccess(ids.privateOrg!, member);
    expect(() => service.assertCanView(ownAccess, member)).not.toThrow();
    const otherAccess = await service.organizationAccess(ids.otherPrivateOrg!, member);
    expect(() => service.assertCanView(otherAccess, member)).toThrow();
  });

  it('does not promote teachers and scopes organization admins to their organization', async () => {
    const teacher = authUser(ids.teacher!);
    const teacherAccess = await service.organizationAccess(ids.privateOrg!, teacher);
    expect(() => service.assertCanTeach(teacherAccess, teacher)).not.toThrow();
    expect(() => service.assertCanManage(teacherAccess, teacher)).toThrow();
    expect(teacher.systemRole).toBe('USER');

    const orgAdmin = authUser(ids.orgAdmin!);
    const ownAccess = await service.organizationAccess(ids.privateOrg!, orgAdmin);
    expect(() => service.assertCanManage(ownAccess, orgAdmin)).not.toThrow();
    const otherAccess = await service.organizationAccess(ids.otherPrivateOrg!, orgAdmin);
    expect(() => service.assertCanManage(otherAccess, orgAdmin)).toThrow();
  });

  it('allows SYSTEM_ADMIN to override organization visibility and management', async () => {
    const systemAdmin = authUser(ids.systemAdmin!, 'SYSTEM_ADMIN');
    const access = await service.organizationAccess(ids.otherPrivateOrg!, systemAdmin);
    expect(() => service.assertCanView(access, systemAdmin)).not.toThrow();
    expect(() => service.assertCanManage(access, systemAdmin)).not.toThrow();
  });

  it('creates credentials and stores only hashed session and CSRF tokens', async () => {
    const userId = await authService.createUser({
      email: 'student@example.com',
      password: 'correct horse battery staple',
      fullName: 'Student One',
      displayName: 'Student',
    });
    const login = await authService.login('STUDENT@example.com', 'correct horse battery staple');
    expect(login.user.userId).toBe(userId);
    const [session] = await connection<{ token_hash: string; csrf_token_hash: string }[]>`
      SELECT token_hash, csrf_token_hash FROM auth_sessions WHERE user_id = ${userId}
    `;
    expect(session?.token_hash).not.toContain(login.sessionToken);
    expect(session?.csrf_token_hash).not.toContain(login.csrfToken);
    expect(session?.token_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('keeps linked handles unverified until an authorized atomic verification', async () => {
    const member = authUser(ids.member!);
    const linked = await codeforcesAccounts.link(member, 'Tourist_Test');
    expect(linked.verification_status).toBe('UNVERIFIED');
    expect((await codeforcesAccounts.getOwn(member.userId))?.eligible).toBe(false);

    await expect(
      codeforcesAccounts.link(authUser(ids.orgAdmin!), 'tourist_test'),
    ).rejects.toThrow();

    const verified = await codeforcesAccounts.verify({
      organizationId: ids.privateOrg!,
      targetUserId: member.userId,
      actor: authUser(ids.teacher!),
      reason: 'Verified in supervised class',
    });
    expect(verified.verification_status).toBe('TEACHER_VERIFIED');
    expect(verified.sync_status).toBe('INITIALIZING');
    expect(verified.verified_at?.getTime()).toBe(verified.reward_eligible_from?.getTime());
    expect((await codeforcesAccounts.getOwn(member.userId))?.eligible).toBe(true);
  });

  it('closes a season into deterministic snapshots and awards exactly once', async () => {
    await connection`
      INSERT INTO user_skill_state (user_id, cc_base, cc_calculated, cc_level)
      VALUES
        (${ids.member!}, 800, 500, 1300),
        (${ids.teacher!}, 800, 450, 1250)
    `;
    const [season] = await connection<{ id: string }[]>`
      INSERT INTO seasons (
        name, start_at, end_at, status, scoring_policy_version
      ) VALUES (
        'Closure fixture', now() - interval '30 days', now(), 'CLOSING', 'v2.0'
      ) RETURNING id
    `;
    if (!season) throw new Error('Failed to create season fixture');
    await connection`
      INSERT INTO season_user_totals (
        season_id, user_id, earned, score, qualifying_solves, reached_score_at
      ) VALUES
        (${season.id}, ${ids.member!}, 100, 100, 5, now() - interval '2 days'),
        (${season.id}, ${ids.teacher!}, 100, 100, 3, now() - interval '3 days')
    `;

    const result = await seasonClosure.close(
      season.id,
      authUser(ids.systemAdmin!, 'SYSTEM_ADMIN'),
      'Fixture closure',
    );
    expect(result.snapshots).toBe(2);
    const snapshots = await connection<
      { user_id: string; final_rank: number; season_score: string }[]
    >`
      SELECT user_id, final_rank, season_score
      FROM season_user_snapshots WHERE season_id = ${season.id}
      ORDER BY final_rank
    `;
    expect(snapshots.map(({ user_id, final_rank }) => ({ user_id, final_rank }))).toEqual([
      { user_id: ids.member!, final_rank: 1 },
      { user_id: ids.teacher!, final_rank: 2 },
    ]);
    const [{ count: awardCount } = { count: '0' }] = await connection<{ count: string }[]>`
      SELECT count(*)::text AS count FROM season_awards WHERE season_id = ${season.id}
    `;
    expect(Number(awardCount)).toBe(4);
    await expect(
      seasonClosure.close(
        season.id,
        authUser(ids.systemAdmin!, 'SYSTEM_ADMIN'),
        'Duplicate closure',
      ),
    ).rejects.toThrow();
    const [{ count: snapshotCount } = { count: '0' }] = await connection<{ count: string }[]>`
      SELECT count(*)::text AS count FROM season_user_snapshots WHERE season_id = ${season.id}
    `;
    expect(Number(snapshotCount)).toBe(2);
  });
});
