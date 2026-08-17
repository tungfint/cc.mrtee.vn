import { BadRequestException, Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, OptionalAuth } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { RewardsService } from './rewards.service';
import { RateLimitService } from '../rate-limit/rate-limit.service';

const redeemSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(120),
});
const transitionSchema = z.object({
  status: z.enum(['APPROVED', 'FULFILLED', 'REJECTED', 'CANCELLED']),
  note: z.string().trim().min(3).max(500),
});

@Controller()
export class RewardsController {
  constructor(
    private readonly rewards: RewardsService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @OptionalAuth()
  @Get('rewards')
  async catalog() {
    return { rewards: await this.rewards.catalog() };
  }

  @Post('rewards/:id/redeem')
  async redeem(@Param('id') idInput: string, @Body() body: unknown, @CurrentUser() user: AuthUser) {
    const id = z.string().uuid().safeParse(idInput);
    const input = redeemSchema.safeParse(body);
    if (!id.success || !input.success) throw new BadRequestException('Dữ liệu không hợp lệ');
    await this.rateLimit.consume(`redeem:${user.userId}`, 5, 60);
    return this.rewards.redeem(user.userId, id.data, input.data.idempotencyKey);
  }

  @Get('me/reward-orders')
  async orders(@CurrentUser() user: AuthUser) {
    return { orders: await this.rewards.orders(user.userId) };
  }

  @Patch('reward-orders/:id/status')
  transition(@Param('id') idInput: string, @Body() body: unknown, @CurrentUser() user: AuthUser) {
    const id = z.string().uuid().safeParse(idInput);
    const input = transitionSchema.safeParse(body);
    if (!id.success || !input.success) throw new BadRequestException('Dữ liệu không hợp lệ');
    return this.rewards.transitionOrder(id.data, input.data.status, user, input.data.note);
  }
}
