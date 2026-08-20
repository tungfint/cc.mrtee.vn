import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { EnvironmentService } from '../config/environment';

@Injectable()
export class RewardImageService {
  private readonly directory: string;

  constructor(environment: EnvironmentService) {
    this.directory = join(resolve(environment.values.UPLOAD_DIR), 'rewards');
  }

  async store(input: Buffer): Promise<string> {
    await mkdir(this.directory, { recursive: true });
    const filename = `${randomUUID()}.webp`;
    const target = join(this.directory, filename);
    try {
      await sharp(input, { failOn: 'warning', limitInputPixels: 30_000_000 })
        .rotate()
        .resize(1200, 800, {
          fit: 'contain',
          position: 'centre',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .webp({ quality: 88, alphaQuality: 100 })
        .toFile(target);
    } catch {
      await unlink(target).catch(() => undefined);
      throw new BadRequestException('Ảnh không hợp lệ hoặc không thể xử lý');
    }
    return `/api/uploads/rewards/${filename}`;
  }
}
