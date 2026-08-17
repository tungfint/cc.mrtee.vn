import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { EnvironmentService } from '../config/environment';

@Injectable()
export class RedisService implements OnModuleInit, OnApplicationShutdown {
  private client: Redis | undefined;

  constructor(private readonly environment: EnvironmentService) {}

  async onModuleInit(): Promise<void> {
    this.client = new Redis(this.environment.values.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
    await this.client.connect();
    await this.ping();
  }

  async ping(): Promise<void> {
    if (!this.client) {
      throw new Error('Redis client is not initialized');
    }
    await this.client.ping();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.client) {
      await this.client.quit();
    }
  }
}
