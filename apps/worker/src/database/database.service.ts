import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import postgres, { type Sql } from 'postgres';
import { EnvironmentService } from '../config/environment';

@Injectable()
export class DatabaseService implements OnModuleInit, OnApplicationShutdown {
  private client: Sql | undefined;

  constructor(private readonly environment: EnvironmentService) {}

  async onModuleInit(): Promise<void> {
    this.client = postgres(this.environment.values.DATABASE_URL, {
      max: this.environment.values.WORKER_DB_POOL_MAX,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    await this.ping();
  }

  async ping(): Promise<void> {
    if (!this.client) {
      throw new Error('Database client is not initialized');
    }
    await this.client`select 1`;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.client?.end({ timeout: 5 });
  }
}
