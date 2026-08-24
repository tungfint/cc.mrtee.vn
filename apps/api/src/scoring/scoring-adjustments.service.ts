import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { AuthorizationService } from '../authorization/authorization.service';
import { DatabaseService } from '../database/database.service';
import { NotificationsService } from '../notifications/notifications.service';

export type ManualPointType = 'BONUS' | 'PENALTY' | 'ADJUSTMENT';
export type ManualPointTarget = 'CC_POINT' | 'CC_BALANCE' | 'BOTH';

export interface PointTransactionRecord {
  id: string;
  type: ManualPointType;
  amount: string;
  [key: string]: unknown;
}

@Injectable()
export class ScoringAdjustmentsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly authorization: AuthorizationService,
    private readonly notifications: NotificationsService,
  ) {}

  async apply(input: {
    organizationId?: string;
    targetUserId: string;
    type: ManualPointType;
    amount: number;
    target?: ManualPointTarget;
    affectsSeason: boolean;
    reason: string;
    idempotencyKey: string;
    actor: AuthUser;
  }) {
    const isSuperAdmin = input.actor.systemRole === 'SYSTEM_ADMIN';
    const organizationId = input.organizationId;
    if (!organizationId && !isSuperAdmin) {
      throw new BadRequestException('Cần chọn lớp học để điều chỉnh điểm');
    }
    if (organizationId) {
      const access = await this.authorization.organizationAccess(organizationId, input.actor);
      this.authorization.assertCanTeach(access, input.actor);
    }
    const [target] = await this.database.sql`
      SELECT id FROM users WHERE id = ${input.targetUserId} AND status = 'ACTIVE'
    `;
    if (!target) throw new BadRequestException('Không tìm thấy tài khoản đang hoạt động');
    const membershipRows = organizationId
      ? await this.database.sql<{ id: string }[]>`
          SELECT id FROM organization_memberships
          WHERE organization_id = ${organizationId} AND user_id = ${input.targetUserId}
            AND status = 'ACTIVE'
        `
      : [];
    const membership = membershipRows[0];
    if (!membership && !isSuperAdmin) {
      throw new BadRequestException('Người dùng không thuộc tổ chức');
    }
    if (input.type === 'BONUS' && input.amount <= 0) {
      throw new BadRequestException('BONUS phải là số dương');
    }
    if (input.type === 'PENALTY' && input.amount >= 0) {
      throw new BadRequestException('PENALTY phải là số âm');
    }
    if (input.amount === 0) throw new BadRequestException('Số điểm thay đổi phải khác 0');

    const organizationScope = organizationId ?? 'GLOBAL';
    const targetMetric = input.target ?? 'BOTH';
    const affectsPoint = targetMetric !== 'CC_BALANCE';
    const affectsWallet = targetMetric !== 'CC_POINT';
    const affectsOrganizationSeason = input.affectsSeason && affectsPoint && Boolean(membership);
    const key = `manual:${organizationScope}:${input.targetUserId}:${input.idempotencyKey}`;
    return this.database.sql.begin(async (transaction) => {
      await transaction`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
      const [existing] = await transaction<PointTransactionRecord[]>`
        SELECT * FROM point_transactions WHERE idempotency_key = ${key}
      `;
      if (existing) {
        if (existing.type !== input.type || Number(existing.amount) !== input.amount) {
          throw new ConflictException('Khóa idempotency đã được dùng với nội dung khác');
        }
        return { transaction: existing, replayed: true };
      }
      const seasonRows =
        affectsOrganizationSeason && organizationId
          ? await transaction<{ id: string }[]>`
            SELECT id FROM seasons
            WHERE organization_id = ${organizationId}
              AND status IN ('ACTIVE', 'CLOSING')
              AND start_at <= now() AND end_at > now()
            ORDER BY start_at DESC LIMIT 1
          `
          : [];
      const season = seasonRows[0];
      const [pointTransaction] = await transaction<PointTransactionRecord[]>`
        INSERT INTO point_transactions (
          user_id, type, amount, season_id, idempotency_key, affects_wallet,
          affects_point, affects_season, description, metadata, event_at
        ) VALUES (
          ${input.targetUserId}, ${input.type}, ${input.amount}, ${season?.id ?? null},
          ${key}, ${affectsWallet}, ${affectsPoint}, ${Boolean(season)}, ${input.reason},
          jsonb_strip_nulls(jsonb_build_object(
            'organizationId', ${organizationId ?? null}::text,
            'actorUserId', ${input.actor.userId}::text,
            'scope', ${membership ? 'ORGANIZATION' : 'GLOBAL'}::text,
            'targetMetric', ${targetMetric}::text
          )),
          now()
        ) RETURNING *
      `;
      if (affectsWallet) {
        await transaction`
          INSERT INTO user_wallets (user_id, balance)
          VALUES (${input.targetUserId}, ${input.amount})
          ON CONFLICT (user_id) DO UPDATE SET
            balance = user_wallets.balance + EXCLUDED.balance, updated_at = now()
        `;
      }
      if (season) {
        const bonus = input.type === 'BONUS' ? input.amount : 0;
        const penalty = input.type === 'PENALTY' ? input.amount : 0;
        await transaction`
          INSERT INTO season_user_totals (
            season_id, user_id, bonus, penalty, score, reached_score_at
          ) VALUES (
            ${season.id}, ${input.targetUserId}, ${bonus}, ${penalty}, ${input.amount}, now()
          ) ON CONFLICT (season_id, user_id) DO UPDATE SET
            bonus = season_user_totals.bonus + EXCLUDED.bonus,
            penalty = season_user_totals.penalty + EXCLUDED.penalty,
            score = season_user_totals.score + EXCLUDED.score,
            reached_score_at = now(), updated_at = now()
        `;
      }
      await transaction`
        INSERT INTO audit_logs (
          actor_user_id, action, entity_type, entity_id, after, reason
        ) VALUES (
          ${input.actor.userId}, ${`POINT_${input.type}`}, 'point_transaction',
          ${String(pointTransaction?.id)}, ${JSON.stringify(pointTransaction)}::jsonb, ${input.reason}
        )
      `;
      const metricLabel =
        targetMetric === 'CC_POINT'
          ? 'CC Point'
          : targetMetric === 'CC_BALANCE'
            ? 'CC Balance'
            : 'CC Point và CC Balance';
      await this.notifications.createForUser(transaction, {
        userId: input.targetUserId,
        title: `${input.amount > 0 ? 'Được cộng' : 'Bị trừ'} ${metricLabel}`,
        body: `${input.amount > 0 ? '+' : ''}${input.amount} ${metricLabel}. Lý do: ${input.reason}`,
        createdBy: input.actor.userId,
      });
      return { transaction: pointTransaction, replayed: false };
    });
  }
}
