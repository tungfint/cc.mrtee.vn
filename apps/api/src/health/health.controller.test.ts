import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from '../database/database.service';
import type { RedisService } from '../redis/redis.service';
import { HealthController } from './health.controller';

function createController(databasePing = vi.fn(), redisPing = vi.fn()) {
  return new HealthController(
    { ping: databasePing } as unknown as DatabaseService,
    { ping: redisPing } as unknown as RedisService,
  );
}

describe('HealthController', () => {
  it('reports liveness without touching dependencies', () => {
    expect(createController().live()).toEqual({ status: 'ok', service: 'api' });
  });

  it('reports readiness when dependencies respond', async () => {
    const controller = createController(
      vi.fn().mockResolvedValue(undefined),
      vi.fn().mockResolvedValue(undefined),
    );

    await expect(controller.ready()).resolves.toEqual({ status: 'ok', service: 'api' });
  });

  it('rejects readiness when a dependency fails', async () => {
    const controller = createController(
      vi.fn().mockRejectedValue(new Error('database unavailable')),
      vi.fn().mockResolvedValue(undefined),
    );

    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
