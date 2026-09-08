import { runMigrations, seedPlatformDefaults } from '../src/services/bootstrapService.js';
import { config } from '../src/config.js';

/**
 * Runs as the Vercel Build Command for the api project (see
 * api/vercel.json) — executes automatically on every deployment, using
 * whatever environment variables are configured in the Vercel dashboard.
 * No manual step, no browser console, no separate endpoint to remember to
 * call. Both steps below are idempotent, so re-running on every deploy is
 * safe and cheap once the schema and admin account already exist.
 *
 * Deliberately asymmetric failure handling:
 *  - A failed migration blocks the deployment (process.exit(1)) — a
 *    broken schema should never go live silently.
 *  - A failed or skipped admin seed does NOT block the deployment — if
 *    PLATFORM_ADMIN_EMAIL/PASSWORD aren't set yet (e.g. your very first
 *    deploy, before you've configured them), every future deploy would
 *    otherwise fail forever until you noticed. Seeding just gets skipped
 *    with a clear log line, and you set the variables and redeploy
 *    whenever you're ready.
 */
async function main() {
  console.log('[bootstrap] Running migrations…');
  await runMigrations();
  console.log('[bootstrap] Migrations up to date.');

  if (!config.platformAdminEmail || !config.platformAdminPassword) {
    console.log('[bootstrap] PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_PASSWORD not set — skipping admin seed this build.');
    return;
  }

  try {
    const result = await seedPlatformDefaults({
      email: config.platformAdminEmail,
      password: config.platformAdminPassword,
      firstName: config.platformAdminFirstName,
      lastName: config.platformAdminLastName,
    });
    console.log(`[bootstrap] Platform flags: ${result.flagsSeeded.join(', ')}`);
    console.log(result.adminAlreadyExisted
      ? `[bootstrap] Platform Administrator ${config.platformAdminEmail} already exists — unchanged.`
      : `[bootstrap] Platform Administrator ${config.platformAdminEmail} created.`);
  } catch (err) {
    // Does not block deployment — see the doc comment above.
    console.warn('[bootstrap] Admin seed failed (deployment continues):', err.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[bootstrap] Migration failed — blocking this deployment:', err);
    process.exit(1);
  });
