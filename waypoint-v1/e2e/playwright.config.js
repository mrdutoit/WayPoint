import { defineConfig, devices } from '@playwright/test';

/*
 * Browser smoke tests (2026-09-25). They load the BUILT frontend
 * (vite preview) in real Chromium with every /api/* call answered from
 * e2e/fixtures.js — no database, no secrets — so they test exactly the
 * class of bug unit tests can't see: a page that crashes on render, a
 * console error, a session lost on refresh, a chart that breaks on hover.
 *
 * Run by GitHub Actions on every push (.github/workflows/ci.yml). Locally:
 *   npm --prefix frontend run build && npm run test:e2e
 */
const PORT = 4173;

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.js/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: '../playwright-report' }]] : 'list',
  outputDir: '../test-results',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /smoke\.spec\.js/ },
  ],
  webServer: {
    command: `npm --prefix ../frontend run preview -- --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
