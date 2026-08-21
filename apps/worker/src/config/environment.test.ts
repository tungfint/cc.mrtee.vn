import { describe, expect, it } from 'vitest';
import { parseWorkerEnvironment } from './environment';

const requiredEnvironment = {
  DATABASE_URL: 'postgresql://user:password@localhost:5432/database',
  REDIS_URL: 'redis://localhost:6379',
};

describe('parseWorkerEnvironment', () => {
  it('uses a deliberately small default database pool', () => {
    const environment = parseWorkerEnvironment(requiredEnvironment);
    expect(environment.WORKER_DB_POOL_MAX).toBe(3);
    expect(environment.SYNC_ONLINE_TARGET_MINUTES).toBe(15);
    expect(environment.SYNC_RECENT_TARGET_MINUTES).toBe(30);
    expect(environment.SYNC_OFFLINE_TARGET_MINUTES).toBe(1440);
  });

  it('rejects an invalid Redis URL', () => {
    expect(() =>
      parseWorkerEnvironment({ ...requiredEnvironment, REDIS_URL: 'not-a-url' }),
    ).toThrow();
  });
});
