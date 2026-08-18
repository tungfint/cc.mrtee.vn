import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

const citext = customType<{ data: string }>({
  dataType() {
    return 'citext';
  },
});

export const userStatus = pgEnum('user_status', ['ACTIVE', 'INACTIVE', 'SUSPENDED']);
export const systemRole = pgEnum('system_role', ['USER', 'SYSTEM_ADMIN']);
export const organizationVisibility = pgEnum('organization_visibility', [
  'PUBLIC',
  'CLOSED',
  'PRIVATE',
]);
export const organizationStatus = pgEnum('organization_status', ['ACTIVE', 'INACTIVE']);
export const membershipRole = pgEnum('membership_role', ['MEMBER', 'TEACHER', 'ORG_ADMIN']);
export const membershipStatus = pgEnum('membership_status', ['ACTIVE', 'SUSPENDED', 'LEFT']);
export const verificationStatus = pgEnum('verification_status', [
  'UNVERIFIED',
  'TEACHER_VERIFIED',
  'ADMIN_VERIFIED',
]);
export const accountSyncStatus = pgEnum('account_sync_status', [
  'UNVERIFIED',
  'INITIALIZING',
  'READY',
  'QUEUED',
  'SYNCING',
  'ERROR',
  'INACTIVE',
]);
export const seasonStatus = pgEnum('season_status', ['DRAFT', 'ACTIVE', 'CLOSING', 'CLOSED']);
export const pointTransactionType = pgEnum('point_transaction_type', [
  'EARN',
  'BONUS',
  'REDEEM',
  'REFUND',
  'PENALTY',
  'REVERSAL',
  'ADJUSTMENT',
]);
export const rewardOrderStatus = pgEnum('reward_order_status', [
  'REQUESTED',
  'APPROVED',
  'FULFILLED',
  'REJECTED',
  'CANCELLED',
]);
export const seasonAwardType = pgEnum('season_award_type', [
  'TOP_SCORE',
  'MOST_IMPROVED',
  'MOST_CONSISTENT',
  'CHALLENGE',
  'CUSTOM',
]);

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    fullName: varchar('full_name', { length: 200 }).notNull(),
    displayName: varchar('display_name', { length: 100 }).notNull(),
    avatarUrl: text('avatar_url'),
    status: userStatus('status').default('ACTIVE').notNull(),
    systemRole: systemRole('system_role').default('USER').notNull(),
    timezone: varchar('timezone', { length: 100 }).default('Asia/Ho_Chi_Minh').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('users_status_idx').on(table.status)],
);

export const userCredentials = pgTable(
  'user_credentials',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'restrict' }),
    email: citext('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    failedLoginAttempts: integer('failed_login_attempts').default(0).notNull(),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    passwordUpdatedAt: timestamp('password_updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('user_credentials_email_unique').on(table.email),
    check('user_credentials_failed_login_attempts_check', sql`${table.failedLoginAttempts} >= 0`),
  ],
);

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    csrfTokenHash: varchar('csrf_token_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('auth_sessions_token_hash_unique').on(table.tokenHash),
    index('auth_sessions_user_expiry_idx').on(table.userId, table.expiresAt),
    index('auth_sessions_expiry_idx').on(table.expiresAt),
    check('auth_sessions_expiry_check', sql`${table.expiresAt} > ${table.createdAt}`),
  ],
);

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    parentOrganizationId: uuid('parent_organization_id').references(
      (): AnyPgColumn => organizations.id,
      { onDelete: 'restrict' },
    ),
    name: varchar('name', { length: 200 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull(),
    visibility: organizationVisibility('visibility').default('PRIVATE').notNull(),
    timezone: varchar('timezone', { length: 100 }).default('Asia/Ho_Chi_Minh').notNull(),
    status: organizationStatus('status').default('ACTIVE').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('organizations_slug_unique').on(table.slug),
    index('organizations_parent_idx').on(table.parentOrganizationId),
  ],
);

export const organizationMemberships = pgTable(
  'organization_memberships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    role: membershipRole('role').default('MEMBER').notNull(),
    status: membershipStatus('status').default('ACTIVE').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
    leftAt: timestamp('left_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('organization_memberships_one_active_unique')
      .on(table.organizationId, table.userId)
      .where(sql`${table.status} = 'ACTIVE'`),
    index('organization_memberships_user_org_idx').on(table.userId, table.organizationId),
    check(
      'organization_memberships_left_at_check',
      sql`(${table.status} = 'LEFT' AND ${table.leftAt} IS NOT NULL) OR (${table.status} <> 'LEFT' AND ${table.leftAt} IS NULL)`,
    ),
  ],
);

