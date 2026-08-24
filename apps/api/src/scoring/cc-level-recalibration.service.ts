import { BadRequestException, Injectable } from '@nestjs/common';
import { calculateCcLevelReference } from '@cc/core';
import type { AuthUser } from '../auth/auth.types';
import { AuthorizationService } from '../authorization/authorization.service';
import { DatabaseService } from '../database/database.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LevelRankAwardsService } from './level-rank-awards.service';

export type RecalibrationScope = 'USER' | 'ORGANIZATION' | 'ALL';

interface RecalibrationInput {
  scope: RecalibrationScope;
  targetUserId?: string | undefined;
  organizationId?: string | undefined;
}

@Injectable()
export class CcLevelRecalibrationService {
  constructor(
    private readonly database: DatabaseService,
    private readonly authorization: AuthorizationService,
    private readonly notifications: NotificationsService,
    private readonly rankAwards: LevelRankAwardsService,
  ) {}

  async preview(input: RecalibrationInput, actor: AuthUser) {
    const userIds = await this.resolveUserIds(input, actor);
    const rows = [];
    for (const userId of userIds) rows.push(await this.calculate(this.database.sql, userId));
    return {
      scope: input.scope,
      minimumValidSolves: 5,
      maximumRecentSolves: 10,
      rows,
      summary: {
        total: rows.length,
        eligible: rows.filter((row) => row.eligible).length,
        increases: rows.filter((row) => row.change > 0).length,
        insufficient: rows.filter((row) => !row.eligible).length,
      },
    };
  }

  async apply(input: RecalibrationInput & { reason: string }, actor: AuthUser) {
    const userIds = await this.resolveUserIds(input, actor);
    const results = [];
    for (const userId of userIds) {
      results.push(
        await this.database.sql.begin(async (transaction) => {
          await transaction`SELECT pg_advisory_xact_lock(hashtextextended(${`cc-level:${userId}`}, 0))`;
          const row = await this.calculate(transaction, userId, true);
          if (!row.eligible || row.change <= 0) return { ...row, updated: false, awards: [] };
          const [after] = await transaction<{ cc_level: string }[]>`
            UPDATE user_skill_state SET cc_calculated = ${row.referenceLevel},
              cc_mastery_bonus = 0, cc_level = ${row.referenceLevel}, updated_at = now()
            WHERE user_id = ${userId}
            RETURNING cc_level::text
          `;
          if (!after) throw new BadRequestException('Không tìm thấy trạng thái CC Level');
          const awards = await this.rankAwards.awardCrossedRanks(transaction, {
            userId,
            levelBefore: row.currentLevel,
            levelAfter: row.referenceLevel,
            source: 'RECALIBRATION',
            actorUserId: actor.userId,
          });
          await this.notifications.createForUser(transaction, {
            userId,
            title: 'CC Level của bạn đã được hiệu chỉnh',
            body: `CC Level được cập nhật từ ${Math.round(row.currentLevel)} lên ${Math.round(row.referenceLevel)} dựa trên ${row.solveCount} bài rated hợp lệ gần nhất. Lý do: ${input.reason}`,
            createdBy: actor.userId,
          });
          await transaction`
            INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, before, after, reason)
            VALUES (${actor.userId}, 'CC_LEVEL_RECALIBRATED', 'user', ${userId},
              ${JSON.stringify({ ccLevel: row.currentLevel })}::jsonb,
              ${JSON.stringify({
                ccLevel: row.referenceLevel,
                percentile70: row.percentile70,
                ratings: row.ratings,
                awards,
              })}::jsonb,
              ${input.reason})
          `;
          return { ...row, updated: true, awards };
        }),
      );
    }
    return {
      total: results.length,
      updated: results.filter((row) => row.updated).length,
      skipped: results.filter((row) => !row.updated).length,
      results,
    };
  }

