import { test, expect } from '@playwright/test';
import { signInAs, mockApi, fakeToken, watchErrors, expectHealthyPage } from './fixtures.js';

/*
 * Regression tests for bugs that only a real browser could show — each
 * one has already happened once (see status.md for the dates).
 */

test('a page refresh keeps you signed in (2026-09-23 bug)', async ({ page }) => {
  await signInAs(page, 'Manager');
  await page.goto('/objectives');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Objectives');
  await page.reload();
  await expect(page).toHaveURL(/\/objectives$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Objectives');
});

test('an expired token sends you to sign in, not a broken app', async ({ page }) => {
  await mockApi(page, 'Manager');
  await page.goto('/login');
  await page.evaluate((t) => localStorage.setItem('waypoint.token', t), fakeToken('Manager', { expiresInSeconds: -60 }));
  await page.goto('/objectives');
  await expect(page).toHaveURL(/\/login$/);
});

test('sign out clears the session (2026-09-23 bug)', async ({ page }) => {
  await signInAs(page, 'Employee');
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(() => localStorage.getItem('waypoint.token'))).toBeNull();
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
});

test('scorecard renders its charts without crashing (2026-09-24 blank-page bug)', async ({ page }) => {
  const errors = watchErrors(page);
  await signInAs(page, 'Employee');
  await page.goto('/reports/scorecard/u-fred');
  await expect(page.locator('.vz-map .vz-tile').first()).toBeVisible();
  await expectHealthyPage(page, errors, 'Fred Steinberg');
});

test('status ring stays inside its box when hovered (2026-09-25 clipping bug)', async ({ page }) => {
  await signInAs(page, 'Employee');
  await page.goto('/');
  const ring = page.locator('.vz-ring-svg').first();
  await expect(ring).toBeVisible();
  await page.locator('.vz-legend-item').first().hover();
  // Every segment's outer edge (radius + half its hovered stroke) must fit in the SVG.
  const overflow = await ring.evaluate((el) => {
    const svg = el.querySelector('svg');
    const size = Number(svg.getAttribute('width'));
    return [...svg.querySelectorAll('circle.seg')].some((c) => Number(c.getAttribute('r')) + Number(c.getAttribute('stroke-width')) / 2 > size / 2 + 0.01);
  });
  expect(overflow).toBe(false);
});

test('course line: focusing a check-in shows its detail card', async ({ page }) => {
  const errors = watchErrors(page);
  await signInAs(page, 'Employee');
  await page.goto('/');
  await page.locator('.db-waypoint').last().focus();
  await expect(page.getByRole('tooltip')).toContainText('Close R12m in new ARR');
  expect(errors).toEqual([]);
});

test('Dashboard "Add check-in" opens that Key Result\'s form on the Objective page', async ({ page }) => {
  await signInAs(page, 'Employee');
  await page.goto('/objectives/o-co?checkin=kr3');
  await expect(page.getByRole('radiogroup', { name: 'Score' })).toBeVisible();
});

test('alignment map: sunburst focus lights a branch, click scrolls to it on the map', async ({ page }) => {
  const errors = watchErrors(page);
  await signInAs(page, 'Employee');
  await page.goto('/reports/alignment-map');
  const slice = page.getByRole('button', { name: /Division: Expand territory reach/ });
  await slice.focus();
  await expect(page.getByRole('tooltip')).toContainText('Expand territory reach');
  await slice.press('Enter');
  await expect(page.locator('[data-node="o-div"]')).toBeInViewport();
  expect(errors).toEqual([]);
});

test('roll-up coverage shows beside an Objective\'s status', async ({ page }) => {
  await signInAs(page, 'Employee');
  await page.goto('/objectives/o-co');
  await expect(page.getByText('3 of 5 reporting')).toBeVisible();
});

test('mobile navigation exists (2026-09-25: phones had no page links)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAs(page, 'Employee');
  await page.goto('/');
  await page.locator('.wp-nav-mobile').getByRole('link', { name: 'Reports' }).click();
  await expect(page).toHaveURL(/\/reports$/);
});
