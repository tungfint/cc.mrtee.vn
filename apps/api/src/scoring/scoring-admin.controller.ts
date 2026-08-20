import { BadRequestException, Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { AuthorizationService } from '../authorization/authorization.service';
import { DatabaseService } from '../database/database.service';
import { ScoringAdjustmentsService } from './scoring-adjustments.service';

const pointSchema = z.object({
  organizationId: z.string().uuid(),
  type: z.enum(['BONUS', 'PENALTY', 'ADJUSTMENT']),
  amount: z.coerce.number().min(-1_000_000).max(1_000_000),
  affectsSeason: z.boolean().default(true),
  reason: z.string().trim().min(3).max(500),
  idempotencyKey: z.string().trim().min(8).max(120),
});
const riskReviewSchema = z.object({
  organizationId: z.string().uuid().optional(),
  resolution: z.enum(['VALID', 'MONITORING', 'VIOLATION']),
  note: z.string().trim().min(3).max(1000),
});

@Controller('admin/users')
export class ScoringAdminController {
  constructor(
    private readonly database: DatabaseService,
    private readonly authorization: AuthorizationService,
    private readonly adjustments: ScoringAdjustmentsService,
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
    return this.adjustments.apply({ targetUserId: userId.data, actor, ...input.data });
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
        SELECT activity_risk_score, activity_risk_level FROM users
        WHERE id = ${userId.data} FOR UPDATE
      `;
      if (!before) throw new BadRequestException('Không tìm thấy tài khoản');
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
      return { risk: after };
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
