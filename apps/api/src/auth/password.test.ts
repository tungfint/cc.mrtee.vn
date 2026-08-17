import { describe, expect, it } from 'vitest';
import { hashPassword, hashToken, verifyPassword } from './password';

describe('password and token security', () => {
  it('stores a salted scrypt password hash and verifies it', async () => {
    const first = await hashPassword('correct horse battery staple');
    const second = await hashPassword('correct horse battery staple');
    expect(first).not.toBe(second);
    await expect(verifyPassword('correct horse battery staple', first)).resolves.toBe(true);
    await expect(verifyPassword('wrong password', first)).resolves.toBe(false);
  });

  it('hashes opaque session and CSRF tokens without storing raw values', () => {
    expect(hashToken('token')).toMatch(/^[a-f0-9]{64}$/);
    expect(hashToken('token')).not.toContain('token');
  });
});
