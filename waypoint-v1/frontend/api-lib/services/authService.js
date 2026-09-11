import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

// Standalone authentication is the default sign-in path (FR-005), chosen
// over a Vercel-specific alternative so it requires zero migration work
// if this platform is ever moved to Azure (see Requirements document,
// section 4.4). SSO is layered on only behind auth.sso.enabled (FR-029).

export async function hashPassword(plain) {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export async function verifyPassword(hash, plain) {
  return argon2.verify(hash, plain);
}

export function issueToken(user) {
  return jwt.sign(
    { sub: user.id, tenantId: user.tenantId, role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

/**
 * Same policy for every path that sets a password — self-service reset,
 * change-password, admin-created account, admin force-reset — so there
 * is exactly one password policy in the app, not one per endpoint that
 * happened to remember to check it. Matches MedBroker's
 * checkPasswordComplexity (authService.js) rule for rule.
 */
export function checkPasswordComplexity(plaintext) {
  const problems = [];
  if (!plaintext || plaintext.length < 12) problems.push('Must be at least 12 characters');
  if (!/[a-z]/.test(plaintext)) problems.push('Must include a lowercase letter');
  if (!/[A-Z]/.test(plaintext)) problems.push('Must include an uppercase letter');
  if (!/[0-9]/.test(plaintext)) problems.push('Must include a digit');
  if (!/[^A-Za-z0-9]/.test(plaintext)) problems.push('Must include a symbol');
  return problems;
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret); // throws on invalid/expired
}

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_WINDOW_MINUTES = 15;

export function isLockedOut(user) {
  if (!user.lockedUntil) return false;
  return new Date(user.lockedUntil) > new Date();
}

export function computeLockout(failedAttempts) {
  if (failedAttempts < LOCKOUT_THRESHOLD) return null;
  return new Date(Date.now() + LOCKOUT_WINDOW_MINUTES * 60 * 1000);
}

export { LOCKOUT_THRESHOLD, LOCKOUT_WINDOW_MINUTES };
