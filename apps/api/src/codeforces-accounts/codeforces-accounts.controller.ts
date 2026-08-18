import { BadRequestException, Body, Controller, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { CodeforcesAccountsService } from './codeforces-accounts.service';
import { RateLimitService } from '../rate-limit/rate-limit.service';

const linkSchema = z.object({ handle: z.string() });
const verifySchema = z.object({ reason: z.string().trim().min(3).max(500) });
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
