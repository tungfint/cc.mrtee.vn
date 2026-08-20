import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { EnvironmentService } from '../config/environment';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class RecognitionImageService {
  private readonly directory: string;

  constructor(
    environment: EnvironmentService,
    private readonly database: DatabaseService,
  ) {
    this.directory = join(resolve(environment.values.UPLOAD_DIR), 'recognition');
  }

  async store(actorUserId: string, input: Buffer) {
    await mkdir(this.directory, { recursive: true });
    const id = randomUUID();
    const filename = `${id}.png`;
    const target = join(this.directory, filename);
    try {
      await sharp(input, { failOn: 'warning', limitInputPixels: 30_000_000 })
        .rotate()
        .resize(1200, 1500, {
          fit: 'contain',
          position: 'centre',
          background: '#fff7fb',
        })
        .png({ compressionLevel: 9 })
        .toFile(target);
    } catch {
      await unlink(target).catch(() => undefined);
      throw new BadRequestException('Ảnh vinh danh không hợp lệ hoặc không thể xử lý');
    }
    const imageUrl = `/api/uploads/recognition/${filename}`;
    await this.database.sql`
      INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, after, reason)
      VALUES (${actorUserId}, 'RECOGNITION_IMAGE_CREATED', 'recognition_image', ${id},
        ${JSON.stringify({ image_url: imageUrl })}::jsonb,
        'Tạo liên kết công khai cho ảnh vinh danh')
    `;
    return imageUrl;
  }
}
