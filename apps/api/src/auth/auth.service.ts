import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { EnvironmentService } from '../config/environment';
import { DatabaseService } from '../database/database.service';
import { hashPassword, hashToken, verifyPassword } from './password';
import type { AuthUser } from './auth.types';

const emailSchema = z
  .string()
  .trim()
  .email()
  .max(320)
  .transform((value) => value.toLowerCase());
const passwordSchema = z.string().min(12).max(200);

interface CredentialRow {
  user_id: string;
  display_name: string;
  system_role: AuthUser['systemRole'];
  status: string;
  password_hash: string;
  failed_login_attempts: number;
  locked_until: Date | null;
  must_change_password: boolean;
}

export interface LoginResult {
  sessionToken: string;
  csrfToken: string;
  expiresAt: Date;
  user: Omit<AuthUser, 'sessionId' | 'csrfTokenHash'>;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly environment: EnvironmentService,
  ) {}

  async login(emailInput: unknown, passwordInput: unknown): Promise<LoginResult> {
    const email = emailSchema.parse(emailInput);
    const password = passwordSchema.parse(passwordInput);
    const [credential] = await this.database.sql<CredentialRow[]>`
      SELECT
        credentials.user_id,
        users.display_name,
        users.system_role,
        users.status,
        credentials.password_hash,
        credentials.failed_login_attempts,
        credentials.locked_until,
        credentials.must_change_password
      FROM user_credentials AS credentials
      JOIN users ON users.id = credentials.user_id
      WHERE credentials.email = ${email}
    `;

    if (!credential || credential.status !== 'ACTIVE') {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }
    if (credential.locked_until && credential.locked_until > new Date()) {
      throw new UnauthorizedException('Tài khoản tạm khóa do đăng nhập sai nhiều lần');
    }

    const valid = await verifyPassword(password, credential.password_hash);
    if (!valid) {
      await this.database.sql`
        UPDATE user_credentials
        SET
          failed_login_attempts = failed_login_attempts + 1,
          locked_until = CASE
            WHEN failed_login_attempts + 1 >= 5 THEN now() + interval '15 minutes'
            ELSE locked_until
          END,
          updated_at = now()
        WHERE user_id = ${credential.user_id}
      `;
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }

    const sessionToken = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(
      Date.now() + this.environment.values.SESSION_TTL_HOURS * 60 * 60 * 1000,
    );

    await this.database.sql.begin(async (transaction) => {
      await transaction`
        UPDATE user_credentials
        SET failed_login_attempts = 0, locked_until = NULL, updated_at = now()
        WHERE user_id = ${credential.user_id}
      `;
      await transaction`
        INSERT INTO auth_sessions (user_id, token_hash, csrf_token_hash, expires_at)
        VALUES (
          ${credential.user_id},
          ${hashToken(sessionToken)},
          ${hashToken(csrfToken)},
          ${expiresAt.toISOString()}
        )
      `;
    });

    return {
      sessionToken,
      csrfToken,
      expiresAt,
      user: {
        userId: credential.user_id,
        displayName: credential.display_name,
        systemRole: credential.system_role,
        mustChangePassword: credential.must_change_password,
      },
    };
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.database.sql`
      UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, now()) WHERE id = ${sessionId}
    `;
  }

  async createUser(
    input: {
      email: unknown;
      password: unknown;
      fullName: string;
      displayName: string;
      systemRole?: AuthUser['systemRole'];
      leaderboardVisible?: boolean;
      organizationId?: string;
      codeforcesHandle?: string;
      initialCcLevel?: number;
      mustChangePassword?: boolean;
      verifyCodeforces?: boolean;
    },
    audit?: {
      actorUserId: string;
      after: Record<string, unknown>;
    },
  ): Promise<string> {
    const email = emailSchema.parse(input.email);
    const password = passwordSchema.parse(input.password);
    const passwordHash = await hashPassword(password);
    const created = await this.database.sql.begin(async (transaction) => {
      const [user] = await transaction<{ id: string }[]>`
        WITH new_user AS (
          INSERT INTO users (full_name, display_name, system_role, leaderboard_visible)
          VALUES (
            ${input.fullName.trim()},
            ${input.displayName.trim()},
            ${input.systemRole ?? 'USER'},
            ${input.leaderboardVisible ?? (input.systemRole === undefined || input.systemRole === 'USER')}
          )
          RETURNING id
        )
        INSERT INTO user_credentials (user_id, email, password_hash, must_change_password)
        SELECT id, ${email}, ${passwordHash}, ${input.mustChangePassword ?? false} FROM new_user
        RETURNING user_id AS id
      `;
      if (user) {
        const initialCcLevel = input.initialCcLevel ?? 800;
        await transaction`
          INSERT INTO user_skill_state (user_id, cc_base, cc_calculated, cc_level)
          VALUES (${user.id}, ${initialCcLevel}, 0, ${initialCcLevel})
        `;
        if (input.organizationId) {
          await transaction`
            INSERT INTO organization_memberships (organization_id, user_id, role)
            VALUES (${input.organizationId}, ${user.id}, 'MEMBER')
          `;
        }
        if (input.codeforcesHandle) {
          await transaction`
            INSERT INTO codeforces_accounts (
              user_id, handle, verification_status, verified_at, verified_by,
              reward_eligible_from, sync_status, next_sync_at
            ) VALUES (
              ${user.id}, ${input.codeforcesHandle},
              ${input.verifyCodeforces ? 'ADMIN_VERIFIED' : 'UNVERIFIED'},
              ${input.verifyCodeforces ? new Date().toISOString() : null},
              ${input.verifyCodeforces ? (audit?.actorUserId ?? null) : null},
              ${input.verifyCodeforces ? new Date().toISOString() : null},
              ${input.verifyCodeforces ? 'INITIALIZING' : 'UNVERIFIED'},
              ${input.verifyCodeforces ? new Date().toISOString() : null}
            )
          `;
        }
      }
      if (user && audit) {
        await transaction`
          INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, after)
          VALUES (
            ${audit.actorUserId}, 'USER_CREATED', 'user', ${user.id},
            ${JSON.stringify(audit.after)}::jsonb
          )
        `;
      }
      return user;
    });
    if (!created) {
      throw new Error('Failed to create user');
    }
    return created.id;
  }
}
