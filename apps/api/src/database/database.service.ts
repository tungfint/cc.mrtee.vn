import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { createDatabaseClient, type DatabaseClient } from '@cc/database';
import type { Sql } from 'postgres';
import { EnvironmentService } from '../config/environment';

@Injectable()
export class DatabaseService implements OnModuleInit, OnApplicationShutdown {
  private client: DatabaseClient | undefined;

  constructor(private readonly environment: EnvironmentService) {}

  onModuleInit(): void {
    this.client = createDatabaseClient(
      this.environment.values.DATABASE_URL,
      this.environment.values.API_DB_POOL_MAX,
    );
  }

  get sql(): Sql {
    if (!this.client) {
      throw new Error('Database client is not initialized');
    }
    return this.client.connection;
  }

  get db(): DatabaseClient['db'] {
    if (!this.client) {
      throw new Error('Database client is not initialized');
    }
    return this.client.db;
  }

  async ping(): Promise<void> {
    if (!this.client) {
      throw new Error('Database client is not initialized');
    }
    await this.client.connection`select 1`;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.client?.close();
  }
}
