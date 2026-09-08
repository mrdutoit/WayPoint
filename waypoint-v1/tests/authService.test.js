import { describe, it, expect } from 'vitest';
import {
  hashPassword, verifyPassword, issueToken, verifyToken,
  isLockedOut, computeLockout, LOCKOUT_THRESHOLD,
} from '../api/src/services/authService.js';

describe('password hashing', () => {
  it('verifies a password against its own hash', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(await verifyPassword(hash, 'correct-horse-battery-staple')).toBe(true);
  });

  it('rejects the wrong password', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(await verifyPassword(hash, 'wrong-password')).toBe(false);
  });
});

describe('JWT issue/verify', () => {
  it('round-trips the expected claims', () => {
    const token = issueToken({ id: 'user-1', tenantId: 'tenant-1', role: 'Manager' });
    const payload = verifyToken(token);
    expect(payload.sub).toBe('user-1');
    expect(payload.tenantId).toBe('tenant-1');
    expect(payload.role).toBe('Manager');
  });

  it('throws on a tampered token', () => {
    const token = issueToken({ id: 'user-1', tenantId: 'tenant-1', role: 'Manager' });
    expect(() => verifyToken(token + 'tampered')).toThrow();
  });

  it('supports a null tenantId for PlatformAdmin (FR-003)', () => {
    const token = issueToken({ id: 'admin-1', tenantId: null, role: 'PlatformAdmin' });
    const payload = verifyToken(token);
    expect(payload.tenantId).toBeNull();
    expect(payload.role).toBe('PlatformAdmin');
  });
});

describe('account lockout', () => {
  it('is not locked out below the threshold', () => {
    expect(computeLockout(LOCKOUT_THRESHOLD - 1)).toBeNull();
  });

  it('locks out at the threshold', () => {
    expect(computeLockout(LOCKOUT_THRESHOLD)).toBeInstanceOf(Date);
  });

  it('treats a future lockedUntil as locked out', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(isLockedOut({ lockedUntil: future })).toBe(true);
  });

  it('treats a past lockedUntil as not locked out', () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(isLockedOut({ lockedUntil: past })).toBe(false);
  });

  it('treats no lockedUntil as not locked out', () => {
    expect(isLockedOut({ lockedUntil: null })).toBe(false);
  });
});
