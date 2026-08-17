import { BadRequestException, Body, Controller, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { AuthorizationService } from '../authorization/authorization.service';
import { DatabaseService } from '../database/database.service';

const schema = z.object({
  organizationId: z.string().uuid(),
  ccBase: z.coerce.number().min(0).max(10_000),
  reason: z.string().trim().min(3).max(500),
});

@Controller('admin/users')
export class ScoringAdminController {
  constructor(
    private readonly database: DatabaseService,
    private readonly authorization: AuthorizationService,
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
}
