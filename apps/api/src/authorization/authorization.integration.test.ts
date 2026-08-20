import { basename, join, resolve } from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { config } from 'dotenv';
import postgres from 'postgres';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrateDatabase } from '@cc/database';
import type { DatabaseService } from '../database/database.service';
import type { AuthUser } from '../auth/auth.types';
import { AuthService } from '../auth/auth.service';
import type { EnvironmentService } from '../config/environment';
import { CodeforcesAccountsService } from '../codeforces-accounts/codeforces-accounts.service';
import { SeasonClosureService } from '../seasons/season-closure.service';
import { RewardsService } from '../rewards/rewards.service';
import { StreakService } from '../rewards/streak.service';
import { RewardsAdminController } from '../rewards/rewards-admin.controller';
import { RewardImageService } from '../rewards/reward-image.service';
import { InsightsController } from '../insights/insights.controller';
import { RecognitionImageService } from '../insights/recognition-image.service';
import { ScoringAdjustmentsService } from '../scoring/scoring-adjustments.service';
import { BulkPointImportService } from '../scoring/bulk-point-import.service';
import type { SyncJobData } from '@cc/core';
import { UsersController } from '../users/users.controller';
import { AdminOrganizationsController } from '../organizations/admin-organizations.controller';
import { OrganizationsController } from '../organizations/organizations.controller';
import { StudentImportService } from '../organizations/student-import.service';
import { AvatarService } from '../users/avatar.service';
import { AuthorizationService } from './authorization.service';
import { ContentController } from '../content/content.controller';

