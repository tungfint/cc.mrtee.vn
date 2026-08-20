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
  author: z
    .string()
    .trim()
    .max(160)
    .nullable()
    .optional()
    .transform((value) => value || 'Cầy Cốt MrTee.VN'),
  active: z.boolean().default(true),
  sortOrder: z.coerce
    .number()
    .int()
    .min(0)
    .max(100_000)
    .optional()
    .transform((value) => value ?? Math.floor(Math.random() * 100_001)),
});
const pastedQuotesSchema = z.object({
  text: z.string().trim().min(5).max(500_000),
});
const editableQuoteSchema = z.object({
  row: z.number().int().positive(),
  content: z.string(),
  author: z.string().nullable().optional(),
  sortOrder: z.coerce.number().int().min(0).max(100_000).optional(),
  active: z.boolean().default(true),
  errors: z.array(z.string()).optional().default([]),
});

const rankSchema = z.object({
  minLevel: z.coerce.number().int().min(0).max(100_000),
  name: z.string().trim().min(1).max(100),
  icon: z.string().trim().min(1).max(500),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  active: z.boolean().default(true),
});
const achievementSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().min(2).max(1000),
  icon: z.string().trim().min(1).max(500),
  tier: z.enum(['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND', 'MASTER', 'LEGEND']),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  requiredLongestStreak: z.coerce.number().int().min(1).max(100_000),
  active: z.boolean().default(true),
});
const grantAchievementSchema = z.object({
  userId: z.string().uuid(),
  note: z.string().trim().min(3).max(500),
});

type CellValue = string | number | boolean | Date | DateConstructor | null;

@Controller()
export class ContentController {
  constructor(private readonly database: DatabaseService) {}

  @Get('content/dashboard')
  async dashboardContent() {
    const [quotes, ranks, achievements] = await Promise.all([
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
      this.database.sql`
        SELECT id, name, description, icon, tier, color, required_longest_streak
        FROM achievements WHERE active = true ORDER BY required_longest_streak
      `,
    ]);
    return { quotes, ranks, achievements };
  }

