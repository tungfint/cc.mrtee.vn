import { BadRequestException, Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { AuthorizationService } from '../authorization/authorization.service';
import { DatabaseService } from '../database/database.service';
import { SeasonClosureService } from './season-closure.service';

const createSchema = z.object({
  organizationId: z.string().uuid().nullable().default(null),
  name: z.string().trim().min(2).max(200),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  scoringPolicyVersion: z.string().trim().min(1).max(50).default('v2.0'),
});
const statusSchema = z.object({
  status: z.enum(['ACTIVE', 'CLOSING']),
  reason: z.string().trim().min(3).max(500),
});

@Controller('admin/seasons')
export class SeasonsController {
  constructor(
    private readonly database: DatabaseService,
    private readonly authorization: AuthorizationService,
    private readonly closure: SeasonClosureService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    const seasons = await this.database.sql`
      SELECT DISTINCT seasons.*
      FROM seasons
      LEFT JOIN organization_memberships AS memberships
        ON memberships.organization_id = seasons.organization_id
        AND memberships.user_id = ${user.userId}
        AND memberships.status = 'ACTIVE'
      WHERE seasons.organization_id IS NULL
        OR ${user.systemRole === 'SYSTEM_ADMIN'}
        OR memberships.id IS NOT NULL
      ORDER BY seasons.start_at DESC
    `;
    return { seasons };
  }

  @Post()
  async create(@Body() body: unknown, @CurrentUser() actor: AuthUser) {
    const parsed = createSchema.safeParse(body);
    if (!parsed.success || parsed.data.endAt <= parsed.data.startAt) {
      throw new BadRequestException('Khoảng thời gian season không hợp lệ');
    }
    if (parsed.data.organizationId) {
      const access = await this.authorization.organizationAccess(parsed.data.organizationId, actor);
      this.authorization.assertCanManage(access, actor);
    } else if (actor.systemRole !== 'SYSTEM_ADMIN') {
      throw new BadRequestException('Chỉ system admin được tạo season toàn hệ thống');
    }

    return this.database.sql.begin(async (transaction) => {
      await transaction`
        SELECT pg_advisory_xact_lock(hashtextextended(
          ${`season:${parsed.data.organizationId ?? 'global'}`}, 0
        ))
      `;
      const [overlap] = await transaction`
        SELECT id FROM seasons
        WHERE organization_id IS NOT DISTINCT FROM ${parsed.data.organizationId}
          AND status <> 'CLOSED'
          AND start_at < ${parsed.data.endAt.toISOString()}
          AND end_at > ${parsed.data.startAt.toISOString()}
        LIMIT 1
      `;
      if (overlap) throw new BadRequestException('Season đang chồng lấn thời gian');
      const [season] = await transaction`
        INSERT INTO seasons (
          organization_id, name, start_at, end_at, scoring_policy_version
        ) VALUES (
          ${parsed.data.organizationId}, ${parsed.data.name},
          ${parsed.data.startAt.toISOString()}, ${parsed.data.endAt.toISOString()},
          ${parsed.data.scoringPolicyVersion}
        ) RETURNING *
      `;
      if (!season) throw new Error('Failed to create season');
      await transaction`
        INSERT INTO audit_logs (
          actor_user_id, action, entity_type, entity_id, after
        ) VALUES (
          ${actor.userId}, 'SEASON_CREATED', 'season', ${String(season.id)},
          ${JSON.stringify(season)}::jsonb
        )
      `;
      return { season };
    });
  }

  @Patch(':id/status')
  async transition(
    @Param('id') idInput: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthUser,
  ) {
    const id = z.string().uuid().safeParse(idInput);
    const input = statusSchema.safeParse(body);
    if (!id.success || !input.success) throw new BadRequestException('Dữ liệu không hợp lệ');
    const [current] = await this.database.sql<{ organization_id: string | null; status: string }[]>`
      SELECT organization_id, status FROM seasons WHERE id = ${id.data}
    `;
    if (!current) throw new BadRequestException('Không tìm thấy season');
    if (current.organization_id) {
      const access = await this.authorization.organizationAccess(current.organization_id, actor);
      this.authorization.assertCanManage(access, actor);
    } else if (actor.systemRole !== 'SYSTEM_ADMIN') {
      throw new BadRequestException('Không đủ quyền');
    }
    const allowed =
      (current.status === 'DRAFT' && input.data.status === 'ACTIVE') ||
      (current.status === 'ACTIVE' && input.data.status === 'CLOSING');
    if (!allowed) throw new BadRequestException('Chuyển trạng thái season không hợp lệ');

    return this.database.sql.begin(async (transaction) => {
      const [season] = await transaction`
        UPDATE seasons SET status = ${input.data.status}, updated_at = now()
        WHERE id = ${id.data} AND status = ${current.status}
        RETURNING *
      `;
      if (!season) throw new BadRequestException('Season đã thay đổi trạng thái');
      await transaction`
        INSERT INTO audit_logs (
          actor_user_id, action, entity_type, entity_id, before, after, reason
        ) VALUES (
          ${actor.userId}, 'SEASON_STATUS_CHANGED', 'season', ${id.data},
          ${JSON.stringify(current)}::jsonb, ${JSON.stringify(season)}::jsonb,
          ${input.data.reason}
        )
      `;
      return { season };
    });
  }

  @Post(':id/close')
  async close(@Param('id') idInput: string, @Body() body: unknown, @CurrentUser() actor: AuthUser) {
    const id = z.string().uuid().safeParse(idInput);
    const input = z.object({ reason: z.string().trim().min(3).max(500) }).safeParse(body);
    if (!id.success || !input.success) throw new BadRequestException('Dữ liệu không hợp lệ');
    return this.closure.close(id.data, actor, input.data.reason);
  }
}
