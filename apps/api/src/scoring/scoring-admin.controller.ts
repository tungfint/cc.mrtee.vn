import { BadRequestException, Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, RequireSystemRole } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { AuthorizationService } from '../authorization/authorization.service';
import { DatabaseService } from '../database/database.service';
import { ScoringAdjustmentsService } from './scoring-adjustments.service';
import { NotificationsService } from '../notifications/notifications.service';

const pointSchema = z.object({
  organizationId: z.string().uuid().optional(),
  type: z.enum(['BONUS', 'PENALTY', 'ADJUSTMENT']),
  amount: z.coerce.number().min(-1_000_000).max(1_000_000),
  target: z.enum(['CC_POINT', 'CC_BALANCE', 'BOTH']).default('BOTH'),
  affectsSeason: z.boolean().default(true),
  reason: z.string().trim().min(3).max(500),
  idempotencyKey: z.string().trim().min(8).max(120),
});
const riskReviewSchema = z.object({
  organizationId: z.string().uuid().optional(),
  resolution: z.enum(['VALID', 'MONITORING', 'VIOLATION']),
  note: z.string().trim().min(3).max(1000),
});
const bulkRiskReviewSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(500),
  note: z.string().trim().min(3).max(1000),
});

@Controller('admin/users')
export class ScoringAdminController {
  constructor(
    private readonly database: DatabaseService,
    private readonly authorization: AuthorizationService,
    private readonly adjustments: ScoringAdjustmentsService,
    private readonly notifications: NotificationsService,
  ) {}

  @Post(':id/points')
  adjustPoints(
    @Param('id') userIdInput: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthUser,
  ) {
    const userId = z.string().uuid().safeParse(userIdInput);
    const input = pointSchema.safeParse(body);
    if (!userId.success || !input.success) {
      throw new BadRequestException('Dữ liệu không hợp lệ');
    }
    return this.adjustments.apply({
      targetUserId: userId.data,
      actor,
      type: input.data.type,
      amount: input.data.amount,
      target: input.data.target,
      affectsSeason: input.data.affectsSeason,
      reason: input.data.reason,
      idempotencyKey: input.data.idempotencyKey,
      ...(input.data.organizationId ? { organizationId: input.data.organizationId } : {}),
    });
  }

  @Post(':id/activity-risk/review')
  async reviewActivityRisk(
    @Param('id') userIdInput: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthUser,
  ) {
    const userId = z.string().uuid().safeParse(userIdInput);
    const input = riskReviewSchema.safeParse(body);
    if (!userId.success || !input.success) {
      throw new BadRequestException('Dữ liệu đánh giá cảnh báo không hợp lệ');
    }
    if (actor.systemRole === 'USER') {
      if (!input.data.organizationId) {
        throw new BadRequestException('Giáo viên cần chọn lớp để xử lý cảnh báo');
      }
      const access = await this.authorization.organizationAccess(input.data.organizationId, actor);
      this.authorization.assertCanTeach(access, actor);
      const [member] = await this.database.sql`
        SELECT id FROM organization_memberships
        WHERE organization_id = ${input.data.organizationId} AND user_id = ${userId.data}
          AND status = 'ACTIVE'
      `;
      if (!member) throw new BadRequestException('Học sinh không thuộc lớp đã chọn');
    }

    return this.database.sql.begin(async (transaction) => {
      const [before] = await transaction`
        SELECT activity_risk_score, activity_risk_level, system_role FROM users
        WHERE id = ${userId.data} FOR UPDATE
      `;
      if (!before) throw new BadRequestException('Không tìm thấy tài khoản');
      if (actor.systemRole === 'ADMIN' && before.system_role !== 'USER') {
        throw new BadRequestException('Admin chỉ được xác nhận cảnh báo của học sinh');
      }
      await transaction`
        UPDATE activity_risk_events SET reviewed_at = now(), reviewed_by = ${actor.userId},
          resolution = ${input.data.resolution}, review_note = ${input.data.note}
        WHERE user_id = ${userId.data} AND resolution IS NULL
      `;
      const score = input.data.resolution === 'VALID' ? 0 : Number(before.activity_risk_score);
      const level =
        input.data.resolution === 'VALID'
          ? 'NORMAL'
          : input.data.resolution === 'VIOLATION'
            ? 'PRIORITY'
            : String(before.activity_risk_level);
      const [after] = await transaction`
        UPDATE users SET activity_risk_score = ${score}, activity_risk_level = ${level},
          activity_risk_reviewed_at = now(), activity_risk_reviewed_by = ${actor.userId},
          updated_at = now()
        WHERE id = ${userId.data}
        RETURNING activity_risk_score, activity_risk_level, activity_risk_reviewed_at
      `;
      await transaction`
        INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, before, after, reason)
        VALUES (${actor.userId}, 'ACTIVITY_RISK_REVIEWED', 'user', ${userId.data},
          ${JSON.stringify(before)}::jsonb, ${JSON.stringify(after)}::jsonb, ${input.data.note})
      `;
      await this.notifications.createForUser(transaction, {
        userId: userId.data,
        title: 'Cảnh báo hoạt động đã được cập nhật',
        body:
          input.data.resolution === 'VALID'
            ? `Hoạt động của bạn đã được Admin/GV kiểm tra và xác nhận hợp lệ. Ghi chú: ${input.data.note}`
            : `Admin/GV đã cập nhật cảnh báo hoạt động thành ${input.data.resolution}. Ghi chú: ${input.data.note}`,
        createdBy: actor.userId,
      });
      return { risk: after };
    });
  }

