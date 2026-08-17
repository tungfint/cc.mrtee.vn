import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from './database/database.service';
import { RedisService } from './redis/redis.service';

@Injectable()
export class WorkerBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(WorkerBootstrapService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  async onModuleInit(): Promise<void> {
    await Promise.all([this.database.ping(), this.redis.ping()]);
    this.logger.log('Worker dependencies are ready');
  }
}
