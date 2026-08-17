import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth.types';
import { AuthorizationService } from '../authorization/authorization.service';
import { DatabaseService } from '../database/database.service';

const handleSchema = z
  .string()
  .trim()
  .min(3)
  .max(24)
  .regex(/^[A-Za-z0-9_.-]+$/, 'Codeforces handle không hợp lệ');

interface AccountRow {
  id: string;
  user_id: string;
  handle: string;
  verification_status: 'UNVERIFIED' | 'TEACHER_VERIFIED' | 'ADMIN_VERIFIED';
  verified_at: Date | null;
  reward_eligible_from: Date | null;
  sync_status: string;
  last_sync_at: Date | null;
  next_sync_at: Date | null;
  backfill_completed_at: Date | null;
  last_sync_error: string | null;
}

@Injectable()
export class CodeforcesAccountsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly authorization: AuthorizationService,
  ) {}

  async link(user: AuthUser, handleInput: unknown): Promise<AccountRow> {
    const parsed = handleSchema.safeParse(handleInput);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const [existing] = await this.database.sql<AccountRow[]>`
      SELECT * FROM codeforces_accounts WHERE user_id = ${user.userId}
    `;
    if (existing && existing.verification_status !== 'UNVERIFIED') {
      throw new ForbiddenException('Handle đã xác minh; cần quản trị viên đặt lại');
    }
    try {
      const [account] = await this.database.sql<AccountRow[]>`
        INSERT INTO codeforces_accounts (user_id, handle)
        VALUES (${user.userId}, ${parsed.data})
        ON CONFLICT (user_id) DO UPDATE SET
          handle = EXCLUDED.handle,
          verification_status = 'UNVERIFIED',
          verified_at = NULL,
          verified_by = NULL,
          reward_eligible_from = NULL,
          sync_status = 'UNVERIFIED',
          last_sync_error = NULL,
          updated_at = now()
        RETURNING *
      `;
      if (!account) throw new Error('Failed to link Codeforces account');
      return account;
    } catch (error) {
      if (this.postgresCode(error) === '23505') {
        throw new ConflictException('Codeforces handle đã được liên kết với người dùng khác');
      }
      throw error;
    }
  }

  async getOwn(userId: string): Promise<(AccountRow & { eligible: boolean }) | null> {
    const [account] = await this.database.sql<AccountRow[]>`
      SELECT * FROM codeforces_accounts WHERE user_id = ${userId}
    `;
    return account
      ? {
          ...account,
          eligible:
            account.verification_status !== 'UNVERIFIED' && account.reward_eligible_from !== null,
        }
      : null;
  }

  async verify(input: {
    organizationId: string;
    targetUserId: string;
    actor: AuthUser;
    reason: string;
  }): Promise<AccountRow> {
    const access = await this.authorization.organizationAccess(input.organizationId, input.actor);
    this.authorization.assertCanTeach(access, input.actor);
    if (input.actor.systemRole !== 'SYSTEM_ADMIN') {
      const [targetMembership] = await this.database.sql`
        SELECT id FROM organization_memberships
        WHERE organization_id = ${input.organizationId}
          AND user_id = ${input.targetUserId}
          AND status = 'ACTIVE'
      `;
      if (!targetMembership) {
        throw new ForbiddenException('Người dùng không thuộc tổ chức của người xác minh');
      }
    }

    const verificationStatus =
      input.actor.systemRole === 'SYSTEM_ADMIN' || access.membershipRole === 'ORG_ADMIN'
        ? 'ADMIN_VERIFIED'
        : 'TEACHER_VERIFIED';
    return this.database.sql.begin(async (transaction) => {
      const [before] = await transaction<AccountRow[]>`
        SELECT * FROM codeforces_accounts WHERE user_id = ${input.targetUserId} FOR UPDATE
      `;
      if (!before) throw new NotFoundException('Người dùng chưa liên kết Codeforces handle');
      if (before.verification_status !== 'UNVERIFIED') {
        throw new ConflictException('Codeforces handle đã được xác minh');
      }

      const [account] = await transaction<AccountRow[]>`
        UPDATE codeforces_accounts
        SET
          verification_status = ${verificationStatus},
          verified_at = now(),
          reward_eligible_from = now(),
          verified_by = ${input.actor.userId},
          sync_status = 'INITIALIZING',
          next_sync_at = now(),
          updated_at = now()
        WHERE user_id = ${input.targetUserId} AND verification_status = 'UNVERIFIED'
        RETURNING *
      `;
      if (!account) throw new ConflictException('Trạng thái xác minh đã thay đổi');
      if (account.verified_at?.getTime() !== account.reward_eligible_from?.getTime()) {
        throw new Error('Verification timestamps must be atomic');
      }
      await transaction`
        INSERT INTO audit_logs (
          actor_user_id, action, entity_type, entity_id, before, after, reason
        ) VALUES (
          ${input.actor.userId},
          'CODEFORCES_ACCOUNT_VERIFIED',
          'codeforces_account',
          ${account.id},
          ${JSON.stringify(before)}::jsonb,
          ${JSON.stringify(account)}::jsonb,
          ${input.reason}
        )
      `;
      return account;
    });
  }

  private postgresCode(error: unknown): string | undefined {
    return typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : undefined;
  }
}
