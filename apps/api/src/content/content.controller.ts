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
import { parse as parseCsv } from 'csv-parse/sync';
import { readSheet } from 'read-excel-file/node';
import { z } from 'zod';
import { CurrentUser, RequireSystemRole } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { DatabaseService } from '../database/database.service';

const quoteSchema = z.object({
  content: z.string().trim().min(5).max(1000),
  author: z.string().trim().max(160).nullable().default(null),
  active: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(100_000).default(0),
});
const pastedQuotesSchema = z.object({
  text: z.string().trim().min(5).max(500_000),
});

const rankSchema = z.object({
  minLevel: z.coerce.number().int().min(0).max(100_000),
  name: z.string().trim().min(1).max(100),
  icon: z.string().trim().min(1).max(500),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  active: z.boolean().default(true),
});

type CellValue = string | number | boolean | Date | DateConstructor | null;

@Controller()
export class ContentController {
  constructor(private readonly database: DatabaseService) {}

  @Get('content/dashboard')
  async dashboardContent() {
    const [quotes, ranks] = await Promise.all([
      this.database.sql`
        SELECT id, content, author, sort_order, heart_count
        FROM motivational_quotes
        WHERE active = true
        ORDER BY sort_order, created_at, id
      `,
      this.database.sql`
        SELECT id, min_level, name, icon, color
        FROM cc_level_ranks
        WHERE active = true
        ORDER BY min_level
      `,
    ]);
    return { quotes, ranks };
  }

  @RequireSystemRole('SYSTEM_ADMIN')
  @Get('admin/content')
  async adminContent() {
    const [quotes, ranks] = await Promise.all([
      this.database.sql`SELECT * FROM motivational_quotes ORDER BY sort_order, created_at, id`,
      this.database.sql`SELECT * FROM cc_level_ranks ORDER BY min_level, id`,
    ]);
    return { quotes, ranks };
  }

  @RequireSystemRole('SYSTEM_ADMIN')
  @Post('admin/quotes')
  createQuote(@Body() body: unknown, @CurrentUser() actor: AuthUser) {
    return this.persistQuote(null, body, actor);
  }

