import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { CcLevelRecalibrationService } from './cc-level-recalibration.service';

const scopeSchema = z
  .object({
    scope: z.enum(['USER', 'ORGANIZATION', 'ALL']),
    targetUserId: z.string().uuid().optional(),
    organizationId: z.string().uuid().optional(),
  })
  .superRefine((value, context) => {
    if (value.scope === 'USER' && !value.targetUserId) {
      context.addIssue({ code: 'custom', path: ['targetUserId'], message: 'Chọn tài khoản' });
    }
    if (value.scope === 'ORGANIZATION' && !value.organizationId) {
      context.addIssue({ code: 'custom', path: ['organizationId'], message: 'Chọn lớp học' });
    }
  });

@Controller('admin/cc-level')
export class CcLevelRecalibrationController {
  constructor(private readonly recalibration: CcLevelRecalibrationService) {}

  @Post('recalibration/preview')
  preview(@Body() body: unknown, @CurrentUser() actor: AuthUser) {
    const input = scopeSchema.safeParse(body);
    if (!input.success) throw new BadRequestException('Phạm vi hiệu chỉnh không hợp lệ');
    return this.recalibration.preview(input.data, actor);
  }

  @Post('recalibration/apply')
  apply(@Body() body: unknown, @CurrentUser() actor: AuthUser) {
    const input = scopeSchema
      .and(z.object({ reason: z.string().trim().min(3).max(500) }))
      .safeParse(body);
    if (!input.success) throw new BadRequestException('Lệnh hiệu chỉnh CC Level không hợp lệ');
    return this.recalibration.apply(input.data, actor);
  }
}
