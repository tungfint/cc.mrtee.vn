import { BadRequestException, Body, Controller, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { AuthService } from '../auth/auth.service';
import { CurrentUser, RequireSystemRole } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { DatabaseService } from '../database/database.service';

const createUserSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(12).max(200),
  fullName: z.string().trim().min(2).max(200),
  displayName: z.string().trim().min(2).max(100),
  systemRole: z.enum(['USER', 'SYSTEM_ADMIN']).default('USER'),
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
      SELECT id, full_name, display_name, status, system_role, timezone, created_at
      FROM users WHERE id = ${user.userId}
    `;
    const memberships = await this.database.sql`
      SELECT
        memberships.organization_id,
        organizations.name AS organization_name,
        memberships.role,
        memberships.status
      FROM organization_memberships AS memberships
      JOIN organizations ON organizations.id = memberships.organization_id
      WHERE memberships.user_id = ${user.userId} AND memberships.status = 'ACTIVE'
      ORDER BY organizations.name
    `;
    return { user: profile, memberships };
  }

  @RequireSystemRole('SYSTEM_ADMIN')
  @Post('admin/users')
  async createUser(@Body() body: unknown, @CurrentUser() actor: AuthUser) {
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const userId = await this.auth.createUser(parsed.data, {
      actorUserId: actor.userId,
      after: {
        email: parsed.data.email.toLowerCase(),
        fullName: parsed.data.fullName,
        displayName: parsed.data.displayName,
        systemRole: parsed.data.systemRole,
      },
    });
    return { userId };
  }

  @RequireSystemRole('SYSTEM_ADMIN')
  @Get('admin/users/:id')
  async getUser(@Param('id') id: string) {
    const parsed = z.string().uuid().safeParse(id);
    if (!parsed.success) throw new BadRequestException('ID không hợp lệ');
    const [user] = await this.database.sql`
      SELECT users.id, credentials.email, users.full_name, users.display_name,
        users.status, users.system_role, users.timezone, users.created_at
      FROM users
      LEFT JOIN user_credentials AS credentials ON credentials.user_id = users.id
      WHERE users.id = ${parsed.data}
    `;
    return { user: user ?? null };
  }
}
