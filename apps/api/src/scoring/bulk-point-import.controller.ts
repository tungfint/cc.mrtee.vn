import {
  BadRequestException,
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
}
