import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'packages/browser/test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    testTimeout: 20_000,
  },
});
