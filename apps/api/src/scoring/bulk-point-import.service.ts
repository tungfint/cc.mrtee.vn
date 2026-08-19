import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { parse as parseCsv } from 'csv-parse/sync';
import { readSheet } from 'read-excel-file/node';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth.types';
import { AuthorizationService } from '../authorization/authorization.service';
import { DatabaseService } from '../database/database.service';
import { ScoringAdjustmentsService, type ManualPointType } from './scoring-adjustments.service';

type CellValue = string | number | boolean | Date | DateConstructor | null;

const rowSchema = z.object({
  email: z.string().trim().email().max(320),
  amount: z.coerce.number().positive().max(1_000_000),
  reason: z.string().trim().min(3).max(500),
});

@Injectable()
export class BulkPointImportService {
  constructor(
    private readonly authorization: AuthorizationService,
    private readonly adjustments: ScoringAdjustmentsService,
    private readonly database: DatabaseService,
  ) {}

  async import(organizationId: string, file: Express.Multer.File, actor: AuthUser) {
    const access = await this.authorization.organizationAccess(organizationId, actor);
    this.authorization.assertCanTeach(access, actor);
    const rows = await this.readRows(file);
    if (rows.length < 2) throw new BadRequestException('File chưa có dữ liệu cộng hoặc trừ điểm');
    if (rows.length > 501) throw new BadRequestException('Mỗi lần chỉ import tối đa 500 tài khoản');

    const header = rows[0]!.map((value) => this.normalize(String(value ?? '')));
    const required = ['tai_khoan', 'thao_tac', 'cc_point', 'ly_do'];
    for (const key of required) {
      if (!header.includes(key)) throw new BadRequestException(`Thiếu cột bắt buộc: ${key}`);
    }

    const fileHash = createHash('sha256').update(file.buffer).digest('hex').slice(0, 32);
    const seen = new Set<string>();
    const results: {
      row: number;
      email: string;
      success: boolean;
      replayed?: boolean;
      message?: string;
    }[] = [];

    for (const [index, row] of rows.slice(1).entries()) {
      if (row.every((value) => value === null || String(value).trim() === '')) continue;
      const record = Object.fromEntries(header.map((key, column) => [key, row[column] ?? '']));
      const email = String(record.tai_khoan ?? '')
        .trim()
        .toLowerCase();
      const parsed = rowSchema.safeParse({
        email,
        amount: record.cc_point,
        reason: String(record.ly_do ?? ''),
      });
      const type = this.pointType(String(record.thao_tac ?? ''));
      const affectsSeason = this.booleanValue(record.anh_huong_mua);
      if (!parsed.success || !type || affectsSeason === null) {
        const validationMessage = parsed.success
          ? !type
            ? 'Thao tác phải là CỘNG hoặc TRỪ'
            : 'Ảnh hưởng mùa phải là CÓ hoặc KHÔNG'
          : parsed.error.issues.map((issue) => issue.message).join('; ');
        results.push({ row: index + 2, email, success: false, message: validationMessage });
        continue;
      }
      if (seen.has(email)) {
        results.push({
          row: index + 2,
          email,
          success: false,
          message: 'Tài khoản bị lặp trong file',
        });
        continue;
      }
      seen.add(email);

      const [target] = await this.database.sql<{ user_id: string }[]>`
        SELECT credentials.user_id
        FROM user_credentials AS credentials
        JOIN users ON users.id = credentials.user_id AND users.status = 'ACTIVE'
        JOIN organization_memberships AS memberships
          ON memberships.user_id = credentials.user_id
          AND memberships.organization_id = ${organizationId}
          AND memberships.status = 'ACTIVE'
        WHERE credentials.email = ${email}
      `;
      if (!target) {
        results.push({
          row: index + 2,
          email,
          success: false,
          message: 'Không tìm thấy tài khoản đang hoạt động trong lớp',
        });
        continue;
      }

      try {
        const adjustment = await this.adjustments.apply({
          organizationId,
          targetUserId: target.user_id,
          type,
          amount: parsed.data.amount * (type === 'PENALTY' ? -1 : 1),
          affectsSeason,
          reason: parsed.data.reason,
          idempotencyKey: `bulk-${fileHash}-${index + 2}`,
          actor,
        });
        results.push({
          row: index + 2,
          email,
          success: true,
          replayed: adjustment.replayed,
        });
      } catch (error) {
        results.push({
          row: index + 2,
          email,
          success: false,
          message: error instanceof Error ? error.message : 'Không thể ghi giao dịch',
        });
      }
    }

    const applied = results.filter((result) => result.success && !result.replayed).length;
    const replayed = results.filter((result) => result.success && result.replayed).length;
    const failed = results.length - applied - replayed;
    await this.database.sql`
      INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, after, reason)
      VALUES (
        ${actor.userId}, 'POINTS_BULK_IMPORTED', 'organization', ${organizationId},
        ${JSON.stringify({ applied, replayed, failed, total: results.length, fileHash })}::jsonb,
        'Cộng/trừ CC Point hàng loạt từ file'
      )
    `;
    return { applied, replayed, failed, total: results.length, results };
  }

  private async readRows(file: Express.Multer.File): Promise<CellValue[][]> {
    const filename = file.originalname.toLowerCase();
    try {
      if (filename.endsWith('.xlsx')) return await readSheet(file.buffer);
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

  private pointType(value: string): ManualPointType | null {
    const normalized = this.normalize(value).toUpperCase();
    if (['CONG', 'BONUS', 'ADD', '+'].includes(normalized)) return 'BONUS';
    if (['TRU', 'PENALTY', 'SUBTRACT', '-'].includes(normalized)) return 'PENALTY';
    return null;
  }

  private booleanValue(value: CellValue | undefined): boolean | null {
    const normalized = this.normalize(String(value ?? 'CO')).toUpperCase();
    if (['CO', 'YES', 'TRUE', '1'].includes(normalized)) return true;
    if (['KHONG', 'NO', 'FALSE', '0'].includes(normalized)) return false;
    return null;
  }

  private normalize(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9+-]+/g, '_')
      .replace(/^_|_$/g, '');
  }
}
