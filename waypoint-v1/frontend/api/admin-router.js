import { config } from '../api-lib/config.js';
import { seedPlatformDefaults } from '../api-lib/services/bootstrapService.js';

// CORS open — needed for tools/bootstrap-admin.html, opened via file://.
// Safe here specifically because this route is already protected by
// BOOTSTRAP_SECRET regardless of caller.
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'x-bootstrap-secret');
}

/**
 * GET /api/admin/bootstrap — seeds platform flags and the first Platform
 * Administrator, reading credentials from PLATFORM_ADMIN_EMAIL /
 * PLATFORM_ADMIN_PASSWORD (set in the Vercel dashboard — never passed in
 * the request itself). Run manually, on demand, from
 * tools/bootstrap-admin.html — there is no automatic build-time hook;
 * apply db/schema.sql yourself once via your Postgres provider's SQL
 * console first (see README).
 *
 * Safe to call more than once: seeding is idempotent (an existing admin
 * is left unchanged, flags upsert). Requires the x-bootstrap-secret
 * header to match BOOTSTRAP_SECRET. Consider removing BOOTSTRAP_SECRET
 * from Vercel once sign-in is confirmed working — with it unset, this
 * refuses every request rather than allowing one through.
 */
export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const slugParts = Array.isArray(req.query.slug) ? req.query.slug : [req.query.slug].filter(Boolean);
  const action = slugParts.join('/');

  if (req.method !== 'GET' || action !== 'bootstrap') {
    return res.status(404).json({ error: 'Not found' });
  }

  if (!config.bootstrapSecret) {
    return res.status(503).json({ error: 'Bootstrap is not configured (BOOTSTRAP_SECRET unset) — nothing runs.' });
  }
  if (req.headers['x-bootstrap-secret'] !== config.bootstrapSecret) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const result = await seedPlatformDefaults({
      email: config.platformAdminEmail,
      password: config.platformAdminPassword,
      firstName: config.platformAdminFirstName,
      lastName: config.platformAdminLastName,
    });
    res.status(200).json({ message: 'Bootstrap complete', ...result });
  } catch (err) {
    console.error('Bootstrap failed', err);
    res.status(500).json({ error: 'Bootstrap failed', detail: err.message });
  }
}
