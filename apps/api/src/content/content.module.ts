import { Module } from '@nestjs/common';
import { ContentController } from './content.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({ imports: [NotificationsModule], controllers: [ContentController] })
export class ContentModule {}
