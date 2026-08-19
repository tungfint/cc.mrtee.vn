import { BadRequestException, Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { CurrentUser, RequireSystemRole } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { DatabaseService } from '../database/database.service';

const createSchema = z.object({ organizationId: z.string().uuid().nullable().default(null) });

@RequireSystemRole('SYSTEM_ADMIN')
@Controller('admin/leaderboard-links')
export class LeaderboardLinksController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  async list() {
    return {
      links: await this.database.sql`
        SELECT links.id, links.organization_id, links.public_key, links.active,
          links.created_at, organizations.name AS organization_name,
          organizations.slug AS organization_slug
        FROM leaderboard_share_links AS links
        LEFT JOIN organizations ON organizations.id = links.organization_id
        WHERE links.active = true
        ORDER BY links.organization_id NULLS FIRST, organizations.name, links.created_at DESC
      `,
    };
  }

  @Post()
  async generate(@Body() body: unknown, @CurrentUser() actor: AuthUser) {
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Phạm vi bảng xếp hạng không hợp lệ');
    const organizationId = parsed.data.organizationId;
    let prefix = 'all';
    if (organizationId) {
      const [organization] = await this.database.sql<{ slug: string }[]>`
        SELECT slug FROM organizations WHERE id = ${organizationId} AND status = 'ACTIVE'
      `;
      if (!organization) throw new BadRequestException('Không tìm thấy lớp đang hoạt động');
      prefix = organization.slug;
    }
    const publicKey = `${prefix}-${randomBytes(14).toString('hex')}`;
    const link = await this.database.sql.begin(async (transaction) => {
      await transaction`
        UPDATE leaderboard_share_links
        SET active = false, revoked_at = now()
        WHERE organization_id IS NOT DISTINCT FROM ${organizationId} AND active = true
      `;
      const [created] = await transaction`
        INSERT INTO leaderboard_share_links (organization_id, public_key, created_by)
        VALUES (${organizationId}, ${publicKey}, ${actor.userId})
        RETURNING id, organization_id, public_key, active, created_at
      `;
      await transaction`
        INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, after)
        VALUES (${actor.userId}, 'LEADERBOARD_LINK_GENERATED', 'leaderboard_share_link',
          ${String(created?.id)}, ${JSON.stringify(created ?? null)}::jsonb)
      `;
      return created;
    });
    return { link: { ...link, publicPath: `/leaderboard/${publicKey}` } };
  }

  @Delete(':id')
  async revoke(@Param('id') idInput: string, @CurrentUser() actor: AuthUser) {
    const id = z.string().uuid().safeParse(idInput);
    if (!id.success) throw new BadRequestException('ID liên kết không hợp lệ');
    const [updated] = await this.database.sql`
      UPDATE leaderboard_share_links SET active = false, revoked_at = now()
      WHERE id = ${id.data} AND active = true RETURNING id, public_key
    `;
    if (!updated) throw new BadRequestException('Liên kết không tồn tại hoặc đã thu hồi');
    await this.database.sql`
      INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, after)
      VALUES (${actor.userId}, 'LEADERBOARD_LINK_REVOKED', 'leaderboard_share_link',
        ${id.data}, ${JSON.stringify(updated)}::jsonb)
    `;
    return { success: true };
  }
}
