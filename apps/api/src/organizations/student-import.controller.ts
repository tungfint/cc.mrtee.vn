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
import { CurrentUser, RequireSystemRole } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { StudentImportService } from './student-import.service';

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
}
