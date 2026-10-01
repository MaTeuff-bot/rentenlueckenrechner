import { defineConfig } from 'vitest/config'
import { resolveMaxWorkers } from './vitest.workers.ts'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    maxWorkers: resolveMaxWorkers(),
    testTimeout: 10_000,
    exclude: ['node_modules', 'dist', '.git', '.cache', 'e2e/**'],
  },
})
