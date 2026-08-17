import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import postgres, { type Sql } from 'postgres';
import { EnvironmentService } from '../config/environment';

@Injectable()
export class DatabaseService implements OnModuleInit, OnApplicationShutdown {
  private client: Sql | undefined;

  constructor(private readonly environment: EnvironmentService) {}

  onModuleInit(): void {
    this.client = postgres(this.environment.values.DATABASE_URL, {
      max: this.environment.values.API_DB_POOL_MAX,
      idle_timeout: 20,
      connect_timeout: 10,
    });
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
