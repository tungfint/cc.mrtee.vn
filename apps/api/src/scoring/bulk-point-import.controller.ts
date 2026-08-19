import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { z } from 'zod';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { BulkPointImportService } from './bulk-point-import.service';

const confirmSchema = z.object({
  batchKey: z.string().uuid(),
  rows: z
    .array(
      z.object({
        row: z.number().int().positive(),
        email: z.string(),
        operation: z.string(),
        amount: z.coerce.number(),
        reason: z.string(),
        affectsSeason: z.boolean(),
        errors: z.array(z.string()).optional().default([]),
      }),
    )
    .min(1)
    .max(500),
});

@Controller('admin/organizations/:organizationId/points')
export class BulkPointImportController {
  constructor(private readonly points: BulkPointImportService) {}

  @Post('import')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 3 * 1024 * 1024, files: 1 },
    }),
  )
  async import(
    @Param('organizationId') organizationIdInput: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() actor: AuthUser,
  ) {
    const organizationId = z.string().uuid().safeParse(organizationIdInput);
    if (!organizationId.success) throw new BadRequestException('ID lớp không hợp lệ');
    if (!file) throw new BadRequestException('Chọn file CSV hoặc XLSX để import');
    return this.points.import(organizationId.data, file, actor);
  }

  @Post('import-preview')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 3 * 1024 * 1024, files: 1 },
    }),
  )
  async preview(
    @Param('organizationId') organizationIdInput: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() actor: AuthUser,
  ) {
    const organizationId = z.string().uuid().safeParse(organizationIdInput);
    if (!organizationId.success) throw new BadRequestException('ID lớp không hợp lệ');
    if (!file) throw new BadRequestException('Chọn file CSV hoặc XLSX để đọc dữ liệu');
    return this.points.preview(organizationId.data, file, actor);
  }

  @Post('import-confirm')
  async confirm(
    @Param('organizationId') organizationIdInput: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthUser,
  ) {
    const organizationId = z.string().uuid().safeParse(organizationIdInput);
    const input = confirmSchema.safeParse(body);
    if (!organizationId.success || !input.success) {
      throw new BadRequestException('Dữ liệu xác nhận import không hợp lệ');
    }
    return this.points.confirm(organizationId.data, input.data.rows, input.data.batchKey, actor);
  }
}
