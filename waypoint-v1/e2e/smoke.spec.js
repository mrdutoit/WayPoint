import { test } from '@playwright/test';
import { signInAs, watchErrors, expectHealthyPage } from './fixtures.js';

/*
 * Every page, for every role that can reach it: renders a heading, is not
 * the error boundary, throws nothing, logs no console errors. Runs on
 * desktop and on a phone-sized viewport (see playwright.config.js).
 */
const PAGES = {
  Employee: [
    ['/', 'Day'], ['/objectives', 'Objectives'], ['/objectives/o-co', 'Grow net revenue'],
    ['/key-results/kr1', 'Close R12m'], ['/reports', 'Reports'], ['/reports/scorecard/u-fred', 'Fred Steinberg'],
    ['/reports/alignment-map', 'Alignment map'], ['/settings', 'Settings'], ['/change-password', 'Change password'],
  ],
  Manager: [['/', 'Day'], ['/reports/team-progress', 'Team progress'], ['/reports/scorecard/u-joe', null]],
  TenantAdmin: [
    ['/', 'Day'], ['/okr-settings', 'OKR settings'], ['/users', 'Users'], ['/audit-log', 'Audit log'],
    ['/reports/checkin-compliance', 'Check-in compliance'],
  ],
  PlatformAdmin: [['/', 'Platform administration'], ['/tenants', 'Tenants'], ['/admin/flags', 'Feature flags'], ['/audit-log', 'Audit log']],
};

for (const [role, pages] of Object.entries(PAGES)) {
  test.describe(`${role}`, () => {
    for (const [path, heading] of pages) {
      test(`${path} renders cleanly`, async ({ page }) => {
        const errors = watchErrors(page);
        await signInAs(page, role);
        await page.goto(path);
        await expectHealthyPage(page, errors, heading);
      });
    }
  });
}

test('sign-in page renders cleanly signed out', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/login');
  await expectHealthyPage(page, errors, 'Sign in');
});
