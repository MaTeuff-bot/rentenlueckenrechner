import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    maxWorkers: 2,
    testTimeout: 10_000,
    exclude: ['node_modules', 'dist', '.git', '.cache', 'e2e/**'],
  },
})
