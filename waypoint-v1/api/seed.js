import { pool } from './src/db.js';
import { seedPlatformDefaults } from './src/services/bootstrapService.js';

// Local/CLI seeding — for anyone with terminal access to run
// `npm run migrate && npm run seed` directly against a database. If
// you're deploying on Vercel with no CLI available, use
// GET /api/admin/bootstrap instead (see README, "Creating the Platform
// Administrator") — both paths call the exact same seedPlatformDefaults()
// function, so there is no drift between the two.
const email = process.env.PLATFORM_ADMIN_EMAIL;
const password = process.env.PLATFORM_ADMIN_PASSWORD;

if (!email || !password) {
  console.error(
    'PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD must be set in the environment before seeding. ' +
    'Never hardcode these.'
  );
  process.exit(1);
}

seedPlatformDefaults({
  email,
  password,
  firstName: process.env.PLATFORM_ADMIN_FIRST_NAME,
  lastName: process.env.PLATFORM_ADMIN_LAST_NAME,
})
  .then((result) => {
    console.log('Seeded platform flags:', result.flagsSeeded.join(', '));
    console.log(result.adminAlreadyExisted
      ? `Platform Administrator ${email} already exists — left unchanged.`
      : `Seeded Platform Administrator: ${email}`);
    return pool.end();
  })
  .then(() => {
    console.log('Seed complete.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
