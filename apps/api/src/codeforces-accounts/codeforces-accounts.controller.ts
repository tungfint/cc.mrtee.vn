import { BadRequestException, Body, Controller, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { CodeforcesAccountsService } from './codeforces-accounts.service';

const linkSchema = z.object({ handle: z.string() });
const verifySchema = z.object({ reason: z.string().trim().min(3).max(500) });
const uuidSchema = z.string().uuid();

@Controller()
export class CodeforcesAccountsController {
  constructor(private readonly accounts: CodeforcesAccountsService) {}

  @Post('me/codeforces-account')
  async link(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    const input = this.parse(linkSchema, body);
    return { account: await this.accounts.link(user, input.handle) };
  }

  @Get('me/codeforces-account')
  async own(@CurrentUser() user: AuthUser) {
    return { account: await this.accounts.getOwn(user.userId) };
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
