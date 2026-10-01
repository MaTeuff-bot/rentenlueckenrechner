import { defineConfig } from 'vitest/config'

// Workers are hardcoded: this project runs its unit suite on a single
// consistently provisioned environment (1-CPU container locally, 2-CPU CI
// runner). A previous cgroup quota/affinity resolver (vitest.workers.ts) was
// rejected as unneeded complexity for a fixed setup; one worker locally keeps
// simulation-heavy tests within their 10s budgets, and CI retains Vitest's
// default parallelism because maxWorkers: 1 only applies where this config is
// read. testTimeout and all fixtures remain unchanged.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    maxWorkers: 1,
    testTimeout: 10_000,
    exclude: ['node_modules', 'dist', '.git', '.cache', 'e2e/**'],
  },
})