export const codeforcesAccounts = pgTable(
  'codeforces_accounts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    handle: citext('handle').notNull(),
    pendingHandle: citext('pending_handle'),
    currentRating: integer('current_rating'),
    maxRating: integer('max_rating'),
    rank: varchar('rank', { length: 50 }),
    maxRank: varchar('max_rank', { length: 50 }),
    verificationStatus: verificationStatus('verification_status').default('UNVERIFIED').notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    verifiedBy: uuid('verified_by').references((): AnyPgColumn => users.id, {
      onDelete: 'set null',
    }),
    rewardEligibleFrom: timestamp('reward_eligible_from', { withTimezone: true }),
    lastSeenSubmissionId: bigint('last_seen_submission_id', { mode: 'bigint' }),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    nextSyncAt: timestamp('next_sync_at', { withTimezone: true }),
    backfillCompletedAt: timestamp('backfill_completed_at', { withTimezone: true }),
    backfillNextFrom: integer('backfill_next_from').default(1),
    syncStatus: accountSyncStatus('sync_status').default('UNVERIFIED').notNull(),
    lastSyncError: text('last_sync_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('codeforces_accounts_user_unique').on(table.userId),
    uniqueIndex('codeforces_accounts_handle_unique').on(table.handle),
    uniqueIndex('codeforces_accounts_pending_handle_unique')
      .on(table.pendingHandle)
      .where(sql`${table.pendingHandle} IS NOT NULL`),
    index('codeforces_accounts_next_sync_idx')
      .on(table.nextSyncAt)
      .where(sql`${table.syncStatus} NOT IN ('UNVERIFIED', 'INACTIVE')`),
    check(
      'codeforces_accounts_verification_timestamps_check',
      sql`(${table.verificationStatus} = 'UNVERIFIED' AND ${table.verifiedAt} IS NULL AND ${table.rewardEligibleFrom} IS NULL) OR (${table.verificationStatus} <> 'UNVERIFIED' AND ${table.verifiedAt} IS NOT NULL AND ${table.rewardEligibleFrom} IS NOT NULL)`,
    ),
    check(
      'codeforces_accounts_backfill_cursor_check',
      sql`${table.backfillNextFrom} IS NULL OR ${table.backfillNextFrom} > 0`,
    ),
    check(
      'codeforces_accounts_rating_check',
      sql`(${table.currentRating} IS NULL OR ${table.currentRating} >= 0) AND (${table.maxRating} IS NULL OR ${table.maxRating} >= 0)`,
    ),
  ],
);

export const scoringPolicies = pgTable(
  'scoring_policies',
  {
    version: varchar('version', { length: 50 }).primaryKey(),
    levelDecay: numeric('level_decay', { precision: 8, scale: 7 }).notNull(),
    levelDenominator: numeric('level_denominator', { precision: 10, scale: 4 }).notNull(),
    defaultCcBase: numeric('default_cc_base', { precision: 10, scale: 2 }).notNull(),
    rewardMin: numeric('reward_min', { precision: 12, scale: 2 }).notNull(),
    rewardMax: numeric('reward_max', { precision: 12, scale: 2 }).notNull(),
    rewardMidpointDelta: numeric('reward_midpoint_delta', { precision: 10, scale: 2 }).notNull(),
    rewardScale: numeric('reward_scale', { precision: 10, scale: 2 }).notNull(),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('scoring_policies_decay_check', sql`${table.levelDecay} > 0 AND ${table.levelDecay} < 1`),
    check('scoring_policies_denominator_check', sql`${table.levelDenominator} > 0`),
    check(
      'scoring_policies_reward_bounds_check',
      sql`${table.rewardMin} > 0 AND ${table.rewardMax} >= ${table.rewardMin}`,
    ),
    check('scoring_policies_reward_scale_check', sql`${table.rewardScale} > 0`),
  ],
);

