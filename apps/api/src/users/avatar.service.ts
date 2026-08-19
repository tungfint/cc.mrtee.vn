import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import sharp from 'sharp';
import { EnvironmentService } from '../config/environment';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class AvatarService {
  private readonly avatarDirectory: string;

  constructor(
    private readonly database: DatabaseService,
    environment: EnvironmentService,
  ) {
    this.avatarDirectory = join(resolve(environment.values.UPLOAD_DIR), 'avatars');
  }

  async store(userId: string, input: Buffer): Promise<string> {
    await mkdir(this.avatarDirectory, { recursive: true });
    const filename = `${randomUUID()}.webp`;
    const target = join(this.avatarDirectory, filename);
    try {
      await sharp(input, { failOn: 'warning', limitInputPixels: 20_000_000 })
        .rotate()
        .resize(512, 512, { fit: 'cover', position: 'centre' })
        .webp({ quality: 88 })
        .toFile(target);
    } catch {
      await unlink(target).catch(() => undefined);
      throw new BadRequestException('Ảnh không hợp lệ hoặc không thể xử lý');
    }

    const avatarUrl = `/api/uploads/avatars/${filename}`;
    let previousUrl: string | null = null;
    try {
      await this.database.sql.begin(async (transaction) => {
        const [before] = await transaction<{ avatar_url: string | null }[]>`
          SELECT avatar_url FROM users WHERE id = ${userId} FOR UPDATE
        `;
        previousUrl = before?.avatar_url ?? null;
        const [updated] = await transaction`
          UPDATE users SET avatar_url = ${avatarUrl}, updated_at = now()
          WHERE id = ${userId}
          RETURNING avatar_url, updated_at
        `;
        await transaction`
          INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, before, after)
          VALUES (${userId}, 'USER_AVATAR_UPDATED', 'user', ${userId},
            ${JSON.stringify(before ?? null)}::jsonb, ${JSON.stringify(updated ?? null)}::jsonb)
        `;
      });
    } catch (error) {
      await unlink(target).catch(() => undefined);
      throw error;
    }
    await this.removeLocal(previousUrl);
    return avatarUrl;
  }

  async remove(userId: string): Promise<void> {
    let previousUrl: string | null = null;
    await this.database.sql.begin(async (transaction) => {
      const [before] = await transaction<{ avatar_url: string | null }[]>`
        SELECT avatar_url FROM users WHERE id = ${userId} FOR UPDATE
      `;
      previousUrl = before?.avatar_url ?? null;
      await transaction`UPDATE users SET avatar_url = NULL, updated_at = now() WHERE id = ${userId}`;
      await transaction`
        INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, before, after)
        VALUES (${userId}, 'USER_AVATAR_REMOVED', 'user', ${userId},
          ${JSON.stringify(before ?? null)}::jsonb, '{"avatar_url":null}'::jsonb)
      `;
    });
    await this.removeLocal(previousUrl);
  }

  private async removeLocal(url: string | null): Promise<void> {
    if (!url?.startsWith('/api/uploads/avatars/')) return;
    const filename = basename(url);
    await unlink(join(this.avatarDirectory, filename)).catch(() => undefined);
  }
}
