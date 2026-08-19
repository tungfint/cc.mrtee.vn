import {
  BadRequestException,
  Controller,
  Delete,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { AvatarService } from './avatar.service';

@Controller('me/avatar')
export class AvatarsController {
  constructor(private readonly avatars: AvatarService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
      fileFilter: (_request, file, callback) => {
        callback(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype));
      },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    if (!file) throw new BadRequestException('Chọn ảnh JPG, PNG hoặc WebP tối đa 5 MB');
    return { avatarUrl: await this.avatars.store(user.userId, file.buffer) };
  }

  @Delete()
  async remove(@CurrentUser() user: AuthUser) {
    await this.avatars.remove(user.userId);
    return { success: true };
  }
}
