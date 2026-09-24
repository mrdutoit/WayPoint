import { describe, it, expect } from 'vitest';
import { decodeToken, isTokenExpired } from '../frontend/src/utils/jwt.js';

function fakeToken(payload) {
  const base64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url(payload)}.fake-signature`;
}

describe('decodeToken', () => {
  it('decodes a well-formed token\'s payload', () => {
    const token = fakeToken({ sub: 'user-1', tenantId: 't1', role: 'Manager', exp: 9999999999 });
    expect(decodeToken(token)).toEqual({ sub: 'user-1', tenantId: 't1', role: 'Manager', exp: 9999999999 });
  });

  it('returns null for garbage input rather than throwing', () => {
    expect(decodeToken('not-a-real-token')).toBeNull();
    expect(decodeToken('')).toBeNull();
    expect(decodeToken('a.b')).toBeNull(); // missing the third segment entirely is fine to still attempt, but malformed base64/JSON must not throw
  });
});

describe('isTokenExpired', () => {
  it('treats a token with no exp claim as expired (fail closed, not open)', () => {
    expect(isTokenExpired({ sub: 'user-1' })).toBe(true);
    expect(isTokenExpired(null)).toBe(true);
  });

  it('returns false for a future exp', () => {
    const oneHourFromNow = Math.floor(Date.now() / 1000) + 3600;
    expect(isTokenExpired({ exp: oneHourFromNow })).toBe(false);
  });

  it('returns true for a past exp', () => {
    const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;
    expect(isTokenExpired({ exp: oneHourAgo })).toBe(true);
  });
});