export const userSkillState = pgTable(
  'user_skill_state',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'restrict' }),
    ccBase: numeric('cc_base', { precision: 10, scale: 2 }).default('800.00').notNull(),
    ccCalculated: numeric('cc_calculated', { precision: 10, scale: 2 }).default('0.00').notNull(),
    ccLevel: numeric('cc_level', { precision: 10, scale: 2 }).default('800.00').notNull(),
    scoringPolicyVersion: varchar('scoring_policy_version', { length: 50 })
      .default('v2.0')
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: 'user_skill_state_policy_fk',
      columns: [table.scoringPolicyVersion],
      foreignColumns: [scoringPolicies.version],
    }).onDelete('restrict'),
  ],
);

export const cfProblems = pgTable(
  'cf_problems',
  {
    problemKey: varchar('problem_key', { length: 255 }).primaryKey(),
    contestId: bigint('contest_id', { mode: 'bigint' }),
    problemsetName: varchar('problemset_name', { length: 200 }),
    problemIndex: varchar('problem_index', { length: 20 }).notNull(),
    name: varchar('name', { length: 300 }).notNull(),
    type: varchar('type', { length: 50 }).notNull(),
    currentRating: integer('current_rating'),
    tags: text('tags')
      .array()
      .default(sql`ARRAY[]::text[]`)
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('cf_problems_contest_identity_unique')
      .on(table.contestId, table.problemIndex)
      .where(sql`${table.contestId} IS NOT NULL`),
    uniqueIndex('cf_problems_problemset_identity_unique')
      .on(table.problemsetName, table.problemIndex)
      .where(sql`${table.contestId} IS NULL AND ${table.problemsetName} IS NOT NULL`),
    check(
      'cf_problems_identity_check',
      sql`${table.contestId} IS NOT NULL OR ${table.problemsetName} IS NOT NULL`,
    ),
    check(
      'cf_problems_rating_check',
      sql`${table.currentRating} IS NULL OR ${table.currentRating} > 0`,
    ),
  ],
);

export const cfSubmissions = pgTable(
  'cf_submissions',
  {
    cfSubmissionId: bigint('cf_submission_id', { mode: 'bigint' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    problemKey: varchar('problem_key', { length: 255 })
      .notNull()
      .references(() => cfProblems.problemKey, { onDelete: 'restrict' }),
    creationTime: timestamp('creation_time', { withTimezone: true }).notNull(),
    verdict: varchar('verdict', { length: 50 }).notNull(),
    participantType: varchar('participant_type', { length: 50 }),
    isTeam: boolean('is_team').default(false).notNull(),
    programmingLanguage: varchar('programming_language', { length: 100 }),
    problemRatingObserved: integer('problem_rating_observed'),
    rawMetadata: jsonb('raw_metadata').$type<Record<string, unknown>>(),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('cf_submissions_identity_user_unique').on(table.cfSubmissionId, table.userId),
    unique('cf_submissions_identity_user_problem_unique').on(
      table.cfSubmissionId,
      table.userId,
      table.problemKey,
    ),
    index('cf_submissions_user_creation_idx').on(table.userId, table.creationTime.desc()),
    index('cf_submissions_user_id_idx').on(table.userId, table.cfSubmissionId.desc()),
  ],
);

export const userProblemSolves = pgTable(
  'user_problem_solves',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    problemKey: varchar('problem_key', { length: 255 })
      .notNull()
      .references(() => cfProblems.problemKey, { onDelete: 'restrict' }),
    firstOkSubmissionId: bigint('first_ok_submission_id', { mode: 'bigint' }).notNull(),
    firstSolvedAt: timestamp('first_solved_at', { withTimezone: true }).notNull(),
    ratingSnapshot: integer('rating_snapshot'),
    rewardEligible: boolean('reward_eligible').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.problemKey] }),
    foreignKey({
      name: 'user_problem_solves_first_submission_fk',
      columns: [table.firstOkSubmissionId, table.userId, table.problemKey],
      foreignColumns: [
        cfSubmissions.cfSubmissionId,
        cfSubmissions.userId,
        cfSubmissions.problemKey,
      ],
    }).onDelete('restrict'),
    index('user_problem_solves_user_time_idx').on(table.userId, table.firstSolvedAt.desc()),
  ],
);

export const seasons = pgTable(
  'seasons',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'restrict',
    }),
    name: varchar('name', { length: 200 }).notNull(),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    status: seasonStatus('status').default('DRAFT').notNull(),
    scoringPolicyVersion: varchar('scoring_policy_version', { length: 50 })
      .notNull()
      .references(() => scoringPolicies.version, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('seasons_organization_time_idx').on(table.organizationId, table.startAt, table.endAt),
    check('seasons_time_range_check', sql`${table.endAt} > ${table.startAt}`),
  ],
);

