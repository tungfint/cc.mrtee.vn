import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { WorkerBootstrapService } from './worker-bootstrap.service';

@Module({
  imports: [ConfigModule, DatabaseModule, RedisModule],
  providers: [WorkerBootstrapService],
})
export class WorkerModule {}
