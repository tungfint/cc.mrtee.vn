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
import { SyncQueueService } from '../sync/sync-queue.service';

const handleSchema = z
  .string()
  .trim()
  .min(3)
  .max(24)
  .regex(/^[A-Za-z0-9_.-]+$/, 'Codeforces handle không hợp lệ');

export interface AccountRow {
  id: string;
  user_id: string;
  handle: string;
  pending_handle: string | null;
  current_rating: number | null;
  max_rating: number | null;
  rank: string | null;
  max_rank: string | null;
  verification_status: 'UNVERIFIED' | 'TEACHER_VERIFIED' | 'ADMIN_VERIFIED';
  verified_at: Date | string | null;
  reward_eligible_from: Date | string | null;
  sync_status: string;
  last_sync_at: Date | string | null;
  next_sync_at: Date | string | null;
  backfill_completed_at: Date | string | null;
  last_sync_error: string | null;
}

@Injectable()
export class CodeforcesAccountsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly authorization: AuthorizationService,
    private readonly syncQueue: SyncQueueService,
  ) {}

  async link(user: AuthUser, handleInput: unknown): Promise<AccountRow> {
    const parsed = handleSchema.safeParse(handleInput);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const [existing] = await this.database.sql<AccountRow[]>`
      SELECT * FROM codeforces_accounts WHERE user_id = ${user.userId}
    `;
    if (existing && existing.verification_status !== 'UNVERIFIED') {
      if (existing.handle.toLowerCase() === parsed.data.toLowerCase()) return existing;
      try {
        const [conflict] = await this.database.sql`
          SELECT user_id FROM codeforces_accounts
          WHERE user_id <> ${user.userId}
            AND (handle = ${parsed.data} OR pending_handle = ${parsed.data})
        `;
        if (conflict) throw new ConflictException('Codeforces handle đã được sử dụng');
        const [account] = await this.database.sql.begin(async (transaction) => {
          const [updated] = await transaction<AccountRow[]>`
            UPDATE codeforces_accounts SET pending_handle = ${parsed.data}, updated_at = now()
            WHERE user_id = ${user.userId}
            RETURNING *
          `;
          await transaction`
            INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, before, after)
            VALUES (${user.userId}, 'CODEFORCES_HANDLE_CHANGE_REQUESTED', 'codeforces_account',
              ${existing.id}, ${JSON.stringify(existing)}::jsonb,
              ${JSON.stringify(updated ?? null)}::jsonb)
          `;
          return [updated];
        });
        if (!account) throw new Error('Failed to request Codeforces handle change');
        return account;
      } catch (error) {
        if (error instanceof ConflictException || this.postgresCode(error) === '23505') {
          throw new ConflictException('Codeforces handle đã được sử dụng');
        }
        throw error;
      }
    }
    try {
      const [account] = await this.database.sql<AccountRow[]>`
        INSERT INTO codeforces_accounts (user_id, handle)
        VALUES (${user.userId}, ${parsed.data})
        ON CONFLICT (user_id) DO UPDATE SET
          handle = EXCLUDED.handle,
          pending_handle = NULL,
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

  async approveHandleChange(input: {
    organizationId?: string;
    targetUserId: string;
    actor: AuthUser;
    reason: string;
  }): Promise<AccountRow> {
    await this.assertCanApproveChange(input.organizationId, input.targetUserId, input.actor);
    try {
      return await this.database.sql.begin(async (transaction) => {
        const [before] = await transaction<AccountRow[]>`
          SELECT * FROM codeforces_accounts WHERE user_id = ${input.targetUserId} FOR UPDATE
        `;
        if (!before?.pending_handle) {
          throw new BadRequestException('Không có yêu cầu đổi Codeforces handle đang chờ');
        }
        const [conflict] = await transaction`
          SELECT user_id FROM codeforces_accounts
          WHERE user_id <> ${input.targetUserId} AND handle = ${before.pending_handle}
        `;
        if (conflict) throw new ConflictException('Codeforces handle đã được sử dụng');
        const [account] = await transaction<AccountRow[]>`
          UPDATE codeforces_accounts SET
            handle = pending_handle, pending_handle = NULL,
            verification_status = 'ADMIN_VERIFIED', verified_at = now(),
            verified_by = ${input.actor.userId}, reward_eligible_from = now(),
            sync_status = 'INITIALIZING', backfill_completed_at = NULL,
            backfill_next_from = 1, last_sync_error = NULL, next_sync_at = now(),
            current_rating = NULL, max_rating = NULL, rank = NULL, max_rank = NULL,
            updated_at = now()
          WHERE user_id = ${input.targetUserId}
          RETURNING *
        `;
        if (!account) throw new NotFoundException('Không tìm thấy tài khoản Codeforces');
        await transaction`
          INSERT INTO audit_logs (
            actor_user_id, action, entity_type, entity_id, before, after, reason
          ) VALUES (
            ${input.actor.userId}, 'CODEFORCES_HANDLE_CHANGE_APPROVED', 'codeforces_account',
            ${account.id}, ${JSON.stringify(before)}::jsonb, ${JSON.stringify(account)}::jsonb,
            ${input.reason}
          )
        `;
        return account;
      });
    } catch (error) {
      if (error instanceof ConflictException || this.postgresCode(error) === '23505') {
        throw new ConflictException('Codeforces handle đã được sử dụng');
      }
      throw error;
    }
  }

  async rejectHandleChange(input: {
    organizationId?: string;
    targetUserId: string;
    actor: AuthUser;
    reason: string;
  }): Promise<AccountRow> {
    await this.assertCanApproveChange(input.organizationId, input.targetUserId, input.actor);
    return this.database.sql.begin(async (transaction) => {
      const [before] = await transaction<AccountRow[]>`
        SELECT * FROM codeforces_accounts WHERE user_id = ${input.targetUserId} FOR UPDATE
      `;
      if (!before?.pending_handle) {
        throw new BadRequestException('Không có yêu cầu đổi Codeforces handle đang chờ');
      }
      const [account] = await transaction<AccountRow[]>`
        UPDATE codeforces_accounts SET pending_handle = NULL, updated_at = now()
        WHERE user_id = ${input.targetUserId}
        RETURNING *
      `;
      if (!account) throw new NotFoundException('Không tìm thấy tài khoản Codeforces');
      await transaction`
        INSERT INTO audit_logs (
          actor_user_id, action, entity_type, entity_id, before, after, reason
        ) VALUES (
          ${input.actor.userId}, 'CODEFORCES_HANDLE_CHANGE_REJECTED', 'codeforces_account',
          ${account.id}, ${JSON.stringify(before)}::jsonb, ${JSON.stringify(account)}::jsonb,
          ${input.reason}
        )
      `;
      return account;
    });
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

  async requestSync(user: AuthUser): Promise<{ queued: boolean; status: string }> {
    const account = await this.getOwn(user.userId);
    if (!account || account.verification_status === 'UNVERIFIED') {
      throw new ForbiddenException('Chỉ tài khoản Codeforces đã xác minh mới được đồng bộ');
    }
    const queued = await this.enqueueAccount(account, 'HIGH');
    return { queued, status: queued ? 'QUEUED' : account.sync_status };
  }

  async requestAdminSync(input: {
    scope: 'USER' | 'ORGANIZATION' | 'ALL';
    organizationId?: string;
    targetUserId?: string;
    actor: AuthUser;
  }): Promise<{ scope: string; matched: number; queued: number; skipped: number }> {
    let accounts: AccountRow[];
    if (input.scope === 'ALL') {
      if (input.actor.systemRole !== 'SYSTEM_ADMIN') {
        throw new ForbiddenException('Chỉ System Admin được đồng bộ toàn hệ thống');
      }
      accounts = await this.database.sql<AccountRow[]>`
        SELECT accounts.* FROM codeforces_accounts AS accounts
        JOIN users ON users.id = accounts.user_id
        WHERE accounts.verification_status <> 'UNVERIFIED' AND users.status = 'ACTIVE'
        ORDER BY accounts.created_at
      `;
    } else if (input.scope === 'USER') {
      if (!input.targetUserId) throw new BadRequestException('Chọn tài khoản cần đồng bộ');
      if (input.actor.systemRole === 'SYSTEM_ADMIN') {
        accounts = await this.database.sql<AccountRow[]>`
          SELECT accounts.* FROM codeforces_accounts AS accounts
          JOIN users ON users.id = accounts.user_id
          WHERE accounts.user_id = ${input.targetUserId}
            AND accounts.verification_status <> 'UNVERIFIED'
            AND users.status = 'ACTIVE'
        `;
      } else {
        if (!input.organizationId) throw new BadRequestException('Chọn lớp cần đồng bộ');
        const access = await this.authorization.organizationAccess(
          input.organizationId,
          input.actor,
        );
        this.authorization.assertCanTeach(access, input.actor);
        accounts = await this.database.sql<AccountRow[]>`
          SELECT accounts.* FROM codeforces_accounts AS accounts
          JOIN users ON users.id = accounts.user_id
          JOIN organization_memberships AS memberships
            ON memberships.user_id = accounts.user_id
            AND memberships.organization_id = ${input.organizationId}
            AND memberships.status = 'ACTIVE'
          WHERE accounts.user_id = ${input.targetUserId}
            AND accounts.verification_status <> 'UNVERIFIED'
            AND users.status = 'ACTIVE'
        `;
      }
    } else {
      if (!input.organizationId) throw new BadRequestException('Chọn lớp cần đồng bộ');
      const access = await this.authorization.organizationAccess(input.organizationId, input.actor);
      this.authorization.assertCanTeach(access, input.actor);
      accounts = await this.database.sql<AccountRow[]>`
        SELECT accounts.* FROM codeforces_accounts AS accounts
        JOIN users ON users.id = accounts.user_id
        JOIN organization_memberships AS memberships
          ON memberships.user_id = accounts.user_id
          AND memberships.organization_id = ${input.organizationId}
          AND memberships.status = 'ACTIVE'
        WHERE accounts.verification_status <> 'UNVERIFIED' AND users.status = 'ACTIVE'
        ORDER BY accounts.created_at
      `;
    }

    let queued = 0;
    for (const account of accounts) {
      if (await this.enqueueAccount(account, 'HIGH')) queued += 1;
    }
    const result = {
      scope: input.scope,
      matched: accounts.length,
      queued,
      skipped: accounts.length - queued,
    };
    const auditEntityType =
      input.scope === 'ALL' ? 'system' : input.scope === 'USER' ? 'user' : 'organization';
    const auditEntityId =
      input.scope === 'ALL'
        ? 'all'
        : input.scope === 'USER'
          ? input.targetUserId!
          : input.organizationId!;
    await this.database.sql`
      INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, after, reason)
      VALUES (
        ${input.actor.userId}, 'CODEFORCES_SYNC_BATCH_REQUESTED',
        ${auditEntityType}, ${auditEntityId},
        ${JSON.stringify({ ...result, targetUserId: input.targetUserId ?? null })}::jsonb,
        ${`Yêu cầu đồng bộ Codeforces phạm vi ${input.scope}`}
      )
    `;
    return result;
  }

  async verify(input: {
    organizationId?: string;
    targetUserId: string;
    actor: AuthUser;
    reason: string;
  }): Promise<AccountRow> {
    const access = input.organizationId
      ? await this.authorization.organizationAccess(input.organizationId, input.actor)
      : null;
    if (input.actor.systemRole !== 'SYSTEM_ADMIN') {
      if (!input.organizationId || !access) {
        throw new ForbiddenException('Giáo viên chỉ được xác minh học sinh trong lớp của mình');
      }
      this.authorization.assertCanTeach(access, input.actor);
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
      input.actor.systemRole === 'SYSTEM_ADMIN' || access?.membershipRole === 'ORG_ADMIN'
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
      const verifiedAt = this.timestamp(account.verified_at);
      const eligibleFrom = this.timestamp(account.reward_eligible_from);
      if (verifiedAt === null || eligibleFrom === null || verifiedAt !== eligibleFrom) {
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

  async verifyBatch(input: {
    organizationId?: string;
    targetUserIds: string[];
    actor: AuthUser;
    reason: string;
  }): Promise<{ requested: number; verified: number; skipped: number; results: object[] }> {
    if (input.actor.systemRole !== 'SYSTEM_ADMIN' && !input.organizationId) {
      throw new ForbiddenException('Giáo viên phải chọn lớp cần xác minh');
    }
    const targetUserIds = [...new Set(input.targetUserIds)];
    const results: object[] = [];
    let verified = 0;
    for (const targetUserId of targetUserIds) {
      try {
        const account = await this.verify({
          actor: input.actor,
          targetUserId,
          reason: input.reason,
          ...(input.organizationId ? { organizationId: input.organizationId } : {}),
        });
        verified += 1;
        results.push({ userId: targetUserId, success: true, status: account.verification_status });
      } catch (error) {
        if (
          error instanceof NotFoundException ||
          error instanceof ConflictException ||
          error instanceof ForbiddenException
        ) {
          results.push({
            userId: targetUserId,
            success: false,
            message: error.message,
          });
          continue;
        }
        throw error;
      }
    }
    return {
      requested: targetUserIds.length,
      verified,
      skipped: targetUserIds.length - verified,
      results,
    };
  }

  private async assertCanApproveChange(
    organizationId: string | undefined,
    targetUserId: string,
    actor: AuthUser,
  ): Promise<void> {
    if (actor.systemRole === 'SYSTEM_ADMIN') return;
    if (!organizationId) {
      throw new ForbiddenException('Admin lớp phải chọn lớp của học sinh');
    }
    const access = await this.authorization.organizationAccess(organizationId, actor);
    if (access.membershipRole !== 'ORG_ADMIN') {
      throw new ForbiddenException('Chỉ Admin được duyệt thay đổi Codeforces handle');
    }
    const [membership] = await this.database.sql`
      SELECT id FROM organization_memberships
      WHERE organization_id = ${organizationId} AND user_id = ${targetUserId}
        AND status = 'ACTIVE'
    `;
    if (!membership) throw new ForbiddenException('Học sinh không thuộc lớp của Admin');
  }

  private async enqueueAccount(account: AccountRow, priority: 'HIGH' | 'LOW'): Promise<boolean> {
    const queued = await this.syncQueue.enqueue(
      {
        userId: account.user_id,
        accountId: account.id,
        handle: account.handle,
        mode: account.backfill_completed_at ? 'INCREMENTAL' : 'BACKFILL',
      },
      priority,
    );
    if (queued) {
      await this.database.sql`
        UPDATE codeforces_accounts
        SET sync_status = 'QUEUED', updated_at = now()
        WHERE id = ${account.id}
      `;
    }
    return queued;
  }

  private timestamp(value: Date | string | null): number | null {
    if (value === null) return null;
    const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  private postgresCode(error: unknown): string | undefined {
    return typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : undefined;
  }
}
