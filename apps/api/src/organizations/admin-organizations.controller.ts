import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, RequireSystemRole } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { DatabaseService } from '../database/database.service';

const listSchema = z.object({
  search: z.string().trim().max(200).default(''),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});
const updateSchema = z
  .object({
    name: z.string().trim().min(2).max(200).optional(),
    visibility: z.enum(['PUBLIC', 'CLOSED', 'PRIVATE']).optional(),
    timezone: z.string().trim().min(1).max(100).optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    reason: z.string().trim().min(3).max(500),
  })
  .refine(
    (value) => Object.entries(value).some(([key, item]) => key !== 'reason' && item !== undefined),
    'Không có thay đổi',
  );

@RequireSystemRole('SYSTEM_ADMIN')
@Controller('admin/organizations')
export class AdminOrganizationsController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  async list(@Query() raw: unknown) {
    const input = this.parse(listSchema, raw);
    const search = `%${input.search}%`;
    return {
      organizations: await this.database.sql`
        SELECT organizations.id, organizations.parent_organization_id, organizations.name,
          organizations.slug, organizations.visibility, organizations.timezone,
          organizations.status, organizations.created_at,
          count(DISTINCT memberships.id) FILTER (WHERE memberships.status = 'ACTIVE')::int
            AS member_count,
          count(DISTINCT seasons.id) FILTER (WHERE seasons.status IN ('ACTIVE', 'CLOSING'))::int
            AS active_seasons
        FROM organizations
        LEFT JOIN organization_memberships AS memberships
          ON memberships.organization_id = organizations.id
        LEFT JOIN seasons ON seasons.organization_id = organizations.id
        WHERE (${input.search} = '' OR organizations.name ILIKE ${search}
          OR organizations.slug ILIKE ${search})
          AND (${input.status ?? null}::organization_status IS NULL
            OR organizations.status = ${input.status ?? null})
        GROUP BY organizations.id
        ORDER BY organizations.created_at DESC
      `,
    };
  }

  @Patch(':id')
  async update(
    @Param('id') idInput: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthUser,
  ) {
    const id = this.uuid(idInput);
    const input = this.parse(updateSchema, body);
    const organization = await this.database.sql.begin(async (transaction) => {
      const [before] = await transaction`
        SELECT name, visibility, timezone, status FROM organizations WHERE id = ${id} FOR UPDATE
      `;
      if (!before) throw new BadRequestException('Không tìm thấy tổ chức');
      const [updated] = await transaction`
        UPDATE organizations SET
          name = COALESCE(${input.name ?? null}, name),
          visibility = COALESCE(${input.visibility ?? null}::organization_visibility, visibility),
          timezone = COALESCE(${input.timezone ?? null}, timezone),
          status = COALESCE(${input.status ?? null}::organization_status, status),
          updated_at = now()
        WHERE id = ${id}
        RETURNING id, name, slug, visibility, timezone, status, updated_at
      `;
      await transaction`
        INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, before, after, reason)
        VALUES (${actor.userId}, 'ORGANIZATION_UPDATED', 'organization', ${id},
          ${JSON.stringify(before)}::jsonb, ${JSON.stringify(updated ?? null)}::jsonb, ${input.reason})
      `;
      return updated;
    });
    return { organization };
  }

  @Delete(':id')
  async archive(@Param('id') idInput: string, @CurrentUser() actor: AuthUser) {
    const id = this.uuid(idInput);
    const organization = await this.database.sql.begin(async (transaction) => {
      const [before] = await transaction`
        SELECT id, name, slug, visibility, status FROM organizations WHERE id = ${id} FOR UPDATE
      `;
      if (!before) throw new BadRequestException('Không tìm thấy lớp học');
      const [updated] = await transaction`
        UPDATE organizations SET status = 'INACTIVE', updated_at = now()
        WHERE id = ${id} RETURNING id, name, slug, visibility, timezone, status, updated_at
      `;
      await transaction`
        INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, before, after, reason)
        VALUES (${actor.userId}, 'ORGANIZATION_ARCHIVED', 'organization', ${id},
          ${JSON.stringify(before)}::jsonb, ${JSON.stringify(updated ?? null)}::jsonb,
          'Lưu trữ lớp học và giữ lại lịch sử')
      `;
      return updated;
    });
    return { organization };
  }

  private uuid(value: string): string {
    const parsed = z.string().uuid().safeParse(value);
    if (!parsed.success) throw new BadRequestException('ID không hợp lệ');
    return parsed.data;
  }

  private parse<T>(schema: z.ZodType<T>, value: unknown): T {
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return parsed.data;
  }
}
