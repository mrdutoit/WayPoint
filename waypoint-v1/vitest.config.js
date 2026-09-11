import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
    // Dummy values so api-lib/config.js's required() checks don't throw
    // the moment a test imports anything that transitively pulls in
    // config.js (e.g. logger.js) without mocking it out entirely —
    // exposed by errorResponse.js's real logger.js import in Module 2.
    // Never real credentials; no test connects to an actual database.
    env: {
      DATABASE_URL: 'postgres://test:test@localhost:5432/test',
      JWT_SECRET: 'test-only-secret-not-used-for-anything-real',
    },
  },
});