config({ path: resolve(__dirname, '../../../../.env'), quiet: true });

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required');
const connection = postgres(testDatabaseUrl, { max: 1 });
const concurrentConnection = postgres(testDatabaseUrl, { max: 1 });
const service = new AuthorizationService({ sql: connection } as DatabaseService);
const authService = new AuthService(
  { sql: connection } as DatabaseService,
  { values: { SESSION_TTL_HOURS: 168 } } as EnvironmentService,
);
const syncQueueCalls: SyncJobData[] = [];
const codeforcesAccounts = new CodeforcesAccountsService(
  { sql: connection } as DatabaseService,
  service,
  {
    enqueue: (data: SyncJobData) => {
      syncQueueCalls.push(data);
      return Promise.resolve(true);
    },
  } as unknown as import('../sync/sync-queue.service').SyncQueueService,
);
const seasonClosure = new SeasonClosureService({ sql: connection } as DatabaseService, service);
const rewards = new RewardsService({ sql: connection } as DatabaseService);
const concurrentRewards = new RewardsService({ sql: concurrentConnection } as DatabaseService);
const rewardsAdmin = new RewardsAdminController(
  { sql: connection } as DatabaseService,
  {
    store: () => Promise.resolve('/api/uploads/rewards/test.webp'),
  } as unknown as RewardImageService,
);
const streaks = new StreakService({ sql: connection } as DatabaseService);
const insights = new InsightsController({ sql: connection } as DatabaseService, service, streaks, {
  store: () => Promise.resolve('/api/uploads/recognition/test.png'),
} as unknown as RecognitionImageService);
const contentController = new ContentController({ sql: connection } as DatabaseService);
const adjustments = new ScoringAdjustmentsService({ sql: connection } as DatabaseService, service);
const bulkPointImport = new BulkPointImportService(service, adjustments, {
  sql: connection,
} as DatabaseService);
const usersController = new UsersController({ sql: connection } as DatabaseService, authService);
const adminOrganizations = new AdminOrganizationsController({ sql: connection } as DatabaseService);
const organizationsController = new OrganizationsController(
  { sql: connection } as DatabaseService,
  service,
);
const studentImport = new StudentImportService(service, authService, {
  sql: connection,
} as DatabaseService);

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
    syncQueueCalls.length = 0;
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
  afterAll(async () => {
    await concurrentConnection.end({ timeout: 5 });
    await connection.end({ timeout: 5 });
  });

  it('allows guest only for PUBLIC organizations', async () => {
    const publicAccess = await service.organizationAccess(ids.publicOrg!);
    expect(() => service.assertCanView(publicAccess)).not.toThrow();
    const closedAccess = await service.organizationAccess(ids.closedOrg!);
    expect(() => service.assertCanView(closedAccess)).toThrow();
    const privateAccess = await service.organizationAccess(ids.privateOrg!);
    expect(() => service.assertCanView(privateAccess)).toThrow();
  });

  it('adds multiple eligible students to a class from pasted emails', async () => {
    await connection`
      INSERT INTO user_credentials (user_id, email, password_hash)
      VALUES
        (${ids.member!}, 'member-bulk@example.com', 'test-password-hash'),
        (${ids.teacher!}, 'teacher-bulk@example.com', 'test-password-hash')
    `;
    const result = await organizationsController.addMembersByEmail(
      ids.publicOrg!,
      {
        emails: ['member-bulk@example.com', 'teacher-bulk@example.com', 'missing@example.com'],
      },
      authUser(ids.systemAdmin!, 'SYSTEM_ADMIN'),
    );
    expect(result).toMatchObject({ requested: 3, matched: 1, added: 1, alreadyInClass: 0 });
    expect(result.notFound).toEqual(['teacher-bulk@example.com', 'missing@example.com']);
    const replay = await organizationsController.addMembersByEmail(
      ids.publicOrg!,
      { emails: ['member-bulk@example.com'] },
      authUser(ids.systemAdmin!, 'SYSTEM_ADMIN'),
    );
    expect(replay).toMatchObject({ matched: 1, added: 0, alreadyInClass: 1 });
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

  it('manages self profiles, user lifecycle, and organizations with audit records', async () => {
    const member = authUser(ids.member!);
    const updatedProfile = await usersController.updateMe(
      {
        displayName: 'Member Avatar',
        avatarUrl: 'https://example.com/avatar.png',
        timezone: 'Asia/Ho_Chi_Minh',
      },
      member,
    );
    expect(updatedProfile.user).toMatchObject({
      display_name: 'Member Avatar',
      avatar_url: 'https://example.com/avatar.png',
    });

    const listing = await usersController.listUsers({ search: 'Member Avatar', pageSize: '10' });
    expect(listing.total).toBe(1);
    expect(listing.users).toHaveLength(1);

    const systemAdmin = authUser(ids.systemAdmin!, 'SYSTEM_ADMIN');
    const updatedUser = await usersController.updateUser(
      ids.member!,
      { status: 'SUSPENDED', reason: 'Lifecycle fixture' },
      systemAdmin,
    );
    expect(updatedUser.user).toMatchObject({ status: 'SUSPENDED' });
    const updatedOrganization = await adminOrganizations.update(
      ids.privateOrg!,
      { slug: 'private-class-edited', visibility: 'CLOSED', reason: 'Visibility fixture' },
      systemAdmin,
    );
    expect(updatedOrganization.organization).toMatchObject({
      slug: 'private-class-edited',
      visibility: 'CLOSED',
    });
    const [{ count } = { count: 0 }] = await connection<{ count: number }[]>`
      SELECT count(*)::int AS count FROM audit_logs
      WHERE action IN ('USER_PROFILE_UPDATED', 'USER_UPDATED', 'ORGANIZATION_UPDATED')
    `;
    expect(count).toBe(3);
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
    const [skill] = await connection<{ cc_base: string; cc_level: string }[]>`
      SELECT cc_base, cc_level FROM user_skill_state WHERE user_id = ${userId}
    `;
    expect(skill).toMatchObject({ cc_base: '800.00', cc_level: '800.00' });
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
    expect(new Date(verified.verified_at!).getTime()).toBe(
      new Date(verified.reward_eligible_from!).getTime(),
    );
    expect((await codeforcesAccounts.getOwn(member.userId))?.eligible).toBe(true);

    const requested = await codeforcesAccounts.link(member, 'Tourist_Changed');
    expect(requested.handle).toBe('Tourist_Test');
    expect(requested.pending_handle).toBe('Tourist_Changed');
    await expect(
      codeforcesAccounts.approveHandleChange({
        organizationId: ids.privateOrg!,
        targetUserId: member.userId,
        actor: authUser(ids.teacher!),
        reason: 'Teacher cannot approve a handle change',
      }),
    ).rejects.toThrow('Chỉ Admin');
    const approved = await codeforcesAccounts.approveHandleChange({
      organizationId: ids.privateOrg!,
      targetUserId: member.userId,
      actor: authUser(ids.orgAdmin!),
      reason: 'Admin confirmed ownership',
    });
    expect(approved.handle).toBe('Tourist_Changed');
    expect(approved.pending_handle).toBeNull();
    expect(approved.verification_status).toBe('ADMIN_VERIFIED');
  });

  it('lets system admins verify unassigned students in one batch', async () => {
    const [student] = await connection<{ id: string }[]>`
      INSERT INTO users (full_name, display_name) VALUES ('No Class', 'No Class') RETURNING id
    `;
    if (!student) throw new Error('Failed to create unassigned student');
    await codeforcesAccounts.link(authUser(student.id), 'no_class_cf');
    const result = await codeforcesAccounts.verifyBatch({
      targetUserIds: [student.id],
      actor: authUser(ids.systemAdmin!, 'SYSTEM_ADMIN'),
      reason: 'System admin verified an unassigned student',
    });
    expect(result).toMatchObject({ requested: 1, verified: 1, skipped: 0 });
    expect((await codeforcesAccounts.getOwn(student.id))?.verification_status).toBe(
      'ADMIN_VERIFIED',
    );
  });

  it('allows teachers to import students with class, handle, and initial level', async () => {
    const csv = [
      'tai_khoan,mat_khau,ho_va_ten,ten_hien_thi,tai_khoan_codeforces,muc_ban_dau',
      'imported@example.com,Temporary!2026,Nguyen Van Import,Import Student,import_cf,950',
    ].join('\n');
    const result = await studentImport.import(
      ids.privateOrg!,
      {
        originalname: 'students.csv',
        buffer: Buffer.from(csv),
      } as Express.Multer.File,
      authUser(ids.teacher!),
    );
    expect(result).toMatchObject({ created: 1, failed: 0, total: 1 });
    const [student] = await connection<
      { email: string; cc_base: string; handle: string; organization_id: string }[]
    >`
      SELECT credentials.email, skill.cc_base, accounts.handle, memberships.organization_id
      FROM user_credentials AS credentials
      JOIN user_skill_state AS skill ON skill.user_id = credentials.user_id
      JOIN codeforces_accounts AS accounts ON accounts.user_id = credentials.user_id
      JOIN organization_memberships AS memberships ON memberships.user_id = credentials.user_id
      WHERE credentials.email = 'imported@example.com'
    `;
    expect(student).toMatchObject({
      email: 'imported@example.com',
      cc_base: '950.00',
      handle: 'import_cf',
      organization_id: ids.privateOrg,
    });
  });

  it('imports global students with optional class slug and first-login password flag', async () => {
    const csv = [
      'tai_khoan,mat_khau,ho_va_ten,ten_hien_thi,tai_khoan_codeforces,muc_ban_dau,lop_hoc_slug,doi_mat_khau_lan_dau',
      'global-class@example.com,Temporary!2026,Global Class,Global Class,,800,privateorg,YES',
      'global-free@example.com,Temporary!2026,Global Free,Global Free,,800,,NO',
    ].join('\n');
    const result = await studentImport.importGlobal(
      {
        originalname: 'students.csv',
        buffer: Buffer.from(`\uFEFF${csv}`, 'utf8'),
      } as Express.Multer.File,
      authUser(ids.systemAdmin!, 'SYSTEM_ADMIN'),
    );
    expect(result).toMatchObject({ created: 2, failed: 0, total: 2 });
    const imported = await connection<
      { email: string; must_change_password: boolean; organization_id: string | null }[]
    >`
      SELECT credentials.email, credentials.must_change_password,
        memberships.organization_id
      FROM user_credentials AS credentials
      LEFT JOIN organization_memberships AS memberships ON memberships.user_id = credentials.user_id
      WHERE credentials.email IN ('global-class@example.com', 'global-free@example.com')
      ORDER BY credentials.email
    `;
    expect(imported).toEqual([
      {
        email: 'global-class@example.com',
        must_change_password: true,
        organization_id: ids.privateOrg,
      },
      { email: 'global-free@example.com', must_change_password: false, organization_id: null },
    ]);
  });

  it('imports signed CC Point commands idempotently for students in the class', async () => {
    await connection`
      INSERT INTO user_credentials (user_id, email, password_hash)
      VALUES (${ids.member!}, 'member@example.com', 'test-password-hash')
    `;
    const csv = [
      'tai_khoan,thao_tac,cc_point,ly_do,anh_huong_mua',
      'member@example.com,CỘNG,25,Thuong thu thach,KHÔNG',
    ].join('\n');
    const file = {
      originalname: 'points.csv',
      buffer: Buffer.from(csv),
    } as Express.Multer.File;
    const first = await bulkPointImport.import(ids.privateOrg!, file, authUser(ids.teacher!));
    expect(first).toMatchObject({ applied: 1, replayed: 0, failed: 0, total: 1 });
    const replay = await bulkPointImport.import(ids.privateOrg!, file, authUser(ids.teacher!));
    expect(replay).toMatchObject({ applied: 0, replayed: 1, failed: 0, total: 1 });
    const [wallet] = await connection<{ balance: string; transactions: number }[]>`
      SELECT wallets.balance,
        (SELECT count(*)::int FROM point_transactions WHERE user_id = ${ids.member!}) AS transactions
      FROM user_wallets AS wallets WHERE wallets.user_id = ${ids.member!}
    `;
    expect(wallet).toEqual({ balance: '25.00', transactions: 1 });
  });

  it('queues Codeforces sync by account, class, or system scope with authorization', async () => {
    await codeforcesAccounts.link(authUser(ids.member!), 'Sync_Student');
    await codeforcesAccounts.verify({
      organizationId: ids.privateOrg!,
      targetUserId: ids.member!,
      actor: authUser(ids.teacher!),
      reason: 'Verify before sync',
    });
    const organizationResult = await codeforcesAccounts.requestAdminSync({
      scope: 'ORGANIZATION',
      organizationId: ids.privateOrg!,
      actor: authUser(ids.teacher!),
    });
    expect(organizationResult).toEqual({
      scope: 'ORGANIZATION',
      matched: 1,
      queued: 1,
      skipped: 0,
    });
    expect(syncQueueCalls).toHaveLength(1);
    const [unassigned] = await connection<{ id: string }[]>`
      INSERT INTO users (full_name, display_name) VALUES ('Unassigned Sync', 'Unassigned Sync')
      RETURNING id
    `;
    if (!unassigned) throw new Error('Failed to create unassigned sync fixture');
    await codeforcesAccounts.link(authUser(unassigned.id), 'Unassigned_Sync');
    await codeforcesAccounts.verify({
      targetUserId: unassigned.id,
      actor: authUser(ids.systemAdmin!, 'SYSTEM_ADMIN'),
      reason: 'Verify unassigned student before sync',
    });
    await expect(
      codeforcesAccounts.requestAdminSync({
        scope: 'USER',
        targetUserId: unassigned.id,
        actor: authUser(ids.systemAdmin!, 'SYSTEM_ADMIN'),
      }),
    ).resolves.toMatchObject({ matched: 1, queued: 1 });
    await expect(
      codeforcesAccounts.requestAdminSync({
        scope: 'USER',
        targetUserId: unassigned.id,
        actor: authUser(ids.teacher!),
      }),
    ).rejects.toThrow('Chọn lớp');
    await expect(
      codeforcesAccounts.requestAdminSync({ scope: 'ALL', actor: authUser(ids.teacher!) }),
    ).rejects.toThrow('System Admin');
    await expect(
      codeforcesAccounts.requestAdminSync({
        scope: 'ALL',
        actor: authUser(ids.systemAdmin!, 'SYSTEM_ADMIN'),
      }),
    ).resolves.toMatchObject({ matched: 2, queued: 2 });
  });

  it('validates, normalizes, and stores cropped avatars', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cc-avatar-test-'));
    try {
      const avatars = new AvatarService(
        { sql: connection } as DatabaseService,
        { values: { UPLOAD_DIR: directory } } as EnvironmentService,
      );
      const input = await sharp({
        create: { width: 120, height: 240, channels: 3, background: '#35d5d1' },
      })
        .png()
        .toBuffer();
      const url = await avatars.store(ids.member!, input);
      const stored = await readFile(join(directory, 'avatars', basename(url)));
      const metadata = await sharp(stored).metadata();
      expect(url).toMatch(/^\/api\/uploads\/avatars\/[a-f0-9-]+\.webp$/);
      expect(metadata).toMatchObject({ width: 512, height: 512, format: 'webp' });
      await avatars.remove(ids.member!);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('normalizes reward uploads to the catalog aspect ratio', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cc-reward-test-'));
    try {
      const images = new RewardImageService({
        values: { UPLOAD_DIR: directory },
      } as EnvironmentService);
      const source = await sharp({
        create: { width: 300, height: 700, channels: 3, background: '#e83e8c' },
      })
        .png()
        .toBuffer();
      const url = await images.store(source);
      expect(url).toMatch(/^\/api\/uploads\/rewards\/[a-f0-9-]+\.webp$/);
      const file = await readFile(join(directory, 'rewards', basename(url)));
      const metadata = await sharp(file).metadata();
      expect(metadata).toMatchObject({ width: 1200, height: 800, format: 'webp' });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('stores public recognition images at the social sharing aspect ratio', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cc-recognition-test-'));
    try {
      const images = new RecognitionImageService(
        { values: { UPLOAD_DIR: directory } } as EnvironmentService,
        { sql: connection } as DatabaseService,
      );
      const source = await sharp({
        create: { width: 600, height: 750, channels: 3, background: '#f472b6' },
      })
        .png()
        .toBuffer();
      const url = await images.store(ids.member!, source);
      expect(url).toMatch(/^\/api\/uploads\/recognition\/[a-f0-9-]+\.png$/);
      const file = await readFile(join(directory, 'recognition', basename(url)));
      const metadata = await sharp(file).metadata();
      expect(metadata).toMatchObject({ width: 1200, height: 1500, format: 'png' });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
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

  it('allows at most one concurrent redeem and refunds without mutating the ledger', async () => {
    await connection`
      INSERT INTO user_wallets (user_id, balance) VALUES (${ids.member!}, 100)
    `;
    const [reward] = await connection<{ id: string }[]>`
      INSERT INTO rewards (name, description, cost, stock)
      VALUES ('Mentor session', 'One mentoring session', 80, 1)
      RETURNING id
    `;
    if (!reward) throw new Error('Failed to create reward fixture');

    const attempts = await Promise.allSettled([
      rewards.redeem(ids.member!, reward.id, 'concurrent-request-a'),
      concurrentRewards.redeem(ids.member!, reward.id, 'concurrent-request-b'),
    ]);
    expect(attempts.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter(({ status }) => status === 'rejected')).toHaveLength(1);
    const [state] = await connection<
      { balance: string; stock: number; orders: string; redeems: string }[]
    >`
      SELECT wallets.balance, rewards.stock,
        (SELECT count(*)::text FROM reward_orders WHERE user_id = ${ids.member!}) AS orders,
        (SELECT count(*)::text FROM point_transactions WHERE user_id = ${ids.member!}
          AND type = 'REDEEM') AS redeems
      FROM user_wallets AS wallets CROSS JOIN rewards
      WHERE wallets.user_id = ${ids.member!} AND rewards.id = ${reward.id}
    `;
    expect(state).toMatchObject({ balance: '20.00', stock: 0, orders: '1', redeems: '1' });

    const [order] = await connection<{ id: string; idempotency_key: string }[]>`
      SELECT id, idempotency_key FROM reward_orders WHERE user_id = ${ids.member!}
    `;
    if (!order) throw new Error('Reward order fixture is unavailable');
    const clientKey = order.idempotency_key.split(':').at(-1)!;
    const replay = await rewards.redeem(ids.member!, reward.id, clientKey);
    expect(replay.replayed).toBe(true);

    await rewards.transitionOrder(
      order.id,
      'REJECTED',
      authUser(ids.systemAdmin!, 'SYSTEM_ADMIN'),
      'Reward unavailable',
    );
    const [refunded] = await connection<
      { balance: string; stock: number; refunds: string; ledger_sum: string }[]
    >`
      SELECT wallets.balance, rewards.stock,
        (SELECT count(*)::text FROM point_transactions WHERE user_id = ${ids.member!}
          AND type = 'REFUND') AS refunds,
        (SELECT sum(amount)::text FROM point_transactions WHERE user_id = ${ids.member!}) AS ledger_sum
      FROM user_wallets AS wallets CROSS JOIN rewards
      WHERE wallets.user_id = ${ids.member!} AND rewards.id = ${reward.id}
    `;
    expect(refunded).toMatchObject({
      balance: '100.00',
      stock: 1,
      refunds: '1',
      ledger_sum: '0.00',
    });
  });

  it('returns bounded dashboard analytics and privacy-safe leaderboard rows', async () => {
    await connection`DELETE FROM motivational_quotes`;
    await connection`
      INSERT INTO motivational_quotes (content, author, active, sort_order)
      VALUES ('Danh ngôn dùng cho ảnh vinh danh.', 'Test suite', true, 1)
    `;
    const dashboard = await insights.dashboard(authUser(ids.member!));
    expect(dashboard.profile).toMatchObject({
      id: ids.member!,
      display_name: 'member',
      recent_five_average_rating: null,
      recent_five_rated_count: 0,
    });
    expect(dashboard.streak).toMatchObject({ longest_streak: 0, current_streak: 0 });
    const leaderboard = await insights.leaderboard({ page: '1', pageSize: '2' });
    expect(leaderboard.entries).toHaveLength(1);
    expect(leaderboard.entries[0]).toHaveProperty('displayName');
    expect(leaderboard.entries[0]).not.toHaveProperty('email');
    expect(leaderboard.total).toBe(1);
    const balanceLeaderboard = await insights.leaderboard({
      page: '1',
      pageSize: '2',
      sort: 'CC_BALANCE',
    });
    expect(balanceLeaderboard.entries[0]).toHaveProperty('ccBalance');
    const recognition = await insights.ownRecognition(authUser(ids.member!));
    expect(recognition.profile).toMatchObject({
      id: ids.member!,
      total_solves: 0,
      highest_problem_rating: null,
    });
    expect(recognition).toHaveProperty('awards');
    expect(recognition).toHaveProperty('rewards');
    expect(recognition).toHaveProperty('topTags');
    expect(recognition).toHaveProperty('pointHistory');
    expect(recognition.quote).toMatchObject({ content: 'Danh ngôn dùng cho ảnh vinh danh.' });
    const publicProfile = await insights.studentProfile(ids.member!);
    expect(publicProfile.profile).toMatchObject({ id: ids.member!, classes: ['privateOrg'] });
    expect(publicProfile.pointHistory).toEqual([]);
    const ownerProfile = await insights.studentProfile(ids.member!, authUser(ids.member!));
    expect(ownerProfile).toHaveProperty('pointHistory');
  });

  it('requires the configured CC Level before redeeming a mascot', async () => {
    const actor = authUser(ids.systemAdmin!, 'SYSTEM_ADMIN');
    const created = await rewardsAdmin.create(
      {
        name: 'Level mascot',
        description: 'Collectible mascot with a level gate',
        cost: 30,
        stock: null,
        active: true,
        imageUrl: '/mascots/meo-mam-code.webp',
        category: 'MASCOT',
        requiredCcLevel: 1200,
      },
      actor,
    );
    await connection`
      INSERT INTO user_wallets (user_id, balance) VALUES (${ids.member!}, 100)
      ON CONFLICT (user_id) DO UPDATE SET balance = EXCLUDED.balance
    `;
    await connection`
      INSERT INTO user_skill_state (user_id, cc_base, cc_calculated, cc_level)
      VALUES (${ids.member!}, 800, 0, 800)
      ON CONFLICT (user_id) DO UPDATE SET cc_level = 800
    `;
    await expect(
      rewards.redeem(ids.member!, String(created.reward.id), 'mascot-level-low'),
    ).rejects.toThrow('Cần đạt CC Level 1200');
    await connection`
      UPDATE user_skill_state SET cc_level = 1200 WHERE user_id = ${ids.member!}
    `;
    await expect(
      rewards.redeem(ids.member!, String(created.reward.id), 'mascot-level-ready'),
    ).resolves.toMatchObject({ replayed: false });
  });

  it('sacrifices one fulfilled mascot for each missing Streak day', async () => {
    const [mascot] = await connection<{ id: string }[]>`
      INSERT INTO rewards (name, description, cost, category, image_url)
      VALUES ('Streak mascot', 'Used by the rescue fixture', 30, 'MASCOT', '/mascots/meo-mam-code.webp')
      RETURNING id
    `;
    if (!mascot) throw new Error('Mascot fixture unavailable');
    const orders = await connection<{ id: string }[]>`
      INSERT INTO reward_orders (user_id, reward_id, cost_snapshot, status, idempotency_key, reviewed_at)
      VALUES
        (${ids.member!}, ${mascot.id}, 30, 'FULFILLED', 'streak-order-1', now()),
        (${ids.member!}, ${mascot.id}, 30, 'FULFILLED', 'streak-order-2', now()),
        (${ids.member!}, ${mascot.id}, 30, 'FULFILLED', 'streak-order-3', now())
      RETURNING id
    `;
    await connection`
      INSERT INTO cf_problems (problem_key, contest_id, problem_index, name, type, current_rating)
      VALUES
        ('2000:A', 2000, 'A', 'Old solve', 'PROGRAMMING', 800),
        ('2000:B', 2000, 'B', 'Today solve', 'PROGRAMMING', 900)
    `;
    await connection`
      INSERT INTO cf_submissions (
        cf_submission_id, user_id, problem_key, creation_time, verdict, is_team,
        problem_rating_observed
      ) VALUES
        (900000000001, ${ids.member!}, '2000:A',
          date_trunc('day', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh' - interval '4 days' + interval '9 hours',
          'OK', false, 800),
        (900000000002, ${ids.member!}, '2000:B',
          date_trunc('day', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh' + interval '9 hours',
          'OK', false, 900)
    `;
    await connection`
      INSERT INTO user_problem_solves (
        user_id, problem_key, first_ok_submission_id, first_solved_at, rating_snapshot
      )
      SELECT user_id, problem_key, cf_submission_id, creation_time, problem_rating_observed
      FROM cf_submissions WHERE user_id = ${ids.member!}
    `;
    const before = await streaks.summary(ids.member!);
    expect(before.rescue).toMatchObject({ available: true, requiredMascots: 3 });
    await streaks.rescue(
      ids.member!,
      orders.map((order) => order.id),
    );
    const after = await streaks.summary(ids.member!);
    expect(after).toMatchObject({ currentStreak: 2, pendingBonus: 1 });
    expect(after.timeline.filter((day) => day.kind === 'RESCUE')).toHaveLength(3);
    expect(after.rescue.mascots).toHaveLength(0);
    await expect(
      streaks.rescue(
        ids.member!,
        orders.map((order) => order.id),
      ),
    ).rejects.toThrow();
  });

  it('deletes unused rewards and archives rewards that have historical orders', async () => {
    const actor = authUser(ids.systemAdmin!, 'SYSTEM_ADMIN');
    const archivedClass = await adminOrganizations.archive(ids.publicOrg!, actor);
    expect(archivedClass.organization).toMatchObject({ status: 'INACTIVE' });
    const unused = await rewardsAdmin.create(
      {
        name: 'Delete me',
        description: 'Unused reward can be deleted',
        cost: 100,
        stock: null,
        active: true,
        imageUrl: '/api/uploads/rewards/test.webp',
      },
      actor,
    );
    const deletedReward = await rewardsAdmin.archive(String(unused.reward.id), actor);
    expect(deletedReward).toMatchObject({ deleted: true, archived: false });

    const historical = await rewardsAdmin.create(
      {
        name: 'Archive me',
        description: 'Reward retained for history',
        cost: 100,
        stock: null,
        active: true,
        imageUrl: '/api/uploads/rewards/test.webp',
      },
      actor,
    );
    await connection`
      INSERT INTO reward_orders (user_id, reward_id, cost_snapshot, idempotency_key)
      VALUES (${ids.member!}, ${String(historical.reward.id)}, 100, 'archive-history-test')
    `;
    const archivedReward = await rewardsAdmin.archive(String(historical.reward.id), actor);
    expect(archivedReward).toMatchObject({ deleted: false, archived: true });
    expect(archivedReward.reward).toMatchObject({ active: false });
    const [counts] = await connection<
      { organizations: string; unused_rewards: string; historical_rewards: string }[]
    >`
      SELECT
        (SELECT count(*)::text FROM organizations WHERE id = ${ids.publicOrg!}) AS organizations,
        (SELECT count(*)::text FROM rewards WHERE id = ${String(unused.reward.id)}) AS unused_rewards,
        (SELECT count(*)::text FROM rewards WHERE id = ${String(historical.reward.id)})
          AS historical_rewards
    `;
    expect(counts).toEqual({ organizations: '1', unused_rewards: '0', historical_rewards: '1' });
  });

  it('manages rotating quotes and configurable CC Level ranks', async () => {
    const actor = authUser(ids.systemAdmin!, 'SYSTEM_ADMIN');
    const createdQuote = await contentController.createQuote(
      {
        content: 'Kiên trì tạo nên tiến bộ.',
        author: 'Test suite',
        active: true,
        sortOrder: 999,
      },
      actor,
    );
    const createdRank = await contentController.createRank(
      {
        minLevel: 9999,
        name: 'Test rank',
        icon: 'TEST',
        color: '#e83e8c',
        active: true,
      },
      actor,
    );
    const dashboardContent = await contentController.dashboardContent();
    expect(dashboardContent.quotes).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: createdQuote.quote.id })]),
    );
    expect(dashboardContent.ranks).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: createdRank.rank.id })]),
    );
    const firstHeart = await contentController.heartQuote(String(createdQuote.quote.id));
    const secondHeart = await contentController.heartQuote(String(createdQuote.quote.id));
    expect(firstHeart).toEqual({ heartCount: 1 });
    expect(secondHeart).toEqual({ heartCount: 2 });
    await connection`
      UPDATE motivational_quotes SET heart_count = 999999 WHERE id = ${String(createdQuote.quote.id)}
    `;
    await expect(contentController.heartQuote(String(createdQuote.quote.id))).resolves.toEqual({
      heartCount: 999999,
    });
    const pasted = await contentController.importPastedQuotes(
      {
        text: [
          'Châm ngôn | Tác giả | Thứ tự | Có',
          'Trên bước đường thành công không có dấu chân của kẻ lười biếng. | Cầy Cốt MrTee.vn | 1 | Có',
          'Thiên tài 1% là cảm hứng và 99% là mồ hôi. | Cầy Cốt MrTee.vn | 2 | Không',
        ].join('\n'),
      },
      actor,
    );
    expect(pasted).toMatchObject({ created: 2, failed: 0, total: 2 });
    await contentController.deleteQuote(String(createdQuote.quote.id), actor);
    await contentController.deleteRank(String(createdRank.rank.id), actor);
  });

  it('enforces organization-scoped teacher adjustments with atomic audit and idempotency', async () => {
    await connection`
      INSERT INTO seasons (
        organization_id, name, start_at, end_at, status, scoring_policy_version
      ) VALUES (
        ${ids.privateOrg!}, 'Class season', now() - interval '1 day',
        now() + interval '1 day', 'ACTIVE', 'v2.0'
      )
    `;
    const command = {
      organizationId: ids.privateOrg!,
      targetUserId: ids.member!,
      type: 'BONUS' as const,
      amount: 15,
      affectsSeason: true,
      reason: 'Weekly challenge',
      idempotencyKey: 'weekly-challenge-1',
      actor: authUser(ids.teacher!),
    };
    const first = await adjustments.apply(command);
    const replay = await adjustments.apply(command);
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    const [result] = await connection<
      { wallet: string; score: string; transactions: number; audits: number }[]
    >`
      SELECT
        (SELECT balance::text FROM user_wallets WHERE user_id = ${ids.member!}) AS wallet,
        (SELECT score::text FROM season_user_totals WHERE user_id = ${ids.member!}) AS score,
        (SELECT count(*)::int FROM point_transactions WHERE user_id = ${ids.member!}) AS transactions,
        (SELECT count(*)::int FROM audit_logs WHERE action = 'POINT_BONUS') AS audits
    `;
    expect(result).toEqual({ wallet: '15.00', score: '15.00', transactions: 1, audits: 1 });
    await expect(
      adjustments.apply({ ...command, organizationId: ids.otherPrivateOrg! }),
    ).rejects.toThrow();
  });
});
