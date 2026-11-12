// vitest.config.ts — unit + integration config. Integration tests use TEST_DATABASE_URL.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/tests/**/*.test.ts'],
    globalSetup: ['src/tests/helpers/global-setup.ts'],
    fileParallelism: false, // serialize DB-touching suites
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
