import { describe, expect, it } from 'vitest';
import { parseApiEnvironment } from './environment';

const requiredEnvironment = {
  DATABASE_URL: 'postgresql://user:password@localhost:5432/database',
  REDIS_URL: 'redis://localhost:6379',
};

describe('parseApiEnvironment', () => {
  it('applies safe development defaults', () => {
    const environment = parseApiEnvironment(requiredEnvironment);

    expect(environment.API_PORT).toBe(3000);
    expect(environment.API_DB_POOL_MAX).toBe(5);
  });

  it('rejects an invalid port', () => {
    expect(() => parseApiEnvironment({ ...requiredEnvironment, API_PORT: '70000' })).toThrow();
  });
});
