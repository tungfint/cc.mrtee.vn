import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';

describe('api', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('accepts a successful response without a JSON body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    await expect(api('/empty', { method: 'DELETE' })).resolves.toBeUndefined();
  });
});
