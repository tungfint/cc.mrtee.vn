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
import { CurrentUser, RequireSystemRole } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { StudentImportService } from './student-import.service';

const editableRowSchema = z.object({
  row: z.number().int().positive(),
  email: z.string(),
  password: z.string(),
  fullName: z.string(),
  displayName: z.string(),
  codeforcesHandle: z.string(),
  classSlug: z.string(),
  mustChangePassword: z.boolean(),
  errors: z.array(z.string()).optional().default([]),
});
const confirmSchema = z.object({ rows: z.array(editableRowSchema).min(1).max(500) });

@Controller('organizations/:organizationId/students')
export class StudentImportController {
  constructor(private readonly students: StudentImportService) {}

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
    return this.students.import(organizationId.data, file, actor);
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
    return this.students.preview(file, actor, organizationId.data, false);
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
    return this.students.confirm(input.data.rows, actor, organizationId.data, false);
  }
}

@RequireSystemRole('SYSTEM_ADMIN')
@Controller('admin/users')
export class AdminStudentImportController {
  constructor(private readonly students: StudentImportService) {}

  @Post('import')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 3 * 1024 * 1024, files: 1 },
    }),
  )
  async import(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() actor: AuthUser,
  ) {
    if (!file) throw new BadRequestException('Chọn file CSV hoặc XLSX để import');
    return this.students.importGlobal(file, actor);
  }

  @Post('import-preview')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 3 * 1024 * 1024, files: 1 },
    }),
  )
  async preview(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() actor: AuthUser,
  ) {
    if (!file) throw new BadRequestException('Chọn file CSV hoặc XLSX để đọc dữ liệu');
    return this.students.preview(file, actor, null, true);
  }

  @Post('import-confirm')
  async confirm(@Body() body: unknown, @CurrentUser() actor: AuthUser) {
    const input = confirmSchema.safeParse(body);
    if (!input.success) throw new BadRequestException('Dữ liệu xác nhận import không hợp lệ');
    return this.students.confirm(input.data.rows, actor, null, true);
  }
}
