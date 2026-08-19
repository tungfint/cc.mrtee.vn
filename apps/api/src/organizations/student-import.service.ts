import { BadRequestException, Injectable } from '@nestjs/common';
import { parse as parseCsv } from 'csv-parse/sync';
import { readSheet } from 'read-excel-file/node';
import { z } from 'zod';
import { AuthService } from '../auth/auth.service';
import type { AuthUser } from '../auth/auth.types';
import { AuthorizationService } from '../authorization/authorization.service';
import { DatabaseService } from '../database/database.service';

const studentSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(12).max(200),
  fullName: z.string().trim().min(2).max(200),
  displayName: z.string().trim().min(2).max(100),
  codeforcesHandle: z
    .string()
    .trim()
    .max(24)
    .regex(/^$|^[A-Za-z0-9_.-]{3,24}$/, 'Codeforces handle không hợp lệ'),
  initialCcLevel: z.coerce.number().min(0).max(10_000).default(800),
  classSlug: z
    .string()
    .trim()
    .max(100)
    .regex(/^$|^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug lớp không hợp lệ'),
  mustChangePassword: z.boolean().default(true),
});

type CellValue = string | number | boolean | Date | DateConstructor | null;

@Injectable()
export class StudentImportService {
  constructor(
    private readonly authorization: AuthorizationService,
    private readonly auth: AuthService,
    private readonly database: DatabaseService,
  ) {}

  async import(organizationId: string, file: Express.Multer.File, actor: AuthUser) {
    const access = await this.authorization.organizationAccess(organizationId, actor);
    this.authorization.assertCanTeach(access, actor);
    return this.process(file, actor, organizationId, false);
  }

  async importGlobal(file: Express.Multer.File, actor: AuthUser) {
    return this.process(file, actor, null, true);
  }

  private async process(
    file: Express.Multer.File,
    actor: AuthUser,
    fallbackOrganizationId: string | null,
    useClassSlug: boolean,
  ) {
    const rows = await this.readRows(file);
    if (rows.length < 2) throw new BadRequestException('File chưa có dữ liệu học sinh');
    if (rows.length > 501) throw new BadRequestException('Mỗi lần chỉ import tối đa 500 học sinh');

    const header = rows[0]!.map((value) => this.normalizeHeader(String(value ?? '')));
    const required = ['tai_khoan', 'mat_khau', 'ho_va_ten', 'ten_hien_thi'];
    for (const key of required) {
      if (!header.includes(key)) throw new BadRequestException(`Thiếu cột bắt buộc: ${key}`);
    }

    const organizations = useClassSlug
      ? await this.database.sql<{ id: string; slug: string }[]>`
          SELECT id, slug FROM organizations WHERE status = 'ACTIVE'
        `
      : [];
    const organizationBySlug = new Map(organizations.map((item) => [item.slug, item.id]));
    const results: { row: number; email: string; success: boolean; message?: string }[] = [];
    for (const [index, row] of rows.slice(1).entries()) {
      if (row.every((value) => value === null || String(value).trim() === '')) continue;
      const record = Object.fromEntries(header.map((key, column) => [key, row[column] ?? '']));
      const parsed = studentSchema.safeParse({
        email: String(record.tai_khoan ?? ''),
        password: String(record.mat_khau ?? ''),
        fullName: String(record.ho_va_ten ?? ''),
        displayName: String(record.ten_hien_thi ?? ''),
        codeforcesHandle: String(record.tai_khoan_codeforces ?? ''),
        initialCcLevel: record.muc_ban_dau === '' ? 800 : record.muc_ban_dau,
        classSlug: String(record.slug_lop ?? '')
          .trim()
          .toLowerCase(),
        mustChangePassword: this.booleanCell(record.yeu_cau_doi_mat_khau, true),
      });
      if (!parsed.success) {
        results.push({
          row: index + 2,
          email: String(record.tai_khoan ?? ''),
          success: false,
          message: parsed.error.issues.map((issue) => issue.message).join('; '),
        });
        continue;
      }
      const organizationId = useClassSlug
        ? parsed.data.classSlug
          ? organizationBySlug.get(parsed.data.classSlug)
          : undefined
        : (fallbackOrganizationId ?? undefined);
      if (useClassSlug && parsed.data.classSlug && !organizationId) {
        results.push({
          row: index + 2,
          email: parsed.data.email,
          success: false,
          message: `Không tìm thấy lớp có slug “${parsed.data.classSlug}”`,
        });
        continue;
      }
      try {
        await this.auth.createUser(
          {
            email: parsed.data.email,
            password: parsed.data.password,
            fullName: parsed.data.fullName,
            displayName: parsed.data.displayName,
            initialCcLevel: parsed.data.initialCcLevel,
            mustChangePassword: parsed.data.mustChangePassword,
            verifyCodeforces: useClassSlug && Boolean(parsed.data.codeforcesHandle),
            ...(organizationId ? { organizationId } : {}),
            ...(parsed.data.codeforcesHandle
              ? { codeforcesHandle: parsed.data.codeforcesHandle }
              : {}),
          },
          {
            actorUserId: actor.userId,
            after: {
              source: 'BULK_IMPORT',
              organizationId: organizationId ?? null,
              classSlug: parsed.data.classSlug || null,
              email: parsed.data.email.toLowerCase(),
              fullName: parsed.data.fullName,
              displayName: parsed.data.displayName,
              codeforcesHandle: parsed.data.codeforcesHandle || null,
              initialCcLevel: parsed.data.initialCcLevel,
              mustChangePassword: parsed.data.mustChangePassword,
            },
          },
        );
        results.push({ row: index + 2, email: parsed.data.email, success: true });
      } catch (error) {
        results.push({
          row: index + 2,
          email: parsed.data.email,
          success: false,
          message:
            this.postgresCode(error) === '23505'
              ? 'Tài khoản hoặc Codeforces handle đã tồn tại'
              : 'Không thể tạo tài khoản',
        });
      }
    }

    const created = results.filter((result) => result.success).length;
    const failed = results.length - created;
    await this.database.sql`
      INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, after)
      VALUES (${actor.userId}, 'STUDENTS_IMPORTED', ${useClassSlug ? 'system' : 'organization'},
        ${fallbackOrganizationId ?? actor.userId},
        ${JSON.stringify({ created, failed, total: results.length, useClassSlug })}::jsonb)
    `;
    return { created, failed, total: results.length, results };
  }

  private booleanCell(value: unknown, fallback: boolean): boolean {
    const normalized = (['string', 'number', 'boolean'].includes(typeof value) ? String(value) : '')
      .trim()
      .toLowerCase();
    if (!normalized) return fallback;
    if (['1', 'true', 'yes', 'y', 'có', 'co'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'n', 'không', 'khong'].includes(normalized)) return false;
    return fallback;
  }

  private async readRows(file: Express.Multer.File): Promise<CellValue[][]> {
    const filename = file.originalname.toLowerCase();
    try {
      if (filename.endsWith('.xlsx')) {
        return await readSheet(file.buffer);
      }
      if (filename.endsWith('.csv')) {
        return parseCsv(file.buffer, {
          bom: true,
          skip_empty_lines: true,
          relax_column_count: true,
          trim: true,
        });
      }
    } catch {
      throw new BadRequestException('Không đọc được file. Hãy dùng đúng mẫu CSV hoặc XLSX');
    }
    throw new BadRequestException('Chỉ hỗ trợ file .csv hoặc .xlsx');
  }

  private normalizeHeader(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  }

  private postgresCode(error: unknown): string | undefined {
    return typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : undefined;
  }
}
