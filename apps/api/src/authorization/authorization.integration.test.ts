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
);

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
});