export const seasonUserTotals = pgTable(
  'season_user_totals',
  {
    seasonId: uuid('season_id')
      .notNull()
      .references(() => seasons.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    earned: numeric('earned', { precision: 12, scale: 2 }).default('0.00').notNull(),
    bonus: numeric('bonus', { precision: 12, scale: 2 }).default('0.00').notNull(),
    penalty: numeric('penalty', { precision: 12, scale: 2 }).default('0.00').notNull(),
    score: numeric('score', { precision: 12, scale: 2 }).default('0.00').notNull(),
    qualifyingSolves: integer('qualifying_solves').default(0).notNull(),
    reachedScoreAt: timestamp('reached_score_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.seasonId, table.userId] }),
    index('season_user_totals_leaderboard_idx').on(table.seasonId, table.score.desc()),
    check('season_user_totals_qualifying_solves_check', sql`${table.qualifyingSolves} >= 0`),
  ],
);

export const seasonUserSnapshots = pgTable(
  'season_user_snapshots',
  {
    seasonId: uuid('season_id')
      .notNull()
      .references(() => seasons.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    ccLevelStart: numeric('cc_level_start', { precision: 10, scale: 2 }).notNull(),
    ccLevelEnd: numeric('cc_level_end', { precision: 10, scale: 2 }).notNull(),
    ccLevelGrowth: numeric('cc_level_growth', { precision: 10, scale: 2 }).notNull(),
    seasonScore: numeric('season_score', { precision: 12, scale: 2 }).notNull(),
    qualifyingSolves: integer('qualifying_solves').notNull(),
    activeDays: integer('active_days').notNull(),
    longestStreak: integer('longest_streak').notNull(),
    maxChallengeDelta: numeric('max_challenge_delta', { precision: 10, scale: 2 }),
    finalRank: integer('final_rank'),
    closedAt: timestamp('closed_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.seasonId, table.userId] }),
    check(
      'season_user_snapshots_counts_check',
      sql`${table.qualifyingSolves} >= 0 AND ${table.activeDays} >= 0 AND ${table.longestStreak} >= 0`,
    ),
    check(
      'season_user_snapshots_rank_check',
      sql`${table.finalRank} IS NULL OR ${table.finalRank} > 0`,
    ),
  ],
);

export const rewards = pgTable(
  'rewards',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description').notNull(),
    cost: numeric('cost', { precision: 12, scale: 2 }).notNull(),
    stock: integer('stock'),
    active: boolean('active').default(true).notNull(),
    imageUrl: text('image_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('rewards_active_idx').on(table.active),
    check('rewards_cost_check', sql`${table.cost} > 0`),
    check('rewards_stock_check', sql`${table.stock} IS NULL OR ${table.stock} >= 0`),
  ],
);

export const rewardOrders = pgTable(
  'reward_orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    rewardId: uuid('reward_id')
      .notNull()
      .references(() => rewards.id, { onDelete: 'restrict' }),
    costSnapshot: numeric('cost_snapshot', { precision: 12, scale: 2 }).notNull(),
    status: rewardOrderStatus('status').default('REQUESTED').notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 200 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    note: text('note'),
  },
  (table) => [
    unique('reward_orders_identity_user_unique').on(table.id, table.userId),
    uniqueIndex('reward_orders_idempotency_key_unique').on(table.idempotencyKey),
    index('reward_orders_user_created_idx').on(table.userId, table.createdAt.desc()),
    check('reward_orders_cost_snapshot_check', sql`${table.costSnapshot} > 0`),
  ],
);

export const pointTransactions = pgTable(
  'point_transactions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    type: pointTransactionType('type').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    seasonId: uuid('season_id').references(() => seasons.id, { onDelete: 'restrict' }),
    sourceSubmissionId: bigint('source_submission_id', { mode: 'bigint' }),
    sourceRewardOrderId: uuid('source_reward_order_id'),
    relatedTransactionId: uuid('related_transaction_id'),
    idempotencyKey: varchar('idempotency_key', { length: 200 }),
    affectsWallet: boolean('affects_wallet').default(true).notNull(),
    affectsSeason: boolean('affects_season').default(false).notNull(),
    ccLevelBefore: numeric('cc_level_before', { precision: 10, scale: 2 }),
    problemRatingSnapshot: integer('problem_rating_snapshot'),
    scoringPolicyVersion: varchar('scoring_policy_version', { length: 50 }),
    description: text('description'),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    eventAt: timestamp('event_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: 'point_tx_source_submission_fk',
      columns: [table.sourceSubmissionId, table.userId],
      foreignColumns: [cfSubmissions.cfSubmissionId, cfSubmissions.userId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'point_tx_source_reward_order_fk',
      columns: [table.sourceRewardOrderId, table.userId],
      foreignColumns: [rewardOrders.id, rewardOrders.userId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'point_tx_related_transaction_fk',
      columns: [table.relatedTransactionId],
      foreignColumns: [table.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'point_tx_scoring_policy_fk',
      columns: [table.scoringPolicyVersion],
      foreignColumns: [scoringPolicies.version],
    }).onDelete('restrict'),
    uniqueIndex('point_transactions_idempotency_key_unique')
      .on(table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
    uniqueIndex('point_transactions_earn_submission_unique')
      .on(table.sourceSubmissionId)
      .where(sql`${table.type} = 'EARN'`),
    uniqueIndex('point_transactions_reversal_target_unique')
      .on(table.relatedTransactionId)
      .where(sql`${table.type} = 'REVERSAL'`),
    uniqueIndex('point_transactions_refund_target_unique')
      .on(table.relatedTransactionId)
      .where(sql`${table.type} = 'REFUND'`),
    index('point_transactions_user_created_idx').on(table.userId, table.createdAt.desc()),
    index('point_transactions_season_user_created_idx').on(
      table.seasonId,
      table.userId,
      table.createdAt,
    ),
    check('point_transactions_amount_check', sql`${table.amount} <> 0`),
    check(
      'point_transactions_earn_source_check',
      sql`${table.type} <> 'EARN' OR (${table.sourceSubmissionId} IS NOT NULL AND ${table.scoringPolicyVersion} IS NOT NULL AND ${table.ccLevelBefore} IS NOT NULL AND ${table.problemRatingSnapshot} IS NOT NULL)`,
    ),
    check(
      'point_transactions_correction_link_check',
      sql`${table.type} NOT IN ('REVERSAL', 'REFUND') OR ${table.relatedTransactionId} IS NOT NULL`,
    ),
    check(
      'point_transactions_season_link_check',
      sql`${table.affectsSeason} = false OR ${table.seasonId} IS NOT NULL`,
    ),
    check(
      'point_transactions_adjustment_idempotency_check',
      sql`${table.type} <> 'ADJUSTMENT' OR ${table.idempotencyKey} IS NOT NULL`,
    ),
    check(
      'point_transactions_not_self_related_check',
      sql`${table.relatedTransactionId} IS NULL OR ${table.relatedTransactionId} <> ${table.id}`,
    ),
  ],
);

export const userWallets = pgTable('user_wallets', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'restrict' }),
  balance: numeric('balance', { precision: 12, scale: 2 }).default('0.00').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const seasonAwards = pgTable(
  'season_awards',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    seasonId: uuid('season_id')
      .notNull()
      .references(() => seasons.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    awardType: seasonAwardType('award_type').notNull(),
    rank: integer('rank'),
    title: varchar('title', { length: 200 }).notNull(),
    rewardDescription: text('reward_description'),
    awardedAt: timestamp('awarded_at', { withTimezone: true }).defaultNow().notNull(),
    awardedBy: uuid('awarded_by').references(() => users.id, { onDelete: 'set null' }),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
  },
  (table) => [
    uniqueIndex('season_awards_identity_unique').on(
      table.seasonId,
      table.userId,
      table.awardType,
      table.title,
    ),
    index('season_awards_season_type_idx').on(table.seasonId, table.awardType),
    check('season_awards_rank_check', sql`${table.rank} IS NULL OR ${table.rank} > 0`),
  ],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: varchar('action', { length: 100 }).notNull(),
    entityType: varchar('entity_type', { length: 100 }).notNull(),
    entityId: varchar('entity_id', { length: 255 }).notNull(),
    before: jsonb('before').$type<Record<string, unknown>>(),
    after: jsonb('after').$type<Record<string, unknown>>(),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('audit_logs_entity_idx').on(table.entityType, table.entityId, table.createdAt),
    index('audit_logs_actor_idx').on(table.actorUserId, table.createdAt),
  ],
);
