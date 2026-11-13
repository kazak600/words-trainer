import { describe, expect, it } from 'vitest';
import {
  constantTimeEqual,
  generateToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from '../src/lib/crypto';

describe('password hashing', () => {
  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct horse');

    expect(await verifyPassword('correct horse', hash)).toBe(true);
    expect(await verifyPassword('correct horsf', hash)).toBe(false);
  });

  it('salts: the same password hashes differently each time', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  it('stores algorithm, iterations, salt and hash in one string', async () => {
    const hash = await hashPassword('x');

    expect(hash).toMatch(/^pbkdf2-sha256\$100000\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
  });

  it('rejects a malformed stored hash instead of throwing', async () => {
    expect(await verifyPassword('x', 'garbage')).toBe(false);
    expect(await verifyPassword('x', 'pbkdf2-sha256$abc$s$h')).toBe(false);
  });
});

describe('constantTimeEqual', () => {
  it('compares strings of equal and different length', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('session tokens', () => {
  it('generates unique url-safe tokens', () => {
    const a = generateToken();
    const b = generateToken();

    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('hashes a token to stable 64-char hex that differs from the token', async () => {
    const token = generateToken();
    const hash = await hashToken(token);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashToken(token)).toBe(hash);
  });
});
