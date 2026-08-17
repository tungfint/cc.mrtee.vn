import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { EnvironmentService } from '../config/environment';

@Injectable()
export class RedisService implements OnModuleInit, OnApplicationShutdown {
  private client: Redis | undefined;

  constructor(private readonly environment: EnvironmentService) {}

  onModuleInit(): void {
    this.client = new Redis(this.environment.values.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
    });
  }

  get connection(): Redis {
    if (!this.client) throw new Error('Redis client is not initialized');
    return this.client;
  }

  async ping(): Promise<void> {
    if (!this.client) {
      throw new Error('Redis client is not initialized');
    }
    await this.client.ping();
  }

  async onApplicationShutdown(): Promise<void> {
    if (!this.client) {
      return;
    }
    if (this.client.status === 'wait') {
      this.client.disconnect();
      return;
    }
    await this.client.quit();
  }
}
