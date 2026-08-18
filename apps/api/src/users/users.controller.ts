import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthService } from '../auth/auth.service';
import { CurrentUser, RequireSystemRole } from '../auth/auth.decorators';
import { hashPassword, verifyPassword } from '../auth/password';
import type { AuthUser } from '../auth/auth.types';
import { DatabaseService } from '../database/database.service';

const avatarSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => value === '' || /^https?:\/\//i.test(value), 'Avatar phải là URL HTTP(S)');
const profileFields = {
  fullName: z.string().trim().min(2).max(200),
  displayName: z.string().trim().min(2).max(100),
  timezone: z.string().trim().min(1).max(100),
  avatarUrl: avatarSchema,
};
const createUserSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(12).max(200),
  fullName: profileFields.fullName,
  displayName: profileFields.displayName,
  systemRole: z.enum(['USER', 'SYSTEM_ADMIN']).default('USER'),
});
const updateOwnProfileSchema = z
  .object({
    fullName: profileFields.fullName.optional(),
    displayName: profileFields.displayName.optional(),
    timezone: profileFields.timezone.optional(),
    avatarUrl: profileFields.avatarUrl.optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), 'Không có thay đổi');
const changePasswordSchema = z.object({
  currentPassword: z.string().min(12).max(200),
  newPassword: z.string().min(12).max(200),
});
const listUsersSchema = z.object({
  search: z.string().trim().max(200).default(''),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
const updateUserSchema = z
  .object({
    fullName: profileFields.fullName.optional(),
    displayName: profileFields.displayName.optional(),
    timezone: profileFields.timezone.optional(),
    avatarUrl: profileFields.avatarUrl.optional(),
    status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
    systemRole: z.enum(['USER', 'SYSTEM_ADMIN']).optional(),
    reason: z.string().trim().min(3).max(500),
  })
  .refine(
    (value) => Object.entries(value).some(([key, item]) => key !== 'reason' && item !== undefined),
    'Không có thay đổi',
  );
const resetPasswordSchema = z.object({
  password: z.string().min(12).max(200),
  reason: z.string().trim().min(3).max(500),
});

@Controller()
export class UsersController {
  constructor(
    private readonly database: DatabaseService,
    private readonly auth: AuthService,
  ) {}

  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    const [profile] = await this.database.sql`
      SELECT users.id, credentials.email, users.full_name, users.display_name,
        users.avatar_url, users.status, users.system_role, users.timezone, users.created_at
      FROM users
      LEFT JOIN user_credentials AS credentials ON credentials.user_id = users.id
      WHERE users.id = ${user.userId}
    `;
    const memberships = await this.database.sql`
      SELECT memberships.organization_id, organizations.name AS organization_name,
        organizations.slug AS organization_slug, memberships.role, memberships.status
      FROM organization_memberships AS memberships
      JOIN organizations ON organizations.id = memberships.organization_id
      WHERE memberships.user_id = ${user.userId} AND memberships.status = 'ACTIVE'
      ORDER BY organizations.name
    `;
    return { user: profile, memberships };
  }

  @Patch('me')
  async updateMe(@Body() body: unknown, @CurrentUser() actor: AuthUser) {
    const input = this.parse(updateOwnProfileSchema, body);
    const avatarUrl = input.avatarUrl === '' ? null : input.avatarUrl;
    const profile = await this.database.sql.begin(async (transaction) => {
      const [before] = await transaction`
        SELECT full_name, display_name, timezone, avatar_url FROM users
        WHERE id = ${actor.userId} FOR UPDATE
      `;
      const [updated] = await transaction`
        UPDATE users SET
          full_name = COALESCE(${input.fullName ?? null}, full_name),
          display_name = COALESCE(${input.displayName ?? null}, display_name),
          timezone = COALESCE(${input.timezone ?? null}, timezone),
          avatar_url = CASE WHEN ${input.avatarUrl !== undefined} THEN ${avatarUrl ?? null}
            ELSE avatar_url END,
          updated_at = now()
        WHERE id = ${actor.userId}
        RETURNING id, full_name, display_name, avatar_url, timezone, updated_at
      `;
      await transaction`
        INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, before, after)
        VALUES (${actor.userId}, 'USER_PROFILE_UPDATED', 'user', ${actor.userId},
          ${JSON.stringify(before ?? null)}::jsonb, ${JSON.stringify(updated ?? null)}::jsonb)
      `;
      return updated;
    });
    return { user: profile };
  }

  @Post('me/password')
  async changePassword(@Body() body: unknown, @CurrentUser() actor: AuthUser) {
    const input = this.parse(changePasswordSchema, body);
    if (input.currentPassword === input.newPassword) {
      throw new BadRequestException('Mật khẩu mới phải khác mật khẩu hiện tại');
    }
    const [credential] = await this.database.sql<{ password_hash: string }[]>`
      SELECT password_hash FROM user_credentials WHERE user_id = ${actor.userId}
    `;
    if (!credential || !(await verifyPassword(input.currentPassword, credential.password_hash))) {
      throw new UnauthorizedException('Mật khẩu hiện tại không đúng');
    }
    const passwordHash = await hashPassword(input.newPassword);
    await this.database.sql.begin(async (transaction) => {
      await transaction`
        UPDATE user_credentials SET password_hash = ${passwordHash}, password_updated_at = now(),
          failed_login_attempts = 0, locked_until = NULL, updated_at = now()
        WHERE user_id = ${actor.userId}
      `;
      await transaction`
        UPDATE auth_sessions SET revoked_at = now()
        WHERE user_id = ${actor.userId} AND id <> ${actor.sessionId} AND revoked_at IS NULL
      `;
      await transaction`
        INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id)
        VALUES (${actor.userId}, 'USER_PASSWORD_CHANGED', 'user', ${actor.userId})
      `;
    });
    return { success: true };
  }

  @RequireSystemRole('SYSTEM_ADMIN')
  @Get('admin/users')
  async listUsers(@Query() raw: unknown) {
    const input = this.parse(listUsersSchema, raw);
    const search = `%${input.search}%`;
    const offset = (input.page - 1) * input.pageSize;
    const users = await this.database.sql`
      SELECT users.id, credentials.email, users.full_name, users.display_name, users.avatar_url,
        users.status, users.system_role, users.timezone, users.created_at,
        COALESCE(jsonb_agg(jsonb_build_object(
          'organizationId', organizations.id, 'organizationName', organizations.name,
          'role', memberships.role
        )) FILTER (WHERE memberships.id IS NOT NULL), '[]'::jsonb) AS memberships
      FROM users
      LEFT JOIN user_credentials AS credentials ON credentials.user_id = users.id
      LEFT JOIN organization_memberships AS memberships
        ON memberships.user_id = users.id AND memberships.status = 'ACTIVE'
      LEFT JOIN organizations ON organizations.id = memberships.organization_id
      WHERE (${input.search} = '' OR users.display_name ILIKE ${search}
        OR users.full_name ILIKE ${search} OR credentials.email ILIKE ${search})
        AND (${input.status ?? null}::user_status IS NULL OR users.status = ${input.status ?? null})
      GROUP BY users.id, credentials.email
      ORDER BY users.created_at DESC
      LIMIT ${input.pageSize} OFFSET ${offset}
    `;
    const [{ count } = { count: '0' }] = await this.database.sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM users
      LEFT JOIN user_credentials AS credentials ON credentials.user_id = users.id
      WHERE (${input.search} = '' OR users.display_name ILIKE ${search}
        OR users.full_name ILIKE ${search} OR credentials.email ILIKE ${search})
        AND (${input.status ?? null}::user_status IS NULL OR users.status = ${input.status ?? null})
    `;
    return { users, total: Number(count), page: input.page, pageSize: input.pageSize };
  }

  @RequireSystemRole('SYSTEM_ADMIN')
  @Post('admin/users')
  async createUser(@Body() body: unknown, @CurrentUser() actor: AuthUser) {
    const input = this.parse(createUserSchema, body);
    const userId = await this.auth.createUser(input, {
      actorUserId: actor.userId,
      after: {
        email: input.email.toLowerCase(),
        fullName: input.fullName,
        displayName: input.displayName,
        systemRole: input.systemRole,
      },
    });
    return { userId };
  }

  @RequireSystemRole('SYSTEM_ADMIN')
  @Get('admin/users/:id')
  async getUser(@Param('id') id: string) {
    const userId = this.uuid(id);
    const [user] = await this.database.sql`
      SELECT users.id, credentials.email, users.full_name, users.display_name, users.avatar_url,
        users.status, users.system_role, users.timezone, users.created_at
      FROM users
      LEFT JOIN user_credentials AS credentials ON credentials.user_id = users.id
      WHERE users.id = ${userId}
    `;
    return { user: user ?? null };
  }

  @RequireSystemRole('SYSTEM_ADMIN')
  @Patch('admin/users/:id')
  async updateUser(@Param('id') id: string, @Body() body: unknown, @CurrentUser() actor: AuthUser) {
    const userId = this.uuid(id);
    const input = this.parse(updateUserSchema, body);
    if (userId === actor.userId && input.status && input.status !== 'ACTIVE') {
      throw new BadRequestException('Không thể tự vô hiệu hóa tài khoản đang đăng nhập');
    }
    if (userId === actor.userId && input.systemRole === 'USER') {
      throw new BadRequestException('Không thể tự gỡ quyền quản trị hệ thống');
    }
    const avatarUrl = input.avatarUrl === '' ? null : input.avatarUrl;
    const updated = await this.database.sql.begin(async (transaction) => {
      const [before] = await transaction`
        SELECT full_name, display_name, avatar_url, timezone, status, system_role
        FROM users WHERE id = ${userId} FOR UPDATE
      `;
      if (!before) throw new BadRequestException('Không tìm thấy tài khoản');
      const [user] = await transaction`
        UPDATE users SET
          full_name = COALESCE(${input.fullName ?? null}, full_name),
          display_name = COALESCE(${input.displayName ?? null}, display_name),
          timezone = COALESCE(${input.timezone ?? null}, timezone),
          status = COALESCE(${input.status ?? null}::user_status, status),
          system_role = COALESCE(${input.systemRole ?? null}::system_role, system_role),
          avatar_url = CASE WHEN ${input.avatarUrl !== undefined} THEN ${avatarUrl ?? null}
            ELSE avatar_url END,
          updated_at = now()
        WHERE id = ${userId}
        RETURNING id, full_name, display_name, avatar_url, timezone, status, system_role, updated_at
      `;
      await transaction`
        INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, before, after, reason)
        VALUES (${actor.userId}, 'USER_UPDATED', 'user', ${userId},
          ${JSON.stringify(before)}::jsonb, ${JSON.stringify(user ?? null)}::jsonb, ${input.reason})
      `;
      return user;
    });
    return { user: updated };
  }

  @RequireSystemRole('SYSTEM_ADMIN')
  @Post('admin/users/:id/reset-password')
  async resetPassword(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthUser,
  ) {
    const userId = this.uuid(id);
    const input = this.parse(resetPasswordSchema, body);
    const passwordHash = await hashPassword(input.password);
    await this.database.sql.begin(async (transaction) => {
      const [credential] = await transaction`
        UPDATE user_credentials SET password_hash = ${passwordHash}, password_updated_at = now(),
          failed_login_attempts = 0, locked_until = NULL, updated_at = now()
        WHERE user_id = ${userId} RETURNING user_id
      `;
      if (!credential) throw new BadRequestException('Tài khoản không có thông tin đăng nhập');
      await transaction`
        UPDATE auth_sessions SET revoked_at = now() WHERE user_id = ${userId} AND revoked_at IS NULL
      `;
      await transaction`
        INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, reason)
        VALUES (${actor.userId}, 'USER_PASSWORD_RESET', 'user', ${userId}, ${input.reason})
      `;
    });
    return { success: true };
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
