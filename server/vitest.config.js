import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration tests share a PostgreSQL database and must run serially.
    pool: 'forks',
    fileParallelism: false,
    setupFiles: ['./tests/setup-env.js'],
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
