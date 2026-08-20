import { BadRequestException, Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  CurrentUser,
  OptionalAuth,
  OptionalUser,
  RequireSystemRole,
} from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { AuthorizationService } from '../authorization/authorization.service';
import { DatabaseService } from '../database/database.service';

const uuidSchema = z.string().uuid();
const createOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(200),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(100),
  visibility: z.enum(['PUBLIC', 'CLOSED', 'PRIVATE']).default('PRIVATE'),
  timezone: z.string().trim().min(1).max(100).default('Asia/Ho_Chi_Minh'),
  parentOrganizationId: z.string().uuid().nullable().optional(),
});
const addMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['MEMBER', 'TEACHER', 'ORG_ADMIN']).default('MEMBER'),
});
const addMembersByEmailSchema = z.object({
  emails: z.array(z.string().trim().toLowerCase().email()).min(1).max(500),
});
const updateMemberSchema = z.object({
  role: z.enum(['MEMBER', 'TEACHER', 'ORG_ADMIN']).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'LEFT']).optional(),
  reason: z.string().trim().min(3).max(500),
});

@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly database: DatabaseService,
    private readonly authorization: AuthorizationService,
  ) {}

  @OptionalAuth()
  @Get(':id')
  async getOrganization(@Param('id') idInput: string, @OptionalUser() user?: AuthUser) {
    const id = this.uuid(idInput);
    const access = await this.authorization.organizationAccess(id, user);
    this.authorization.assertCanView(access, user);
    const [organization] = await this.database.sql`
      SELECT id, parent_organization_id, name, slug, visibility, timezone, status
      FROM organizations WHERE id = ${id}
    `;
    return { organization, membershipRole: access.membershipRole };
  }

  @RequireSystemRole('SYSTEM_ADMIN')
  @Post()
  async createOrganization(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    const input = this.parse(createOrganizationSchema, body);
    const organization = await this.database.sql.begin(async (transaction) => {
      const [created] = await transaction`
        INSERT INTO organizations (parent_organization_id, name, slug, visibility, timezone)
        VALUES (
          ${input.parentOrganizationId ?? null},
          ${input.name},
          ${input.slug},
          ${input.visibility},
          ${input.timezone}
        )
        RETURNING id, name, slug, visibility, timezone, status
      `;
      await transaction`
        INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, after)
        VALUES (
          ${user.userId}, 'ORGANIZATION_CREATED', 'organization', ${String(created?.id)},
          ${JSON.stringify(created ?? null)}::jsonb
        )
      `;
      return created;
    });
    return { organization };
  }

  @Get(':id/members')
  async listMembers(@Param('id') idInput: string, @CurrentUser() user: AuthUser) {
    const id = this.uuid(idInput);
    const access = await this.authorization.organizationAccess(id, user);
    this.authorization.assertCanView(access, user);
    if (user.systemRole === 'USER' && !access.membershipRole) {
      throw new BadRequestException('Chỉ thành viên được xem danh sách thành viên');
    }
    const members = await this.database.sql`
      SELECT
        memberships.user_id,
        credentials.email,
        users.full_name,
        users.display_name,
        users.avatar_url,
        skill.cc_base::text AS initial_cc_level,
        skill.cc_level::text AS cc_level,
        accounts.handle AS codeforces_handle,
        accounts.pending_handle,
        accounts.verification_status,
        accounts.current_rating,
        accounts.rank AS codeforces_rank,
        accounts.sync_status,
        accounts.last_sync_at,
        memberships.role,
        memberships.status,
        memberships.joined_at,
        memberships.left_at
      FROM organization_memberships AS memberships
      JOIN users ON users.id = memberships.user_id
      LEFT JOIN user_credentials AS credentials ON credentials.user_id = users.id
      LEFT JOIN user_skill_state AS skill ON skill.user_id = users.id
      LEFT JOIN codeforces_accounts AS accounts ON accounts.user_id = users.id
      WHERE memberships.organization_id = ${id}
      ORDER BY memberships.joined_at DESC
    `;
    return { members };
  }

  @Post(':id/members')
  async addMember(
    @Param('id') idInput: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthUser,
  ) {
    const id = this.uuid(idInput);
    const input = this.parse(addMemberSchema, body);
    const access = await this.authorization.organizationAccess(id, user);
    this.authorization.assertCanManage(access, user);
    const membership = await this.database.sql.begin(async (transaction) => {
      const [created] = await transaction`
        INSERT INTO organization_memberships (organization_id, user_id, role)
        VALUES (${id}, ${input.userId}, ${input.role})
        RETURNING id, organization_id, user_id, role, status, joined_at
      `;
      await transaction`
        INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, after)
        VALUES (
          ${user.userId}, 'ORGANIZATION_MEMBER_ADDED', 'organization_membership',
          ${String(created?.id)}, ${JSON.stringify(created ?? null)}::jsonb
        )
      `;
      return created;
    });
    return { membership };
  }

  @Post(':id/members/by-email')
  async addMembersByEmail(
    @Param('id') idInput: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthUser,
  ) {
    const id = this.uuid(idInput);
    const input = this.parse(addMembersByEmailSchema, body);
    const emails = [...new Set(input.emails)];
    const access = await this.authorization.organizationAccess(id, user);
    this.authorization.assertCanManage(access, user);
    return this.database.sql.begin(async (transaction) => {
      const matched = await transaction<{ id: string; email: string }[]>`
        SELECT users.id, lower(credentials.email::text) AS email
        FROM users
        JOIN user_credentials AS credentials ON credentials.user_id = users.id
        WHERE lower(credentials.email::text) = ANY(${emails}::text[])
          AND users.status = 'ACTIVE' AND users.system_role = 'USER'
          AND NOT EXISTS (
            SELECT 1 FROM organization_memberships AS staff
            WHERE staff.user_id = users.id AND staff.status = 'ACTIVE'
              AND staff.role IN ('TEACHER', 'ORG_ADMIN')
          )
      `;
      const added = await transaction<{ user_id: string }[]>`
        INSERT INTO organization_memberships (organization_id, user_id, role)
        SELECT ${id}, matched.id, 'MEMBER'
        FROM unnest(${matched.map((item) => item.id)}::uuid[]) AS matched(id)
        WHERE NOT EXISTS (
          SELECT 1 FROM organization_memberships AS existing
          WHERE existing.organization_id = ${id} AND existing.user_id = matched.id
            AND existing.status = 'ACTIVE'
        )
        RETURNING user_id
      `;
      const matchedEmails = new Set(matched.map((item) => item.email));
      const notFound = emails.filter((email) => !matchedEmails.has(email));
      await transaction`
        INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, after, reason)
        VALUES (${user.userId}, 'ORGANIZATION_MEMBERS_BULK_ADDED', 'organization', ${id},
          ${JSON.stringify({ emails, addedUserIds: added.map((item) => item.user_id), notFound })}::jsonb,
          'Thêm nhiều học sinh vào lớp bằng danh sách email')
      `;
      return {
        requested: emails.length,
        matched: matched.length,
        added: added.length,
        alreadyInClass: matched.length - added.length,
        notFound,
      };
    });
  }

  @Patch(':id/members/:userId')
  async updateMember(
    @Param('id') idInput: string,
    @Param('userId') memberUserIdInput: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthUser,
  ) {
    const id = this.uuid(idInput);
    const memberUserId = this.uuid(memberUserIdInput);
    const input = this.parse(updateMemberSchema, body);
    if (!input.role && !input.status) throw new BadRequestException('Không có thay đổi');
    const access = await this.authorization.organizationAccess(id, user);
    this.authorization.assertCanManage(access, user);
    const membership = await this.database.sql.begin(async (transaction) => {
      const [before] = await transaction`
        SELECT id, role, status, left_at
        FROM organization_memberships
        WHERE organization_id = ${id} AND user_id = ${memberUserId} AND status = 'ACTIVE'
        FOR UPDATE
      `;
      if (!before) throw new BadRequestException('Không tìm thấy membership đang hoạt động');
      const membershipId = String(before.id);
      const [updated] = await transaction`
        UPDATE organization_memberships
        SET
          role = COALESCE(${input.role ?? null}, role),
          status = COALESCE(${input.status ?? null}, status),
          left_at = CASE WHEN ${input.status ?? null} = 'LEFT' THEN now() ELSE NULL END,
          updated_at = now()
        WHERE id = ${membershipId}
        RETURNING id, organization_id, user_id, role, status, joined_at, left_at
      `;
      await transaction`
        INSERT INTO audit_logs (
          actor_user_id, action, entity_type, entity_id, before, after, reason
        ) VALUES (
          ${user.userId}, 'ORGANIZATION_MEMBER_UPDATED', 'organization_membership',
          ${membershipId}, ${JSON.stringify(before)}::jsonb,
          ${JSON.stringify(updated ?? null)}::jsonb, ${input.reason}
        )
      `;
      return updated;
    });
    return { membership };
  }

  private uuid(value: string): string {
    const parsed = uuidSchema.safeParse(value);
    if (!parsed.success) throw new BadRequestException('ID không hợp lệ');
    return parsed.data;
  }

  private parse<T>(schema: z.ZodType<T>, value: unknown): T {
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return parsed.data;
  }
}