  @RequireSystemRole('ADMIN', 'SYSTEM_ADMIN')
  @Post('activity-risk/review-all')
  async reviewAllActivityRisk(@Body() body: unknown, @CurrentUser() actor: AuthUser) {
    const input = bulkRiskReviewSchema.safeParse(body);
    if (!input.success) throw new BadRequestException('Danh sách cảnh báo không hợp lệ');
    return this.database.sql.begin(async (transaction) => {
      const targets = await transaction<{ id: string; display_name: string }[]>`
        SELECT id, display_name FROM users
        WHERE id = ANY(${input.data.userIds}::uuid[]) AND activity_risk_level <> 'NORMAL'
          AND (${actor.systemRole === 'SYSTEM_ADMIN'} OR system_role = 'USER')
        FOR UPDATE
      `;
      if (!targets.length) throw new BadRequestException('Không có cảnh báo phù hợp để xác nhận');
      const targetIds = targets.map((target) => target.id);
      await transaction`
        UPDATE activity_risk_events SET reviewed_at = now(), reviewed_by = ${actor.userId},
          resolution = 'VALID', review_note = ${input.data.note}
        WHERE user_id = ANY(${targetIds}::uuid[]) AND resolution IS NULL
      `;
      await transaction`
        UPDATE users SET activity_risk_score = 0, activity_risk_level = 'NORMAL',
          activity_risk_reviewed_at = now(), activity_risk_reviewed_by = ${actor.userId},
          updated_at = now()
        WHERE id = ANY(${targetIds}::uuid[])
      `;
      for (const target of targets) {
        await this.notifications.createForUser(transaction, {
          userId: target.id,
          title: 'Tài khoản đã được xác nhận hoạt động hợp lệ',
          body: `Admin đã kiểm tra và xác nhận toàn bộ cảnh báo hiện tại là hợp lệ. Ghi chú: ${input.data.note}`,
          createdBy: actor.userId,
        });
      }
      await transaction`
        INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, after, reason)
        VALUES (${actor.userId}, 'ACTIVITY_RISK_BULK_VALIDATED', 'users', 'bulk',
          ${JSON.stringify({ userIds: targetIds, count: targetIds.length })}::jsonb,
          ${input.data.note})
      `;
      return { requested: input.data.userIds.length, validated: targetIds.length };
    });
  }

  @Get('organization/:organizationId/audit-logs')
  async auditLogs(
    @Param('organizationId') organizationIdInput: string,
    @Query('limit') limitInput: string | undefined,
    @CurrentUser() actor: AuthUser,
  ) {
    const organizationId = z.string().uuid().safeParse(organizationIdInput);
    const limit = z.coerce.number().int().min(1).max(100).default(50).safeParse(limitInput);
    if (!organizationId.success || !limit.success) {
      throw new BadRequestException('Dữ liệu không hợp lệ');
    }
    if (actor.systemRole === 'USER') {
      const access = await this.authorization.organizationAccess(organizationId.data, actor);
      this.authorization.assertCanTeach(access, actor);
    }
    const scope =
      actor.systemRole !== 'USER'
        ? this.database.sql``
        : this.database.sql`
          WHERE logs.entity_id = ${organizationId.data}
            OR logs.after->>'organizationId' = ${organizationId.data}
            OR logs.after->>'organization_id' = ${organizationId.data}
            OR logs.before->>'organization_id' = ${organizationId.data}
            OR EXISTS (
              SELECT 1 FROM organization_memberships AS memberships
              WHERE memberships.organization_id = ${organizationId.data}
                AND (memberships.id::text = logs.entity_id OR memberships.user_id::text = logs.entity_id)
            )
        `;
    const logs = await this.database.sql`
      SELECT logs.id, logs.actor_user_id, actors.display_name AS actor_name, logs.action,
        logs.entity_type, logs.entity_id, logs.before, logs.after, logs.reason, logs.created_at
      FROM audit_logs AS logs
      LEFT JOIN users AS actors ON actors.id = logs.actor_user_id
      ${scope}
      ORDER BY logs.created_at DESC LIMIT ${limit.data}
    `;
    return { logs };
  }
}
