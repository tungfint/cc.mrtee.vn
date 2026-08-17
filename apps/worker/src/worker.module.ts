import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { WorkerBootstrapService } from './worker-bootstrap.service';
import { SyncModule } from './sync/sync.module';

@Module({
  imports: [ConfigModule, DatabaseModule, RedisModule, SyncModule],
  providers: [WorkerBootstrapService],
})
export class WorkerModule {}
