import { BadRequestException, Body, Controller, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { CodeforcesAccountsService } from './codeforces-accounts.service';
import { RateLimitService } from '../rate-limit/rate-limit.service';

const linkSchema = z.object({ handle: z.string() });
const verifySchema = z.object({ reason: z.string().trim().min(3).max(500) });
const verifyBatchSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(500),
  organizationId: z.string().uuid().optional(),
  reason: z.string().trim().min(3).max(500),
});
const adminSyncSchema = z
  .object({
    scope: z.enum(['USER', 'ORGANIZATION', 'ALL']),
    organizationId: z.string().uuid().optional(),
    targetUserId: z.string().uuid().optional(),
  })
  .superRefine((value, context) => {
    if (value.scope !== 'ALL' && !value.organizationId) {
      context.addIssue({ code: 'custom', message: 'Chọn lớp cần đồng bộ' });
    }
    if (value.scope === 'USER' && !value.targetUserId) {
      context.addIssue({ code: 'custom', message: 'Chọn tài khoản cần đồng bộ' });
    }
  });
const uuidSchema = z.string().uuid();

@Controller()
export class CodeforcesAccountsController {
  constructor(
    private readonly accounts: CodeforcesAccountsService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Post('me/codeforces-account')
  async link(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    const input = this.parse(linkSchema, body);
    return { account: await this.accounts.link(user, input.handle) };
  }

  @Get('me/codeforces-account')
  async own(@CurrentUser() user: AuthUser) {
    return { account: await this.accounts.getOwn(user.userId) };
  }

  @Post('me/sync')
  async sync(@CurrentUser() user: AuthUser) {
    await this.rateLimit.consume(`sync:${user.userId}`, 1, 120);
    return this.accounts.requestSync(user);
  }

  @Get('me/sync-status')
  async syncStatus(@CurrentUser() user: AuthUser) {
    const account = await this.accounts.getOwn(user.userId);
    return {
      status: account?.sync_status ?? 'UNLINKED',
      lastSyncAt: account?.last_sync_at ?? null,
      nextSyncAt: account?.next_sync_at ?? null,
      lastError: account?.last_sync_error ?? null,
    };
  }

  @Post('admin/codeforces-sync')
  async adminSync(@Body() body: unknown, @CurrentUser() actor: AuthUser) {
    const input = this.parse(adminSyncSchema, body);
    return this.accounts.requestAdminSync({
      actor,
      scope: input.scope,
      ...(input.organizationId ? { organizationId: input.organizationId } : {}),
      ...(input.targetUserId ? { targetUserId: input.targetUserId } : {}),
    });
  }

  @Post('admin/codeforces-accounts/verify')
  async verifyBatch(@Body() body: unknown, @CurrentUser() actor: AuthUser) {
    const input = this.parse(verifyBatchSchema, body);
    return this.accounts.verifyBatch({
      actor,
      targetUserIds: input.userIds,
      reason: input.reason,
      ...(input.organizationId ? { organizationId: input.organizationId } : {}),
    });
  }

  @Post('admin/codeforces-accounts/:userId/approve-change')
  async adminApproveChange(
    @Param('userId') targetUserIdInput: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthUser,
  ) {
    const input = this.parse(verifySchema, body);
    return {
      account: await this.accounts.approveHandleChange({
        targetUserId: this.uuid(targetUserIdInput),
        actor,
        reason: input.reason,
      }),
    };
  }

  @Post('admin/codeforces-accounts/:userId/reject-change')
  async adminRejectChange(
    @Param('userId') targetUserIdInput: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthUser,
  ) {
    const input = this.parse(verifySchema, body);
    return {
      account: await this.accounts.rejectHandleChange({
        targetUserId: this.uuid(targetUserIdInput),
        actor,
        reason: input.reason,
      }),
    };
  }

  @Post('organizations/:organizationId/codeforces-accounts/:userId/verify')
  async verify(
    @Param('organizationId') organizationIdInput: string,
    @Param('userId') targetUserIdInput: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthUser,
  ) {
    const organizationId = this.uuid(organizationIdInput);
    const targetUserId = this.uuid(targetUserIdInput);
    const input = this.parse(verifySchema, body);
    return {
      account: await this.accounts.verify({
        organizationId,
        targetUserId,
        actor,
        reason: input.reason,
      }),
    };
  }

  @Post('organizations/:organizationId/codeforces-accounts/:userId/approve-change')
  async approveChange(
    @Param('organizationId') organizationIdInput: string,
    @Param('userId') targetUserIdInput: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthUser,
  ) {
    const organizationId = this.uuid(organizationIdInput);
    const targetUserId = this.uuid(targetUserIdInput);
    const input = this.parse(verifySchema, body);
    return {
      account: await this.accounts.approveHandleChange({
        organizationId,
        targetUserId,
        actor,
        reason: input.reason,
      }),
    };
  }

  @Post('organizations/:organizationId/codeforces-accounts/:userId/reject-change')
  async rejectChange(
    @Param('organizationId') organizationIdInput: string,
    @Param('userId') targetUserIdInput: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthUser,
  ) {
    const organizationId = this.uuid(organizationIdInput);
    const targetUserId = this.uuid(targetUserIdInput);
    const input = this.parse(verifySchema, body);
    return {
      account: await this.accounts.rejectHandleChange({
        organizationId,
        targetUserId,
        actor,
        reason: input.reason,
      }),
    };
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
