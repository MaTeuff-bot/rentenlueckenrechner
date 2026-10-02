import { defineConfig } from 'vitest/config'

// Workers are hardcoded for this project's consistent environments: the
// execution container now provides 4 CPUs, and CI runners provide 2. Three
// workers measured fastest and reliably green twice (57-59s); two workers run
// 74-104s, one worker 194-195s. More workers than CPUs would oversubscribe.
// A cgroup quota/affinity resolver was previously rejected as unneeded
// complexity for this fixed setup. The known simulation-heavy tests carry
// explicit 20s budgets because one full recompute costs ~2.7s of CPU-bound
// simulation (1000-path bootstrap) and each UI edit triggers a recompute.
// testTimeout and all fixtures remain unchanged.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    maxWorkers: 3,
    testTimeout: 10_000,
    exclude: ['node_modules', 'dist', '.git', '.cache', 'e2e/**'],
  },
})