  private async calculate(
    sql: DatabaseService['sql'] | import('postgres').TransactionSql,
    userId: string,
    lock = false,
  ) {
    const [user] = await sql<
      { id: string; display_name: string; cc_level: string; codeforces_handle: string | null }[]
    >`
      SELECT users.id, users.display_name, COALESCE(skill.cc_level, 800)::text AS cc_level,
        accounts.handle AS codeforces_handle
      FROM users
      LEFT JOIN user_skill_state AS skill ON skill.user_id = users.id
      LEFT JOIN codeforces_accounts AS accounts ON accounts.user_id = users.id
      WHERE users.id = ${userId} AND users.status = 'ACTIVE'
      ${lock ? this.database.sql`FOR UPDATE OF users` : this.database.sql``}
    `;
    if (!user) throw new BadRequestException('Không tìm thấy tài khoản đang hoạt động');
    const solves = await sql<
      {
        problem_key: string;
        rating_snapshot: number;
        first_solved_at: Date;
        first_ok_submission_id: string;
      }[]
    >`
      SELECT problem_key, rating_snapshot, first_solved_at, first_ok_submission_id
      FROM user_problem_solves
      WHERE user_id = ${userId} AND rating_snapshot IS NOT NULL
      ORDER BY first_solved_at DESC, first_ok_submission_id DESC
      LIMIT 10
    `;
    const reference = calculateCcLevelReference(
      solves.map((solve) => ({
        problemKey: solve.problem_key,
        rating: Number(solve.rating_snapshot),
        solvedAt: solve.first_solved_at,
        submissionId: solve.first_ok_submission_id,
      })),
    );
    const currentLevel = Number(user.cc_level);
    const nextLevel = reference.eligible
      ? Math.max(currentLevel, reference.referenceLevel)
      : currentLevel;
    return {
      userId: user.id,
      displayName: user.display_name,
      codeforcesHandle: user.codeforces_handle,
      currentLevel,
      solveCount: reference.solveCount,
      ratings: reference.ratings,
      percentile70: reference.percentile70,
      referenceLevel: reference.referenceLevel,
      nextLevel,
      change: Math.max(0, nextLevel - currentLevel),
      eligible: reference.eligible,
      confidence:
        reference.solveCount >= 8
          ? 'RELIABLE'
          : reference.solveCount >= 5
            ? 'FAIR'
            : 'INSUFFICIENT',
    };
  }

  private async resolveUserIds(input: RecalibrationInput, actor: AuthUser) {
    if (input.scope === 'USER') {
      if (!input.targetUserId) throw new BadRequestException('Chọn tài khoản cần hiệu chỉnh');
      if (actor.systemRole === 'ADMIN') {
        const [target] = await this.database.sql<{ system_role: string }[]>`
          SELECT system_role FROM users WHERE id = ${input.targetUserId}
        `;
        if (!target || target.system_role !== 'USER') {
          throw new BadRequestException('Admin chỉ được hiệu chỉnh tài khoản học sinh');
        }
      }
      if (actor.systemRole === 'USER') {
        if (!input.organizationId) throw new BadRequestException('Giáo viên cần chọn lớp');
        const access = await this.authorization.organizationAccess(input.organizationId, actor);
        this.authorization.assertCanTeach(access, actor);
        const [member] = await this.database.sql`
          SELECT id FROM organization_memberships WHERE organization_id = ${input.organizationId}
            AND user_id = ${input.targetUserId} AND status = 'ACTIVE'
        `;
        if (!member) throw new BadRequestException('Tài khoản không thuộc lớp đã chọn');
      }
      return [input.targetUserId];
    }
    if (input.scope === 'ORGANIZATION') {
      if (!input.organizationId) throw new BadRequestException('Chọn lớp cần hiệu chỉnh');
      const access = await this.authorization.organizationAccess(input.organizationId, actor);
      this.authorization.assertCanTeach(access, actor);
      const rows = await this.database.sql<{ user_id: string }[]>`
        SELECT memberships.user_id FROM organization_memberships AS memberships
        JOIN users ON users.id = memberships.user_id
        WHERE memberships.organization_id = ${input.organizationId}
          AND memberships.status = 'ACTIVE' AND users.status = 'ACTIVE'
          AND (${actor.systemRole === 'SYSTEM_ADMIN'} OR users.system_role = 'USER')
        ORDER BY memberships.joined_at LIMIT 1000
      `;
      return rows.map((row) => row.user_id);
    }
    if (actor.systemRole === 'USER') {
      throw new BadRequestException('Chỉ Admin/S-Admin được hiệu chỉnh toàn hệ thống');
    }
    const rows = await this.database.sql<{ id: string }[]>`
      SELECT id FROM users
      WHERE status = 'ACTIVE'
        AND (${actor.systemRole === 'SYSTEM_ADMIN'} OR system_role = 'USER')
      ORDER BY created_at LIMIT 5000
    `;
    return rows.map((row) => row.id);
  }
}
