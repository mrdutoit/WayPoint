import { randomBytes, createHash } from 'crypto';
import {
  hashPassword, verifyPassword, issueToken,
  isLockedOut, computeLockout, LOCKOUT_THRESHOLD,
} from '../api-lib/services/authService.js';
import { withPlatformContext, withTenantContext } from '../api-lib/context/tenant.js';
import { recordAuditEvent } from '../api-lib/services/auditService.js';

// A dummy hash to compare against when no user is found, so a login
// attempt against a non-existent email takes the same time as one
// against a real email — this is what prevents timing-based account
// enumeration.
const DUMMY_HASH = '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$YQ8f0K3v1234567890abcdefghijklmnopqrstuvwx';

// CORS open on this file — needed for tools/login-test.html, opened via
// file:// with no origin the default same-origin policy recognises.
// Safe here specifically because login already has its own protection
// (lockout, FR-005) independent of who's calling; reset-password never
// reveals whether an account exists either way.
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const slugParts = Array.isArray(req.query.slug) ? req.query.slug : [req.query.slug].filter(Boolean);
  const action = slugParts.join('/');

  if (req.method === 'POST' && action === 'login') return loginAction(req, res);
  if (req.method === 'POST' && action === 'reset-password/request') return requestResetAction(req, res);
  if (req.method === 'POST' && action === 'reset-password/confirm') return confirmResetAction(req, res);

  return res.status(404).json({ error: 'Not found' });
}

async function loginAction(req, res) {
  const { email, password } = req.body ?? {};
  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'email and password are required' });
  }

  // Email is unique platform-wide, so the user must be looked up before a
  // tenant is known. This is the one narrow, intentional exception to
  // "every query goes through withTenantContext" (FR-010) — nothing else
  // in this handler runs outside a tenant-scoped transaction once the
  // user is found.
  const user = await withPlatformContext((client) =>
    client.query(
      `SELECT id, tenant_id, role, password_hash, failed_attempts, locked_until
       FROM okr.user_account WHERE email = $1`,
      [email.toLowerCase().trim()]
    ).then((r) => r.rows[0] ?? null)
  );

  if (!user) {
    await verifyPassword(DUMMY_HASH, password).catch(() => {}); // constant-time decoy
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  if (isLockedOut(user)) {
    return res.status(429).json({ error: 'Account temporarily locked. Try again later.' });
  }

  const valid = await verifyPassword(user.password_hash, password);
  // PlatformAdmin accounts have no tenant (FR-003) — everything past
  // this point must run through withPlatformContext instead of
  // withTenantContext for that case.
  const runInContext = (fn) => (user.tenant_id ? withTenantContext(user.tenant_id, fn) : withPlatformContext(fn));

  if (!valid) {
    const failedAttempts = user.failed_attempts + 1;
    const lockedUntil = computeLockout(failedAttempts);
    await runInContext((client) =>
      client.query(
        `UPDATE okr.user_account SET failed_attempts = $1, locked_until = $2 WHERE id = $3`,
        [failedAttempts, lockedUntil, user.id]
      )
    );
    if (failedAttempts >= LOCKOUT_THRESHOLD) {
      return res.status(429).json({ error: 'Account locked after repeated failed attempts.' });
    }
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = issueToken({ id: user.id, tenantId: user.tenant_id, role: user.role });

  await runInContext(async (client) => {
    await client.query(
      `UPDATE okr.user_account SET failed_attempts = 0, locked_until = NULL WHERE id = $1`,
      [user.id]
    );
    await recordAuditEvent(client, {
      tenantId: user.tenant_id, actorId: user.id,
      action: 'user.login', entityType: 'UserAccount', entityId: user.id,
    });
  });

  res.status(200).json({ token });
}

async function requestResetAction(req, res) {
  const { email } = req.body ?? {};
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'email is required' });
  }

  const user = await withPlatformContext((client) =>
    client.query(`SELECT id, tenant_id FROM okr.user_account WHERE email = $1`, [email.toLowerCase().trim()])
      .then((r) => r.rows[0] ?? null)
  );

  // Always return 200 regardless of whether the account exists — this is
  // what prevents account enumeration via this endpoint.
  if (user) {
    const resetToken = randomBytes(32).toString('hex');
    const resetTokenHash = createHash('sha256').update(resetToken).digest('hex');
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    const runInContext = user.tenant_id
      ? (fn) => withTenantContext(user.tenant_id, fn)
      : (fn) => withPlatformContext(fn);
    await runInContext((client) =>
      client.query(
        `UPDATE okr.user_account SET reset_token_hash = $1, reset_token_expiry = $2 WHERE id = $3`,
        [resetTokenHash, resetTokenExpiry, user.id]
      )
    );
    // TODO (Stage 4): send resetToken via the transactional email provider.
    // Never log or return the raw token — only ever emailed to the account holder.
  }

  res.status(200).json({ message: 'If that account exists, a reset link has been sent.' });
}

async function confirmResetAction(req, res) {
  const { token, newPassword } = req.body ?? {};
  if (!token || !newPassword || typeof token !== 'string' || typeof newPassword !== 'string') {
    return res.status(400).json({ error: 'token and newPassword are required' });
  }
  if (newPassword.length < 12) {
    return res.status(400).json({ error: 'Password must be at least 12 characters' });
  }

  const tokenHash = createHash('sha256').update(token).digest('hex');
  const user = await withPlatformContext((client) =>
    client.query(
      `SELECT id, tenant_id FROM okr.user_account
       WHERE reset_token_hash = $1 AND reset_token_expiry > now()`,
      [tokenHash]
    ).then((r) => r.rows[0] ?? null)
  );

  if (!user) {
    return res.status(400).json({ error: 'Reset link is invalid or has expired' });
  }

  const passwordHash = await hashPassword(newPassword);
  const runInContext = user.tenant_id
    ? (fn) => withTenantContext(user.tenant_id, fn)
    : (fn) => withPlatformContext(fn);
  await runInContext(async (client) => {
    await client.query(
      `UPDATE okr.user_account
       SET password_hash = $1, reset_token_hash = NULL, reset_token_expiry = NULL,
           failed_attempts = 0, locked_until = NULL
       WHERE id = $2`,
      [passwordHash, user.id]
    );
    await recordAuditEvent(client, {
      tenantId: user.tenant_id, actorId: user.id,
      action: 'user.password_reset', entityType: 'UserAccount', entityId: user.id,
    });
  });

  res.status(200).json({ message: 'Password updated. You can now sign in.' });
}
