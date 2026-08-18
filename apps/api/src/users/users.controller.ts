import {
  BadRequestException,
  Body,
  ConflictException,
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
  avatarUrl: avatarSchema,
};
const codeforcesHandleSchema = z
  .string()
  .trim()
  .min(3)
  .max(24)
  .regex(/^[A-Za-z0-9_.-]+$/, 'Codeforces handle không hợp lệ');
const initialCcLevelSchema = z.coerce.number().min(0).max(10_000);
const createUserSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(12).max(200),
  fullName: profileFields.fullName,
  displayName: profileFields.displayName,
  systemRole: z.enum(['USER', 'SYSTEM_ADMIN']).default('USER'),
  organizationId: z.string().uuid().optional(),
  codeforcesHandle: codeforcesHandleSchema.optional(),
  initialCcLevel: initialCcLevelSchema.default(800),
});
const updateOwnProfileSchema = z
  .object({
    fullName: profileFields.fullName.optional(),
    displayName: profileFields.displayName.optional(),
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
    email: z.string().trim().email().max(320).optional(),
    fullName: profileFields.fullName.optional(),
    displayName: profileFields.displayName.optional(),
    avatarUrl: profileFields.avatarUrl.optional(),
    status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
    systemRole: z.enum(['USER', 'SYSTEM_ADMIN']).optional(),
    initialCcLevel: initialCcLevelSchema.optional(),
    classId: z.string().uuid().nullable().optional(),
    codeforcesHandle: codeforcesHandleSchema.optional(),
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
        users.avatar_url, users.status, users.system_role, users.created_at,
        skill.cc_base::text AS initial_cc_level, skill.cc_level::text AS cc_level,
        accounts.handle AS codeforces_handle, accounts.pending_handle,
        accounts.verification_status, accounts.current_rating, accounts.rank
      FROM users
      LEFT JOIN user_credentials AS credentials ON credentials.user_id = users.id
      LEFT JOIN user_skill_state AS skill ON skill.user_id = users.id
      LEFT JOIN codeforces_accounts AS accounts ON accounts.user_id = users.id
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
        SELECT full_name, display_name, avatar_url FROM users
        WHERE id = ${actor.userId} FOR UPDATE
      `;
      const [updated] = await transaction`
        UPDATE users SET
          full_name = COALESCE(${input.fullName ?? null}, full_name),
          display_name = COALESCE(${input.displayName ?? null}, display_name),
          avatar_url = CASE WHEN ${input.avatarUrl !== undefined} THEN ${avatarUrl ?? null}
            ELSE avatar_url END,
          updated_at = now()
        WHERE id = ${actor.userId}
        RETURNING id, full_name, display_name, avatar_url, updated_at
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
        users.status, users.system_role, users.created_at,
        skill.cc_base::text AS initial_cc_level, skill.cc_level::text AS cc_level,
        accounts.handle AS codeforces_handle, accounts.pending_handle,
        accounts.verification_status, accounts.current_rating, accounts.rank,
        COALESCE(jsonb_agg(jsonb_build_object(
          'organizationId', organizations.id, 'organizationName', organizations.name,
          'role', memberships.role
        )) FILTER (WHERE memberships.id IS NOT NULL), '[]'::jsonb) AS memberships
      FROM users
      LEFT JOIN user_credentials AS credentials ON credentials.user_id = users.id
      LEFT JOIN organization_memberships AS memberships
        ON memberships.user_id = users.id AND memberships.status = 'ACTIVE'
      LEFT JOIN organizations ON organizations.id = memberships.organization_id
      LEFT JOIN user_skill_state AS skill ON skill.user_id = users.id
      LEFT JOIN codeforces_accounts AS accounts ON accounts.user_id = users.id
      WHERE (${input.search} = '' OR users.display_name ILIKE ${search}
        OR users.full_name ILIKE ${search} OR credentials.email ILIKE ${search}
        OR accounts.handle ILIKE ${search})
        AND (${input.status ?? null}::user_status IS NULL OR users.status = ${input.status ?? null})
      GROUP BY users.id, credentials.email, skill.cc_base, skill.cc_level, accounts.handle,
        accounts.pending_handle, accounts.verification_status, accounts.current_rating, accounts.rank
      ORDER BY users.created_at DESC
      LIMIT ${input.pageSize} OFFSET ${offset}
    `;
    const [{ count } = { count: '0' }] = await this.database.sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM users
      LEFT JOIN user_credentials AS credentials ON credentials.user_id = users.id
      LEFT JOIN codeforces_accounts AS accounts ON accounts.user_id = users.id
      WHERE (${input.search} = '' OR users.display_name ILIKE ${search}
        OR users.full_name ILIKE ${search} OR credentials.email ILIKE ${search}
        OR accounts.handle ILIKE ${search})
        AND (${input.status ?? null}::user_status IS NULL OR users.status = ${input.status ?? null})
    `;
    return { users, total: Number(count), page: input.page, pageSize: input.pageSize };
  }

  @RequireSystemRole('SYSTEM_ADMIN')
  @Post('admin/users')
  async createUser(@Body() body: unknown, @CurrentUser() actor: AuthUser) {
    const input = this.parse(createUserSchema, body);
    try {
      const userId = await this.auth.createUser(
        {
          email: input.email,
          password: input.password,
          fullName: input.fullName,
          displayName: input.displayName,
          systemRole: input.systemRole,
          initialCcLevel: input.initialCcLevel,
          ...(input.organizationId ? { organizationId: input.organizationId } : {}),
          ...(input.codeforcesHandle ? { codeforcesHandle: input.codeforcesHandle } : {}),
        },
        {
          actorUserId: actor.userId,
          after: {
            email: input.email.toLowerCase(),
            fullName: input.fullName,
            displayName: input.displayName,
            systemRole: input.systemRole,
            organizationId: input.organizationId ?? null,
            codeforcesHandle: input.codeforcesHandle ?? null,
            initialCcLevel: input.initialCcLevel,
          },
        },
      );
      return { userId };
    } catch (error) {
      this.rethrowConflict(error);
    }
  }

  @RequireSystemRole('SYSTEM_ADMIN')
  @Get('admin/users/:id')
  async getUser(@Param('id') id: string) {
    const userId = this.uuid(id);
    const [user] = await this.database.sql`
      SELECT users.id, credentials.email, users.full_name, users.display_name, users.avatar_url,
        users.status, users.system_role, users.created_at,
        skill.cc_base::text AS initial_cc_level, skill.cc_level::text AS cc_level,
        accounts.handle AS codeforces_handle, accounts.pending_handle,
        accounts.verification_status, accounts.current_rating, accounts.rank
      FROM users
      LEFT JOIN user_credentials AS credentials ON credentials.user_id = users.id
      LEFT JOIN user_skill_state AS skill ON skill.user_id = users.id
      LEFT JOIN codeforces_accounts AS accounts ON accounts.user_id = users.id
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
    try {
      const updated = await this.database.sql.begin(async (transaction) => {
        const [before] = await transaction`
          SELECT users.full_name, users.display_name, users.avatar_url, users.status,
            users.system_role, credentials.email, skill.cc_base,
            accounts.handle AS codeforces_handle, accounts.pending_handle
          FROM users
          LEFT JOIN user_credentials AS credentials ON credentials.user_id = users.id
          LEFT JOIN user_skill_state AS skill ON skill.user_id = users.id
          LEFT JOIN codeforces_accounts AS accounts ON accounts.user_id = users.id
          WHERE users.id = ${userId} FOR UPDATE OF users
        `;
        if (!before) throw new BadRequestException('Không tìm thấy tài khoản');
        const [user] = await transaction`
          UPDATE users SET
            full_name = COALESCE(${input.fullName ?? null}, full_name),
            display_name = COALESCE(${input.displayName ?? null}, display_name),
            status = COALESCE(${input.status ?? null}::user_status, status),
            system_role = COALESCE(${input.systemRole ?? null}::system_role, system_role),
            avatar_url = CASE WHEN ${input.avatarUrl !== undefined} THEN ${avatarUrl ?? null}
              ELSE avatar_url END,
            updated_at = now()
          WHERE id = ${userId}
          RETURNING id, full_name, display_name, avatar_url, status, system_role, updated_at
        `;
        if (input.email) {
          await transaction`
            UPDATE user_credentials SET email = ${input.email.toLowerCase()}, updated_at = now()
            WHERE user_id = ${userId}
          `;
        }
        if (input.initialCcLevel !== undefined) {
          await transaction`
            INSERT INTO user_skill_state (user_id, cc_base, cc_calculated, cc_level)
            VALUES (${userId}, ${input.initialCcLevel}, 0, ${input.initialCcLevel})
            ON CONFLICT (user_id) DO UPDATE SET
              cc_base = EXCLUDED.cc_base,
              cc_level = GREATEST(EXCLUDED.cc_base, user_skill_state.cc_calculated),
              updated_at = now()
          `;
        }
        if (input.classId !== undefined) {
          await transaction`
            UPDATE organization_memberships
            SET status = 'LEFT', left_at = now(), updated_at = now()
            WHERE user_id = ${userId} AND role = 'MEMBER' AND status = 'ACTIVE'
              AND organization_id IS DISTINCT FROM ${input.classId}
          `;
          if (input.classId) {
            const [activeMembership] = await transaction`
              SELECT id FROM organization_memberships
              WHERE organization_id = ${input.classId} AND user_id = ${userId}
                AND status = 'ACTIVE'
            `;
            if (!activeMembership) {
              await transaction`
                INSERT INTO organization_memberships (organization_id, user_id, role)
                VALUES (${input.classId}, ${userId}, 'MEMBER')
              `;
            }
          }
        }
        if (input.codeforcesHandle) {
          const [conflict] = await transaction`
            SELECT user_id FROM codeforces_accounts
            WHERE user_id <> ${userId}
              AND (handle = ${input.codeforcesHandle} OR pending_handle = ${input.codeforcesHandle})
          `;
          if (conflict) throw new ConflictException('Codeforces handle đã thuộc tài khoản khác');
          await transaction`
            INSERT INTO codeforces_accounts (
              user_id, handle, verification_status, verified_at, verified_by,
              reward_eligible_from, sync_status, next_sync_at
            ) VALUES (
              ${userId}, ${input.codeforcesHandle}, 'ADMIN_VERIFIED', now(), ${actor.userId},
              now(), 'INITIALIZING', now()
            )
            ON CONFLICT (user_id) DO UPDATE SET
              handle = EXCLUDED.handle, pending_handle = NULL,
              verification_status = 'ADMIN_VERIFIED', verified_at = now(),
              verified_by = ${actor.userId}, reward_eligible_from = now(),
              sync_status = 'INITIALIZING', backfill_completed_at = NULL,
              backfill_next_from = 1, last_sync_error = NULL, next_sync_at = now(),
              updated_at = now()
          `;
        }
        const [after] = await transaction`
          SELECT users.full_name, users.display_name, users.avatar_url, users.status,
            users.system_role, credentials.email, skill.cc_base,
            accounts.handle AS codeforces_handle, accounts.pending_handle
          FROM users
          LEFT JOIN user_credentials AS credentials ON credentials.user_id = users.id
          LEFT JOIN user_skill_state AS skill ON skill.user_id = users.id
          LEFT JOIN codeforces_accounts AS accounts ON accounts.user_id = users.id
          WHERE users.id = ${userId}
        `;
        await transaction`
          INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, before, after, reason)
          VALUES (${actor.userId}, 'USER_UPDATED', 'user', ${userId},
            ${JSON.stringify(before)}::jsonb, ${JSON.stringify(after ?? user ?? null)}::jsonb,
            ${input.reason})
        `;
        return after ?? user;
      });
      return { user: updated };
    } catch (error) {
      this.rethrowConflict(error);
    }
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

  private rethrowConflict(error: unknown): never {
    if (error instanceof ConflictException) throw error;
    if (this.postgresCode(error) === '23505') {
      throw new ConflictException('Email hoặc Codeforces handle đã được sử dụng');
    }
    throw error;
  }

  private postgresCode(error: unknown): string | undefined {
    return typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : undefined;
  }
}