  @RequireSystemRole('SYSTEM_ADMIN')
  @Post('admin/quotes/import')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 3 * 1024 * 1024, files: 1 },
    }),
  )
  async importQuotes(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() actor: AuthUser,
  ) {
    if (!file) throw new BadRequestException('Chọn file CSV hoặc XLSX để import');
    const rows = await this.readRows(file);
    if (rows.length < 2) throw new BadRequestException('File chưa có danh ngôn');
    if (rows.length > 1001) throw new BadRequestException('Mỗi lần chỉ import tối đa 1.000 câu');
    const header = rows[0]!.map((value) => this.normalizeHeader(String(value ?? '')));
    if (!header.includes('noi_dung')) throw new BadRequestException('Thiếu cột bắt buộc: noi_dung');
    const results: { row: number; success: boolean; message?: string }[] = [];
    let created = 0;
    for (const [index, row] of rows.slice(1).entries()) {
      if (row.every((value) => value === null || String(value).trim() === '')) continue;
      const record = Object.fromEntries(header.map((key, column) => [key, row[column] ?? '']));
      const parsed = quoteSchema.safeParse({
        content: String(record.noi_dung ?? ''),
        author: String(record.tac_gia ?? '').trim() || null,
        sortOrder: record.thu_tu === '' ? index * 10 : record.thu_tu,
        active: this.booleanCell(record.hien_thi, true),
      });
      if (!parsed.success) {
        results.push({
          row: index + 2,
          success: false,
          message: parsed.error.issues.map((issue) => issue.message).join('; '),
        });
        continue;
      }
      await this.persistQuote(null, parsed.data, actor);
      created += 1;
      results.push({ row: index + 2, success: true });
    }
    return { created, failed: results.length - created, total: results.length, results };
  }

  @RequireSystemRole('SYSTEM_ADMIN')
  @Post('admin/quotes/import-text')
  async importPastedQuotes(@Body() body: unknown, @CurrentUser() actor: AuthUser) {
    const parsedBody = pastedQuotesSchema.safeParse(body);
    if (!parsedBody.success) throw new BadRequestException('Danh sách danh ngôn không hợp lệ');
    const lines = parsedBody.data.text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length > 500) throw new BadRequestException('Mỗi lần chỉ dán tối đa 500 câu');
    const results: { row: number; success: boolean; message?: string }[] = [];
    let created = 0;
    for (const [index, line] of lines.entries()) {
      const cells = line.split('|').map((cell) => cell.trim());
      if (index === 0 && this.normalizeHeader(cells[0] ?? '') === 'cham_ngon') continue;
      const quote = quoteSchema.safeParse({
        content: cells[0] ?? '',
        author: cells[1] || null,
        sortOrder: cells[2] || index + 1,
        active: this.booleanCell(cells[3], true),
      });
      if (!quote.success || cells.length < 3) {
        results.push({
          row: index + 1,
          success: false,
          message: 'Đúng định dạng: Châm ngôn | Tác giả | Thứ tự | Có/Không',
        });
        continue;
      }
      await this.persistQuote(null, quote.data, actor);
      created += 1;
      results.push({ row: index + 1, success: true });
    }
    return { created, failed: results.length - created, total: results.length, results };
  }

  @Post('content/quotes/:id/heart')
  async heartQuote(@Param('id') idInput: string) {
    const id = this.uuid(idInput);
    const [quote] = await this.database.sql<{ heart_count: number }[]>`
      UPDATE motivational_quotes
      SET heart_count = LEAST(999999, heart_count + 1), updated_at = now()
      WHERE id = ${id} AND active = true
      RETURNING heart_count
    `;
    if (!quote) throw new BadRequestException('Không tìm thấy danh ngôn');
    return { heartCount: quote.heart_count };
  }

  @RequireSystemRole('SYSTEM_ADMIN')
  @Patch('admin/quotes/:id')
  updateQuote(@Param('id') idInput: string, @Body() body: unknown, @CurrentUser() actor: AuthUser) {
    return this.persistQuote(this.uuid(idInput), body, actor);
  }

  @RequireSystemRole('SYSTEM_ADMIN')
  @Delete('admin/quotes/:id')
  deleteQuote(@Param('id') idInput: string, @CurrentUser() actor: AuthUser) {
    return this.remove('motivational_quotes', 'QUOTE_DELETED', this.uuid(idInput), actor);
  }

  @RequireSystemRole('SYSTEM_ADMIN')
  @Post('admin/level-ranks')
  createRank(@Body() body: unknown, @CurrentUser() actor: AuthUser) {
    return this.persistRank(null, body, actor);
  }

  @RequireSystemRole('SYSTEM_ADMIN')
  @Patch('admin/level-ranks/:id')
  updateRank(@Param('id') idInput: string, @Body() body: unknown, @CurrentUser() actor: AuthUser) {
    return this.persistRank(this.uuid(idInput), body, actor);
  }

  @RequireSystemRole('SYSTEM_ADMIN')
  @Delete('admin/level-ranks/:id')
  deleteRank(@Param('id') idInput: string, @CurrentUser() actor: AuthUser) {
    return this.remove('cc_level_ranks', 'CC_LEVEL_RANK_DELETED', this.uuid(idInput), actor);
  }

  private async persistQuote(id: string | null, body: unknown, actor: AuthUser) {
    const parsed = quoteSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Dữ liệu danh ngôn không hợp lệ');
    const input = parsed.data;
    return this.database.sql.begin(async (transaction) => {
      const [before] = id
        ? await transaction`SELECT * FROM motivational_quotes WHERE id = ${id} FOR UPDATE`
        : [];
      const [quote] = id
        ? await transaction`
            UPDATE motivational_quotes SET content = ${input.content}, author = ${input.author},
              active = ${input.active}, sort_order = ${input.sortOrder}, updated_at = now()
            WHERE id = ${id} RETURNING *
          `
        : await transaction`
            INSERT INTO motivational_quotes (content, author, active, sort_order)
            VALUES (${input.content}, ${input.author}, ${input.active}, ${input.sortOrder})
            RETURNING *
          `;
      if (!quote) throw new BadRequestException('Không tìm thấy danh ngôn');
      await this.audit(
        transaction,
        actor,
        id ? 'QUOTE_UPDATED' : 'QUOTE_CREATED',
        'motivational_quote',
        String(quote.id),
        before,
        quote,
      );
      return { quote };
    });
  }

  private async persistRank(id: string | null, body: unknown, actor: AuthUser) {
    const parsed = rankSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Dữ liệu cấp bậc CC Level không hợp lệ');
    const input = parsed.data;
    try {
      return await this.database.sql.begin(async (transaction) => {
        const [before] = id
          ? await transaction`SELECT * FROM cc_level_ranks WHERE id = ${id} FOR UPDATE`
          : [];
        const [rank] = id
          ? await transaction`
              UPDATE cc_level_ranks SET min_level = ${input.minLevel}, name = ${input.name},
                icon = ${input.icon}, color = ${input.color}, active = ${input.active},
                updated_at = now()
              WHERE id = ${id} RETURNING *
            `
          : await transaction`
              INSERT INTO cc_level_ranks (min_level, name, icon, color, active)
              VALUES (${input.minLevel}, ${input.name}, ${input.icon}, ${input.color}, ${input.active})
              RETURNING *
            `;
        if (!rank) throw new BadRequestException('Không tìm thấy cấp bậc');
        await this.audit(
          transaction,
          actor,
          id ? 'CC_LEVEL_RANK_UPDATED' : 'CC_LEVEL_RANK_CREATED',
          'cc_level_rank',
          String(rank.id),
          before,
          rank,
        );
        return { rank };
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new BadRequestException('Mốc CC Level này đã tồn tại');
      }
      throw error;
    }
  }

  private async remove(
    table: 'motivational_quotes' | 'cc_level_ranks',
    action: string,
    id: string,
    actor: AuthUser,
  ) {
    return this.database.sql.begin(async (transaction) => {
      const rows =
        table === 'motivational_quotes'
          ? await transaction`DELETE FROM motivational_quotes WHERE id = ${id} RETURNING *`
          : await transaction`DELETE FROM cc_level_ranks WHERE id = ${id} RETURNING *`;
      const [removed] = rows;
      if (!removed) throw new BadRequestException('Không tìm thấy cấu hình');
      await this.audit(transaction, actor, action, table, id, removed, null);
      return { success: true };
    });
  }

  private async audit(
    transaction: import('postgres').TransactionSql,
    actor: AuthUser,
    action: string,
    entityType: string,
    entityId: string,
    before: unknown,
    after: unknown,
  ) {
    await transaction`
      INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, before, after)
      VALUES (${actor.userId}, ${action}, ${entityType}, ${entityId},
        ${before ? JSON.stringify(before) : null}::jsonb,
        ${after ? JSON.stringify(after) : null}::jsonb)
    `;
  }

  private uuid(input: string): string {
    const parsed = z.string().uuid().safeParse(input);
    if (!parsed.success) throw new BadRequestException('ID không hợp lệ');
    return parsed.data;
  }

  private async readRows(file: Express.Multer.File): Promise<CellValue[][]> {
    try {
      if (file.originalname.toLowerCase().endsWith('.xlsx')) return await readSheet(file.buffer);
      if (file.originalname.toLowerCase().endsWith('.csv')) {
        return parseCsv(file.buffer, {
          bom: true,
          skip_empty_lines: true,
          relax_column_count: true,
          trim: true,
        });
      }
    } catch {
      throw new BadRequestException('Không đọc được file CSV/XLSX');
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

  private booleanCell(value: unknown, fallback: boolean): boolean {
    const normalized = (['string', 'number', 'boolean'].includes(typeof value) ? String(value) : '')
      .trim()
      .toLowerCase();
    if (!normalized) return fallback;
    return !['0', 'false', 'no', 'không', 'khong', 'ẩn', 'an'].includes(normalized);
  }
}
