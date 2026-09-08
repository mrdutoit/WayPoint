import { config } from '../config.js';
import { runMigrations, seedPlatformDefaults } from '../services/bootstrapService.js';

/**
 * GET /api/admin/bootstrap — runs pending migrations, then seeds platform
 * flags and the first Platform Administrator, reading credentials from
 * PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_PASSWORD (set in the Vercel
 * dashboard — never pass credentials in the request itself).
 *
 * This exists because Vercel has no CLI/SSH access for a one-off script —
 * see README, "Creating the Platform Administrator". Safe to call more
 * than once: both steps are idempotent. Requires the x-bootstrap-secret
 * header to match BOOTSTRAP_SECRET. Consider removing BOOTSTRAP_SECRET
 * from your Vercel environment variables once you've confirmed sign-in
 * works, which closes this endpoint entirely (see the check below —
 * an unset secret refuses every request rather than allowing one through).
 */
export async function bootstrapHandler(req, res) {
  if (!config.bootstrapSecret) {
    return res.status(503).json({ error: 'Bootstrap is not configured (BOOTSTRAP_SECRET unset) — nothing runs.' });
  }
  if (req.headers['x-bootstrap-secret'] !== config.bootstrapSecret) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    req.log?.info('Bootstrap: running migrations…');
    await runMigrations();

    req.log?.info('Bootstrap: seeding platform defaults…');
    const seedResult = await seedPlatformDefaults({
      email: config.platformAdminEmail,
      password: config.platformAdminPassword,
      firstName: config.platformAdminFirstName,
      lastName: config.platformAdminLastName,
    });

    res.status(200).json({ message: 'Bootstrap complete', ...seedResult });
  } catch (err) {
    req.log?.error({ err }, 'Bootstrap failed');
    res.status(500).json({ error: 'Bootstrap failed', detail: err.message });
  }
}
