import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, RequireSystemRole } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { NotificationsService } from './notifications.service';

const listSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(5).max(50).default(20),
});
const createSchema = z
  .object({
    title: z.string().trim().min(3).max(200),
    body: z.string().trim().min(1).max(5000),
    audience: z.enum(['ALL', 'USER', 'ORGANIZATION']),
    targetUserId: z.string().uuid().optional(),
    targetOrganizationId: z.string().uuid().optional(),
    tickerText: z.string().trim().max(300).optional().default(''),
    tickerDurationMinutes: z.coerce.number().int().min(0).max(10080).default(0),
    publishAt: z.coerce.date().default(() => new Date()),
  })
  .superRefine((value, context) => {
    if (value.audience === 'USER' && !value.targetUserId) {
      context.addIssue({ code: 'custom', path: ['targetUserId'], message: 'Chọn học sinh' });
    }
    if (value.audience === 'ORGANIZATION' && !value.targetOrganizationId) {
      context.addIssue({ code: 'custom', path: ['targetOrganizationId'], message: 'Chọn lớp' });
    }
    if (value.tickerText && value.tickerDurationMinutes < 1) {
      context.addIssue({
        code: 'custom',
        path: ['tickerDurationMinutes'],
        message: 'Nhập thời lượng',
      });
    }
  });

@Controller()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('notifications/summary')
  summary(@CurrentUser() user: AuthUser) {
    return this.notifications.summary(user.userId);
  }

  @Get('notifications')
  list(@Query() query: unknown, @CurrentUser() user: AuthUser) {
    const input = listSchema.parse(query);
    return this.notifications.list(user.userId, input.page, input.pageSize);
  }

  @Post('notifications/:id/read')
  markRead(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.notifications.markRead(user.userId, this.uuid(id));
  }

  @Post('notifications/read-all')
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user.userId);
  }

  @RequireSystemRole('SYSTEM_ADMIN')
  @Get('admin/notifications')
  adminList() {
    return this.notifications.adminList();
  }

  @RequireSystemRole('SYSTEM_ADMIN')
  @Post('admin/notifications')
  create(@Body() body: unknown, @CurrentUser() actor: AuthUser) {
    const input = createSchema.safeParse(body);
    if (!input.success) {
      throw new BadRequestException(input.error.issues.map((issue) => issue.message).join('; '));
    }
    return this.notifications.create(input.data, actor);
  }

  @RequireSystemRole('SYSTEM_ADMIN')
  @Delete('admin/notifications/:id')
  archive(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.notifications.archive(this.uuid(id), actor);
  }

  private uuid(value: string) {
    const parsed = z.string().uuid().safeParse(value);
    if (!parsed.success) throw new BadRequestException('ID thông báo không hợp lệ');
    return parsed.data;
  }
}
