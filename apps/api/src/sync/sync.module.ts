import { Module } from '@nestjs/common';
import { SyncQueueService } from './sync-queue.service';

@Module({ providers: [SyncQueueService], exports: [SyncQueueService] })
export class SyncModule {}
