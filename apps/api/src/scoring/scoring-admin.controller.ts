import { BadRequestException, Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { AuthorizationService } from '../authorization/authorization.service';
import { DatabaseService } from '../database/database.service';
import { ScoringAdjustmentsService } from './scoring-adjustments.service';

const schema = z.object({
  organizationId: z.string().uuid(),
  ccBase: z.coerce.number().min(0).max(10_000),
  reason: z.string().trim().min(3).max(500),
});
const pointSchema = z.object({
  organizationId: z.string().uuid(),
  type: z.enum(['BONUS', 'PENALTY', 'ADJUSTMENT']),
  amount: z.coerce.number().min(-1_000_000).max(1_000_000),
  affectsSeason: z.boolean().default(true),
  reason: z.string().trim().min(3).max(500),
  idempotencyKey: z.string().trim().min(8).max(120),
});

@Controller('admin/users')
export class ScoringAdminController {
  constructor(
    private readonly database: DatabaseService,
    private readonly authorization: AuthorizationService,
    private readonly adjustments: ScoringAdjustmentsService,
  ) {}

  @Post(':id/recalibrate-base')
  async recalibrate(
    @Param('id') userIdInput: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthUser,
  ) {
    const userId = z.string().uuid().safeParse(userIdInput);
    const input = schema.safeParse(body);
    if (!userId.success || !input.success) throw new BadRequestException('Dữ liệu không hợp lệ');
    const access = await this.authorization.organizationAccess(input.data.organizationId, actor);
    this.authorization.assertCanTeach(access, actor);
    if (actor.systemRole !== 'SYSTEM_ADMIN') {
      const [membership] = await this.database.sql`
        SELECT id FROM organization_memberships
        WHERE organization_id = ${input.data.organizationId}
          AND user_id = ${userId.data}
          AND status = 'ACTIVE'
      `;
      if (!membership) throw new BadRequestException('Người dùng không thuộc tổ chức');
    }

    return this.database.sql.begin(async (transaction) => {
      const [before] = await transaction`
        SELECT * FROM user_skill_state WHERE user_id = ${userId.data} FOR UPDATE
      `;
      const [state] = await transaction`
        INSERT INTO user_skill_state (user_id, cc_base, cc_calculated, cc_level)
        VALUES (${userId.data}, ${input.data.ccBase}, 0, ${input.data.ccBase})
        ON CONFLICT (user_id) DO UPDATE SET
          cc_base = EXCLUDED.cc_base,
          cc_level = GREATEST(EXCLUDED.cc_base, user_skill_state.cc_calculated),
          updated_at = now()
        RETURNING *
      `;
      await transaction`
        INSERT INTO audit_logs (
          actor_user_id, action, entity_type, entity_id, before, after, reason
        ) VALUES (
          ${actor.userId}, 'CC_BASE_RECALIBRATED', 'user_skill_state', ${userId.data},
          ${JSON.stringify(before ?? null)}::jsonb,
          ${JSON.stringify(state ?? null)}::jsonb,
          ${input.data.reason}
        )
      `;
      return { state };
    });
  }

  @Post(':id/points')
  adjustPoints(
    @Param('id') userIdInput: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthUser,
  ) {
    const userId = z.string().uuid().safeParse(userIdInput);
    const input = pointSchema.safeParse(body);
    if (!userId.success || !input.success) throw new BadRequestException('Dữ liệu không hợp lệ');
    return this.adjustments.apply({ targetUserId: userId.data, actor, ...input.data });
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
    const access = await this.authorization.organizationAccess(organizationId.data, actor);
    this.authorization.assertCanTeach(access, actor);
    const logs = await this.database.sql`
      SELECT logs.id, logs.actor_user_id, actors.display_name AS actor_name, logs.action,
        logs.entity_type, logs.entity_id, logs.before, logs.after, logs.reason, logs.created_at
      FROM audit_logs AS logs
      LEFT JOIN users AS actors ON actors.id = logs.actor_user_id
      WHERE logs.entity_id = ${organizationId.data}
        OR logs.after->>'organizationId' = ${organizationId.data}
        OR logs.after->>'organization_id' = ${organizationId.data}
        OR logs.before->>'organization_id' = ${organizationId.data}
        OR EXISTS (
          SELECT 1 FROM organization_memberships AS memberships
          WHERE memberships.organization_id = ${organizationId.data}
            AND (memberships.id::text = logs.entity_id OR memberships.user_id::text = logs.entity_id)
        )
      ORDER BY logs.created_at DESC LIMIT ${limit.data}
    `;
    return { logs };
  }
}
