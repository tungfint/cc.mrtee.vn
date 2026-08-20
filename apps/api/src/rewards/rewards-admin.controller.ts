import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { z } from 'zod';
import { CurrentUser, RequireSystemRole } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { DatabaseService } from '../database/database.service';
import { RewardImageService } from './reward-image.service';

const rewardImageUrlSchema = z
  .string()
  .trim()
  .max(2000)
  .refine(
    (value) =>
      value.startsWith('/api/uploads/rewards/') ||
      value.startsWith('/mascots/') ||
      z.string().url().safeParse(value).success,
  );

const rewardSchema = z
  .object({
    name: z.string().trim().min(2).max(200),
    description: z.string().trim().min(2).max(2000),
    cost: z.coerce.number().int().positive().max(1_000_000),
    stock: z.coerce.number().int().nonnegative().nullable().default(null),
    active: z.boolean().default(true),
    imageUrl: rewardImageUrlSchema.nullable().default(null),
    cashValueVnd: z.coerce.number().int().positive().max(100_000_000).nullable().default(null),
    category: z.enum(['STANDARD', 'MASCOT', 'ACHIEVEMENT']).default('STANDARD'),
    requiredCcLevel: z.coerce.number().int().min(0).max(10_000).default(0),
    requiresApproval: z.boolean().default(false),
    achievementId: z.string().uuid().nullable().default(null),
  })
  .superRefine((input, context) => {
    if ((input.category === 'ACHIEVEMENT') !== Boolean(input.achievementId)) {
      context.addIssue({
        code: 'custom',
        path: ['achievementId'],
        message: 'Phần thưởng danh hiệu phải liên kết với một danh hiệu',
      });
    }
    if (input.category === 'ACHIEVEMENT' && input.cashValueVnd !== null) {
      context.addIssue({
        code: 'custom',
        path: ['cashValueVnd'],
        message: 'Danh hiệu không thể đồng thời là quà tiền mặt',
      });
    }
    if (input.cashValueVnd !== null && input.requiresApproval) {
      context.addIssue({
        code: 'custom',
        path: ['requiresApproval'],
        message: 'Quy đổi tiền mặt được hoàn tất tự động, không cần duyệt',
      });
    }
  });

@RequireSystemRole('SYSTEM_ADMIN')
@Controller('admin/rewards')
export class RewardsAdminController {
  constructor(
    private readonly database: DatabaseService,
    private readonly images: RewardImageService,
  ) {}

  @Get()
  async list() {
    return {
      rewards: await this.database.sql`
        SELECT rewards.*, achievements.name AS achievement_name,
          achievements.icon AS achievement_icon, achievements.tier AS achievement_tier,
          count(orders.id)::int AS order_count
        FROM rewards
        LEFT JOIN achievements ON achievements.id = rewards.achievement_id
        LEFT JOIN reward_orders AS orders ON orders.reward_id = rewards.id
        GROUP BY rewards.id, achievements.id
        ORDER BY rewards.created_at DESC
      `,
    };
  }

  @Get('orders')
  async orders() {
    return {
      orders: await this.database.sql`
        SELECT orders.*, users.display_name, users.full_name, rewards.name AS reward_name,
          rewards.cash_value_vnd, rewards.requires_approval
        FROM reward_orders AS orders
        JOIN users ON users.id = orders.user_id
        JOIN rewards ON rewards.id = orders.reward_id
        ORDER BY orders.created_at DESC LIMIT 200
      `,
    };
  }

  @Post('image')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024, files: 1 },
      fileFilter: (_request, file, callback) => {
        callback(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype));
      },
    }),
  )
  async uploadImage(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('Chọn ảnh JPG, PNG hoặc WebP tối đa 8 MB');
    return { imageUrl: await this.images.store(file.buffer) };
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

  @Delete(':id')
  async archive(@Param('id') idInput: string, @CurrentUser() actor: AuthUser) {
    const id = z.string().uuid().safeParse(idInput);
    if (!id.success) throw new BadRequestException('ID phần thưởng không hợp lệ');
    const reward = await this.database.sql.begin(async (transaction) => {
      const [before] = await transaction`SELECT * FROM rewards WHERE id = ${id.data} FOR UPDATE`;
      if (!before) throw new BadRequestException('Không tìm thấy phần thưởng');
      const [usage] = await transaction<{ order_count: number }[]>`
        SELECT count(*)::int AS order_count FROM reward_orders WHERE reward_id = ${id.data}
      `;
      if ((usage?.order_count ?? 0) === 0) {
        await transaction`DELETE FROM rewards WHERE id = ${id.data}`;
        await transaction`
          INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, before, after, reason)
          VALUES (${actor.userId}, 'REWARD_DELETED', 'reward', ${id.data},
            ${JSON.stringify(before)}::jsonb, null,
            'Xoá phần thưởng chưa phát sinh yêu cầu đổi quà')
        `;
        return { reward: before, deleted: true, archived: false };
      }
      const [updated] = await transaction`
        UPDATE rewards SET active = false, updated_at = now()
        WHERE id = ${id.data} RETURNING *
      `;
      await transaction`
        INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, before, after, reason)
        VALUES (${actor.userId}, 'REWARD_ARCHIVED', 'reward', ${id.data},
          ${JSON.stringify(before)}::jsonb, ${JSON.stringify(updated ?? null)}::jsonb,
          'Lưu trữ phần thưởng khỏi danh mục')
      `;
      return { reward: updated, deleted: false, archived: true };
    });
    return reward;
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
              cash_value_vnd = ${input.cashValueVnd},
              category = ${input.category}, required_cc_level = ${input.requiredCcLevel},
              requires_approval = ${input.requiresApproval},
              achievement_id = ${input.achievementId},
              updated_at = now()
            WHERE id = ${id} RETURNING *
          `
        : await transaction`
            INSERT INTO rewards (
              name, description, cost, stock, active, image_url, cash_value_vnd,
              category, required_cc_level, requires_approval, achievement_id
            )
            VALUES (
              ${input.name}, ${input.description}, ${input.cost}, ${input.stock},
              ${input.active}, ${input.imageUrl}, ${input.cashValueVnd},
              ${input.category}, ${input.requiredCcLevel}, ${input.requiresApproval},
              ${input.achievementId}
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
