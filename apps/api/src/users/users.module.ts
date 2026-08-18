import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersController } from './users.controller';
import { AvatarService } from './avatar.service';
import { AvatarsController } from './avatars.controller';

@Module({
  imports: [AuthModule],
  controllers: [UsersController, AvatarsController],
  providers: [AvatarService],
})
export class UsersModule {}
