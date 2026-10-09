import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, validatePasswordStrength, timingSafeEqual, hmacSha256 } from '../../src/worker/lib/crypto';

// vitest on Node ≥18 has WebCrypto globally available
describe('password hashing (PBKDF2)', () => {
  it('hashes and verifies correctly', async () => {
    const hash = await hashPassword('MyStr0ng!Pass');
    expect(hash.startsWith('pbkdf2$')).toBe(true);
    expect(await verifyPassword('MyStr0ng!Pass', hash)).toBe(true);
  });

  it('rejects wrong password', async () => {
    const hash = await hashPassword('MyStr0ng!Pass');
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('produces unique salts', async () => {
    const h1 = await hashPassword('same-password-123');
    const h2 = await hashPassword('same-password-123');
    expect(h1).not.toBe(h2);
  });

  it('rejects malformed stored hashes', async () => {
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('x', 'bcrypt$abc')).toBe(false);
  });
});

describe('password strength policy', () => {
  it('requires min length', () => {
    expect(validatePasswordStrength('Short1a').ok).toBe(false);
  });
  it('requires letters and digits', () => {
    expect(validatePasswordStrength('onlyletterslong').ok).toBe(false);
    expect(validatePasswordStrength('12345678901').ok).toBe(false);
    expect(validatePasswordStrength('GoodPass123').ok).toBe(true);
  });
});

describe('hmac + timing-safe compare', () => {
  it('hmac is deterministic per key/message', async () => {
    const a = await hmacSha256('k1', 'm1');
    const b = await hmacSha256('k1', 'm1');
    expect(a).toBe(b);
  });
  it('hmac differs across messages', async () => {
    expect(await hmacSha256('k1', 'm1')).not.toBe(await hmacSha256('k1', 'm2'));
  });
  it('timingSafeEqual', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
  });
});
