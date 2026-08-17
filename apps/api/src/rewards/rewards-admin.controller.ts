import { BadRequestException, Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, RequireSystemRole } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { DatabaseService } from '../database/database.service';

const rewardSchema = z.object({
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().min(2).max(2000),
  cost: z.coerce.number().positive().max(1_000_000),
  stock: z.coerce.number().int().nonnegative().nullable().default(null),
  active: z.boolean().default(true),
  imageUrl: z.string().url().max(2000).nullable().default(null),
});

@RequireSystemRole('SYSTEM_ADMIN')
@Controller('admin/rewards')
export class RewardsAdminController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  async list() {
    return { rewards: await this.database.sql`SELECT * FROM rewards ORDER BY created_at DESC` };
  }

  @Get('orders')
  async orders() {
    return {
      orders: await this.database.sql`
        SELECT orders.*, users.display_name, rewards.name AS reward_name
        FROM reward_orders AS orders
        JOIN users ON users.id = orders.user_id
        JOIN rewards ON rewards.id = orders.reward_id
        ORDER BY orders.created_at DESC LIMIT 200
      `,
    };
  }

  @Post()
  create(@Body() body: unknown, @CurrentUser() actor: AuthUser) {
    const parsed = rewardSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Dữ liệu phần thưởng không hợp lệ');
    return this.persist(null, parsed.data, actor);
  }

  @Patch(':id')
  update(@Param('id') idInput: string, @Body() body: unknown, @CurrentUser() actor: AuthUser) {
    const id = z.string().uuid().safeParse(idInput);
    const parsed = rewardSchema.safeParse(body);
    if (!id.success || !parsed.success) throw new BadRequestException('Dữ liệu không hợp lệ');
    return this.persist(id.data, parsed.data, actor);
  }

  private persist(id: string | null, input: z.infer<typeof rewardSchema>, actor: AuthUser) {
    return this.database.sql.begin(async (transaction) => {
      const [before] = id
        ? await transaction`SELECT * FROM rewards WHERE id = ${id} FOR UPDATE`
        : [];
      const [reward] = id
        ? await transaction`
            UPDATE rewards SET
              name = ${input.name}, description = ${input.description}, cost = ${input.cost},
              stock = ${input.stock}, active = ${input.active}, image_url = ${input.imageUrl},
              updated_at = now()
            WHERE id = ${id} RETURNING *
          `
        : await transaction`
            INSERT INTO rewards (name, description, cost, stock, active, image_url)
            VALUES (
              ${input.name}, ${input.description}, ${input.cost}, ${input.stock},
              ${input.active}, ${input.imageUrl}
            ) RETURNING *
          `;
      if (!reward) throw new BadRequestException('Không tìm thấy phần thưởng');
      await transaction`
        INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, before, after)
        VALUES (
          ${actor.userId}, ${id ? 'REWARD_UPDATED' : 'REWARD_CREATED'}, 'reward',
          ${String(reward.id)}, ${before ? JSON.stringify(before) : null}::jsonb,
          ${JSON.stringify(reward)}::jsonb
        )
      `;
      return { reward };
    });
  }
}
