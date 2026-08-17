import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EnvironmentService } from '../config/environment';
import type { GlobalRateLimiter } from './global-rate-limiter';
import { CodeforcesClient } from './codeforces.client';

const environment = {
  values: {
    CF_API_BASE_URL: 'https://codeforces.test/api',
    CF_REQUEST_TIMEOUT_MS: 1000,
    CF_REQUEST_MAX_ATTEMPTS: 2,
  },
} as EnvironmentService;

describe('Codeforces client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('acquires a global slot for every transient retry', async () => {
    const acquire = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response('', { status: 500 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ status: 'OK', result: [] }), { status: 200 }),
        ),
    );
    const client = new CodeforcesClient({ acquire } as unknown as GlobalRateLimiter, environment);
    await expect(client.userStatus('tourist')).resolves.toEqual([]);
    expect(acquire).toHaveBeenCalledTimes(2);
  });

  it('does not retry a permanent upstream error', async () => {
    const acquire = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 400 })));
    const client = new CodeforcesClient({ acquire } as unknown as GlobalRateLimiter, environment);
    await expect(client.userStatus('invalid')).rejects.toThrow('Codeforces HTTP 400');
    expect(acquire).toHaveBeenCalledTimes(1);
  });
});