  @RequireSystemRole('SYSTEM_ADMIN')
  @Get('admin/content')
  async adminContent() {
    const [quotes, ranks, achievements] = await Promise.all([
      this.database.sql`SELECT * FROM motivational_quotes ORDER BY sort_order, created_at, id`,
      this.database.sql`SELECT * FROM cc_level_ranks ORDER BY min_level, id`,
      this.database.sql`
        SELECT achievements.*,
          (SELECT count(*)::int FROM user_achievements
            WHERE achievement_id = achievements.id) AS granted_count,
          (SELECT count(*)::int FROM rewards
            WHERE achievement_id = achievements.id) AS reward_count
        FROM achievements ORDER BY required_longest_streak, id
      `,
    ]);
    return { quotes, ranks, achievements };
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
        author: String(record.tac_gia ?? '').trim() || undefined,
        sortOrder: record.thu_tu === '' ? undefined : record.thu_tu,
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
  @Post('admin/quotes/import-preview')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 3 * 1024 * 1024, files: 1 },
    }),
  )
  async previewQuotes(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('Chọn file CSV hoặc XLSX để đọc dữ liệu');
    const rows = await this.readRows(file);
    if (rows.length < 2) throw new BadRequestException('File chưa có danh ngôn');
    if (rows.length > 1001) throw new BadRequestException('Mỗi lần chỉ import tối đa 1.000 câu');
    const header = rows[0]!.map((value) => this.normalizeHeader(String(value ?? '')));
    if (!header.includes('noi_dung')) throw new BadRequestException('Thiếu cột bắt buộc: noi_dung');
    const result = rows.slice(1).flatMap((row, index) => {
      if (row.every((value) => value === null || String(value).trim() === '')) return [];
      const record = Object.fromEntries(header.map((key, column) => [key, row[column] ?? '']));
      const candidate = {
        row: index + 2,
        content: String(record.noi_dung ?? '').trim(),
        author: String(record.tac_gia ?? '').trim() || 'Cầy Cốt MrTee.VN',
        sortOrder:
          record.thu_tu === '' ? Math.floor(Math.random() * 100_001) : Number(record.thu_tu),
        active: this.booleanCell(record.hien_thi, true),
      };
      const parsed = quoteSchema.safeParse(candidate);
      return [
        {
          ...candidate,
          errors: parsed.success ? [] : parsed.error.issues.map((issue) => issue.message),
        },
      ];
    });
    return {
      rows: result,
      total: result.length,
      valid: result.filter((row) => !row.errors.length).length,
    };
  }

  @RequireSystemRole('SYSTEM_ADMIN')
  @Post('admin/quotes/import-confirm')
  async confirmQuotes(@Body() body: unknown, @CurrentUser() actor: AuthUser) {
    const input = z.object({ rows: z.array(editableQuoteSchema).min(1).max(1000) }).safeParse(body);
    if (!input.success) throw new BadRequestException('Dữ liệu xác nhận import không hợp lệ');
    const results: { row: number; success: boolean; message?: string }[] = [];
    for (const row of input.data.rows) {
      const parsed = quoteSchema.safeParse(row);
      if (!parsed.success) {
        results.push({
          row: row.row,
          success: false,
          message: parsed.error.issues.map((issue) => issue.message).join('; '),
        });
        continue;
      }
      await this.persistQuote(null, parsed.data, actor);
      results.push({ row: row.row, success: true });
    }
    const created = results.filter((result) => result.success).length;
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
        author: cells[1] || undefined,
        sortOrder: cells[2] || undefined,
        active: this.booleanCell(cells[3], true),
      });
      if (!quote.success) {
        results.push({
          row: index + 1,
          success: false,
          message: 'Câu châm ngôn phải có ít nhất 5 ký tự',
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

  @RequireSystemRole('SYSTEM_ADMIN')
  @Post('admin/achievements')
  createAchievement(@Body() body: unknown, @CurrentUser() actor: AuthUser) {
    return this.persistAchievement(null, body, actor);
  }

  @RequireSystemRole('SYSTEM_ADMIN')
  @Patch('admin/achievements/:id')
  updateAchievement(
    @Param('id') idInput: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.persistAchievement(this.uuid(idInput), body, actor);
  }

  @RequireSystemRole('SYSTEM_ADMIN')
  @Delete('admin/achievements/:id')
  async archiveAchievement(@Param('id') idInput: string, @CurrentUser() actor: AuthUser) {
    const id = this.uuid(idInput);
    return this.database.sql.begin(async (transaction) => {
      const [before] = await transaction`SELECT * FROM achievements WHERE id = ${id} FOR UPDATE`;
      if (!before) throw new BadRequestException('Không tìm thấy danh hiệu');
      const [achievement] = await transaction`
        UPDATE achievements SET active = false, updated_at = now()
        WHERE id = ${id} RETURNING *
      `;
      await this.audit(
        transaction,
        actor,
        'ACHIEVEMENT_ARCHIVED',
        'achievement',
        id,
        before,
        achievement,
      );
      return { achievement };
    });
  }

  @RequireSystemRole('SYSTEM_ADMIN')
  @Post('admin/achievements/:id/grant')
  async grantAchievement(
    @Param('id') idInput: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthUser,
  ) {
    const id = this.uuid(idInput);
    const input = grantAchievementSchema.safeParse(body);
    if (!input.success) throw new BadRequestException('Dữ liệu tặng danh hiệu không hợp lệ');
    return this.database.sql.begin(async (transaction) => {
      const [achievement] = await transaction`SELECT id, name FROM achievements WHERE id = ${id}`;
      if (!achievement) throw new BadRequestException('Không tìm thấy danh hiệu');
      const [user] = await transaction`
        SELECT id, display_name FROM users WHERE id = ${input.data.userId} AND status = 'ACTIVE'
      `;
      if (!user) throw new BadRequestException('Không tìm thấy tài khoản đang hoạt động');
      const [grant] = await transaction`
        INSERT INTO user_achievements (user_id, achievement_id, source, granted_by, note)
        VALUES (${input.data.userId}, ${id}, 'MANUAL', ${actor.userId}, ${input.data.note})
        ON CONFLICT (user_id, achievement_id) DO NOTHING
        RETURNING *
      `;
      await this.audit(
        transaction,
        actor,
        'ACHIEVEMENT_GRANTED',
        'user_achievement',
        `${input.data.userId}:${id}`,
        null,
        grant ?? { userId: input.data.userId, achievementId: id, replayed: true },
      );
      return { grant: grant ?? null, replayed: !grant };
    });
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

  private async persistAchievement(id: string | null, body: unknown, actor: AuthUser) {
    const parsed = achievementSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Dữ liệu danh hiệu không hợp lệ');
    const input = parsed.data;
    try {
      return await this.database.sql.begin(async (transaction) => {
        const [before] = id
          ? await transaction`SELECT * FROM achievements WHERE id = ${id} FOR UPDATE`
          : [];
        const [achievement] = id
          ? await transaction`
              UPDATE achievements SET name = ${input.name}, description = ${input.description},
                icon = ${input.icon}, tier = ${input.tier}, color = ${input.color},
                required_longest_streak = ${input.requiredLongestStreak},
                active = ${input.active}, updated_at = now()
              WHERE id = ${id} RETURNING *
            `
          : await transaction`
              INSERT INTO achievements (
                name, description, icon, tier, color, required_longest_streak, active
              ) VALUES (
                ${input.name}, ${input.description}, ${input.icon}, ${input.tier},
                ${input.color}, ${input.requiredLongestStreak}, ${input.active}
              ) RETURNING *
            `;
        if (!achievement) throw new BadRequestException('Không tìm thấy danh hiệu');
        await this.audit(
          transaction,
          actor,
          id ? 'ACHIEVEMENT_UPDATED' : 'ACHIEVEMENT_CREATED',
          'achievement',
          String(achievement.id),
          before,
          achievement,
        );
        return { achievement };
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new BadRequestException('Mốc Streak này đã có danh hiệu');
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
