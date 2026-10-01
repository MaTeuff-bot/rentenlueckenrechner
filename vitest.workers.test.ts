import { describe, expect, it } from 'vitest'
import { availableParallelism } from 'node:os'
import { readFileSync } from 'node:fs'
import { resolveMaxWorkers, type WorkersFileReader } from './vitest.workers.ts'

function stubReader(files: Record<string, string>): WorkersFileReader {
  return (path: string) => (path in files ? files[path] : null)
}

const V2_ROOT = '/sys/fs/cgroup/cpu.max'
const CGROUP = '/proc/self/cgroup'
const V1_CPU_QUOTA = '/sys/fs/cgroup/cpu/cpu.cfs_quota_us'
const V1_CPU_PERIOD = '/sys/fs/cgroup/cpu/cpu.cfs_period_us'
const V1_MIXED_QUOTA = '/sys/fs/cgroup/cpu,cpuacct/cpu.cfs_quota_us'
const V1_MIXED_PERIOD = '/sys/fs/cgroup/cpu,cpuacct/cpu.cfs_period_us'

describe('resolveMaxWorkers v2', () => {
  it('resolves 2 for quota 2 with affinity 8', () => {
    const readFile = stubReader({ [CGROUP]: '0::/\n', [V2_ROOT]: '200000 100000\n' })
    expect(resolveMaxWorkers({ readFile, availableParallelism: 8 })).toBe(2)
  })

  it('caps quota 2 by affinity 1', () => {
    const readFile = stubReader({ [CGROUP]: '0::/\n', [V2_ROOT]: '200000 100000\n' })
    expect(resolveMaxWorkers({ readFile, availableParallelism: 1 })).toBe(1)
  })

  it('resolves 1 for quota 1 with affinity 8', () => {
    const readFile = stubReader({ [CGROUP]: '0::/\n', [V2_ROOT]: '100000 100000\n' })
    expect(resolveMaxWorkers({ readFile, availableParallelism: 8 })).toBe(1)
  })

  it('floors fractional quota 1.5 to 1', () => {
    const readFile = stubReader({ [CGROUP]: '0::/\n', [V2_ROOT]: '150000 100000\n' })
    expect(resolveMaxWorkers({ readFile, availableParallelism: 8 })).toBe(1)
  })

  it('clamps sub-one quota to 1', () => {
    const readFile = stubReader({ [CGROUP]: '0::/\n', [V2_ROOT]: '50000 100000\n' })
    expect(resolveMaxWorkers({ readFile, availableParallelism: 8 })).toBe(1)
  })

  it('falls back to capped affinity for unlimited v2', () => {
    const readFile = stubReader({ [CGROUP]: '0::/\n', [V2_ROOT]: 'max 100000\n' })
    expect(resolveMaxWorkers({ readFile, availableParallelism: 8 })).toBe(2)
    expect(resolveMaxWorkers({ readFile, availableParallelism: 1 })).toBe(1)
  })

  it('falls back for missing v2 files', () => {
    const readFile = stubReader({ [CGROUP]: '0::/\n' })
    expect(resolveMaxWorkers({ readFile, availableParallelism: 8 })).toBe(2)
    expect(resolveMaxWorkers({ readFile, availableParallelism: 1 })).toBe(1)
  })

  it('falls back for malformed v2 content', () => {
    const malformed = stubReader({ [CGROUP]: '0::/\n', [V2_ROOT]: 'not-a-quota\n' })
    expect(resolveMaxWorkers({ readFile: malformed, availableParallelism: 8 })).toBe(2)
    const zero = stubReader({ [CGROUP]: '0::/\n', [V2_ROOT]: '0 100000\n' })
    expect(resolveMaxWorkers({ readFile: zero, availableParallelism: 8 })).toBe(2)
  })
})

describe('resolveMaxWorkers v1', () => {
  it('resolves 2 for v1 quota 2 with affinity 8 on cpu mount', () => {
    const readFile = stubReader({
      [CGROUP]: '2:cpu:/\n0::/\n',
      [V1_CPU_QUOTA]: '200000\n',
      [V1_CPU_PERIOD]: '100000\n',
    })
    expect(resolveMaxWorkers({ readFile, availableParallelism: 8 })).toBe(2)
  })

  it('caps v1 quota 2 by affinity 1', () => {
    const readFile = stubReader({
      [CGROUP]: '2:cpu:/\n0::/\n',
      [V1_CPU_QUOTA]: '200000\n',
      [V1_CPU_PERIOD]: '100000\n',
    })
    expect(resolveMaxWorkers({ readFile, availableParallelism: 1 })).toBe(1)
  })

  it('resolves 1 for v1 quota 1 with affinity 8', () => {
    const readFile = stubReader({
      [CGROUP]: '2:cpu:/\n0::/\n',
      [V1_CPU_QUOTA]: '100000\n',
      [V1_CPU_PERIOD]: '100000\n',
    })
    expect(resolveMaxWorkers({ readFile, availableParallelism: 8 })).toBe(1)
  })

  it('supports the cpu,cpuacct mount layout', () => {
    const readFile = stubReader({
      [CGROUP]: '3:cpu,cpuacct:/\n0::/\n',
      [V1_MIXED_QUOTA]: '200000\n',
      [V1_MIXED_PERIOD]: '100000\n',
    })
    expect(resolveMaxWorkers({ readFile, availableParallelism: 8 })).toBe(2)
  })

  it('floors fractional v1 quota 1.5 to 1', () => {
    const readFile = stubReader({
      [CGROUP]: '2:cpu:/\n0::/\n',
      [V1_CPU_QUOTA]: '150000\n',
      [V1_CPU_PERIOD]: '100000\n',
    })
    expect(resolveMaxWorkers({ readFile, availableParallelism: 8 })).toBe(1)
  })

  it('falls back for unlimited, missing, or malformed v1', () => {
    const unlimited = stubReader({
      [CGROUP]: '2:cpu:/\n0::/\n',
      [V1_CPU_QUOTA]: '-1\n',
      [V1_CPU_PERIOD]: '100000\n',
    })
    expect(resolveMaxWorkers({ readFile: unlimited, availableParallelism: 8 })).toBe(2)
    const missingPeriod = stubReader({
      [CGROUP]: '2:cpu:/\n0::/\n',
      [V1_CPU_QUOTA]: '200000\n',
    })
    expect(resolveMaxWorkers({ readFile: missingPeriod, availableParallelism: 8 })).toBe(2)
    const malformed = stubReader({
      [CGROUP]: '2:cpu:/\n0::/\n',
      [V1_CPU_QUOTA]: 'oops\n',
      [V1_CPU_PERIOD]: '100000\n',
    })
    expect(resolveMaxWorkers({ readFile: malformed, availableParallelism: 8 })).toBe(2)
  })
})

describe('resolveMaxWorkers hierarchy', () => {
  it('prefers a tight nested v2 quota over a looser root quota', () => {
    const readFile = stubReader({
      [CGROUP]: '0::/kubepods/burstable/pod123\n',
      '/sys/fs/cgroup/cpu.max': '200000 100000\n',
      '/sys/fs/cgroup/kubepods/cpu.max': '200000 100000\n',
      '/sys/fs/cgroup/kubepods/burstable/cpu.max': '200000 100000\n',
      '/sys/fs/cgroup/kubepods/burstable/pod123/cpu.max': '100000 100000\n',
    })
    expect(resolveMaxWorkers({ readFile, availableParallelism: 8 })).toBe(1)
  })

  it('prefers a tight v2 ancestor quota over an unlimited leaf', () => {
    const readFile = stubReader({
      [CGROUP]: '0::/kubepods/burstable/pod123\n',
      '/sys/fs/cgroup/cpu.max': '200000 100000\n',
      '/sys/fs/cgroup/kubepods/cpu.max': '200000 100000\n',
      '/sys/fs/cgroup/kubepods/burstable/cpu.max': '100000 100000\n',
      '/sys/fs/cgroup/kubepods/burstable/pod123/cpu.max': 'max 100000\n',
    })
    expect(resolveMaxWorkers({ readFile, availableParallelism: 8 })).toBe(1)
  })

  it('prefers a tight v2 ancestor quota over a looser leaf quota', () => {
    const readFile = stubReader({
      [CGROUP]: '0::/kubepods/burstable/pod123\n',
      '/sys/fs/cgroup/cpu.max': '200000 100000\n',
      '/sys/fs/cgroup/kubepods/cpu.max': '200000 100000\n',
      '/sys/fs/cgroup/kubepods/burstable/cpu.max': '100000 100000\n',
      '/sys/fs/cgroup/kubepods/burstable/pod123/cpu.max': '200000 100000\n',
    })
    expect(resolveMaxWorkers({ readFile, availableParallelism: 8 })).toBe(1)
  })

  it('prefers a tight nested v1 quota over a looser root quota', () => {
    const readFile = stubReader({
      [CGROUP]: '2:cpu:/kubepods/pod123\n0::/kubepods/pod123\n',
      [V1_CPU_QUOTA]: '200000\n',
      [V1_CPU_PERIOD]: '100000\n',
      '/sys/fs/cgroup/cpu/kubepods/cpu.cfs_quota_us': '200000\n',
      '/sys/fs/cgroup/cpu/kubepods/cpu.cfs_period_us': '100000\n',
      '/sys/fs/cgroup/cpu/kubepods/pod123/cpu.cfs_quota_us': '100000\n',
      '/sys/fs/cgroup/cpu/kubepods/pod123/cpu.cfs_period_us': '100000\n',
    })
    expect(resolveMaxWorkers({ readFile, availableParallelism: 8 })).toBe(1)
  })

  it('prefers a tight v1 ancestor quota over an unlimited leaf', () => {
    const readFile = stubReader({
      [CGROUP]: '2:cpu:/kubepods/pod123\n0::/kubepods/pod123\n',
      [V1_CPU_QUOTA]: '200000\n',
      [V1_CPU_PERIOD]: '100000\n',
      '/sys/fs/cgroup/cpu/kubepods/cpu.cfs_quota_us': '100000\n',
      '/sys/fs/cgroup/cpu/kubepods/cpu.cfs_period_us': '100000\n',
      '/sys/fs/cgroup/cpu/kubepods/pod123/cpu.cfs_quota_us': '-1\n',
      '/sys/fs/cgroup/cpu/kubepods/pod123/cpu.cfs_period_us': '100000\n',
    })
    expect(resolveMaxWorkers({ readFile, availableParallelism: 8 })).toBe(1)
  })

  it('prefers a tight v1 ancestor quota over a looser leaf quota', () => {
    const readFile = stubReader({
      [CGROUP]: '2:cpu:/kubepods/pod123\n0::/kubepods/pod123\n',
      [V1_CPU_QUOTA]: '200000\n',
      [V1_CPU_PERIOD]: '100000\n',
      '/sys/fs/cgroup/cpu/kubepods/cpu.cfs_quota_us': '100000\n',
      '/sys/fs/cgroup/cpu/kubepods/cpu.cfs_period_us': '100000\n',
      '/sys/fs/cgroup/cpu/kubepods/pod123/cpu.cfs_quota_us': '200000\n',
      '/sys/fs/cgroup/cpu/kubepods/pod123/cpu.cfs_period_us': '100000\n',
    })
    expect(resolveMaxWorkers({ readFile, availableParallelism: 8 })).toBe(1)
  })

  it('demonstrates the current-container fixture with quota 1', () => {
    const readFile = stubReader({ [CGROUP]: '0::/\n', [V2_ROOT]: '100000 100000\n' })
    expect(resolveMaxWorkers({ readFile, availableParallelism: 8 })).toBe(1)
  })
})

describe('resolveMaxWorkers affinity and reader edges', () => {
  it('clamps zero, negative, and NaN affinity to 1', () => {
    const readFile = stubReader({ [CGROUP]: '0::/\n', [V2_ROOT]: '200000 100000\n' })
    expect(resolveMaxWorkers({ readFile, availableParallelism: 0 })).toBe(1)
    expect(resolveMaxWorkers({ readFile, availableParallelism: -4 })).toBe(1)
    expect(resolveMaxWorkers({ readFile, availableParallelism: NaN })).toBe(1)
  })

  it('falls back to capped affinity when the reader throws', () => {
    const throwing: WorkersFileReader = () => {
      throw new Error('boom')
    }
    expect(resolveMaxWorkers({ readFile: throwing, availableParallelism: 8 })).toBe(2)
    expect(resolveMaxWorkers({ readFile: throwing, availableParallelism: 1 })).toBe(1)
  })
})

describe('resolveMaxWorkers malformed inputs', () => {
  it('falls back for malformed v2 cpu.max values including extra tokens', () => {
    const cases = [
      '',
      '   \n',
      '100000\n',
      '100000 100000 extra\n',
      'abc 100000\n',
      '100000 xyz\n',
      '0 100000\n',
      '-100000 100000\n',
      '100000 0\n',
    ]
    for (const cpuMax of cases) {
      const readFile = stubReader({ [CGROUP]: '0::/\n', [V2_ROOT]: cpuMax })
      expect(resolveMaxWorkers({ readFile, availableParallelism: 8 })).toBe(2)
    }
  })

  it('falls back for malformed v1 quota/period values including extra tokens', () => {
    const cases: Array<[string, string]> = [
      ['', '100000\n'],
      ['   \n', '100000\n'],
      ['100000 extra\n', '100000\n'],
      ['100000\n', '100000 extra\n'],
      ['abc\n', '100000\n'],
      ['100000\n', 'xyz\n'],
      ['0\n', '100000\n'],
      ['100000\n', '0\n'],
      ['-100000\n', '-100000\n'],
    ]
    for (const [quota, period] of cases) {
      const readFile = stubReader({
        [CGROUP]: '2:cpu:/\n0::/\n',
        [V1_CPU_QUOTA]: quota,
        [V1_CPU_PERIOD]: period,
      })
      expect(resolveMaxWorkers({ readFile, availableParallelism: 8 })).toBe(2)
    }
  })
})

describe('resolveMaxWorkers actual host', () => {
  it('vitest config derives maxWorkers from the resolver', async () => {
    const source = readFileSync(new URL('./vitest.config.ts', import.meta.url), 'utf8')
    expect(source).toContain('resolveMaxWorkers')
    const config = await import('./vitest.config.ts')
    const testConfig = (config.default as { test?: { maxWorkers?: number } }).test
    expect(testConfig?.maxWorkers).toBe(resolveMaxWorkers())
  })

  it('matches root v2 quota on root-unified hosts with readable cpu.max', () => {
    const tryRead = (path: string): string | null => {
      try {
        return readFileSync(path, 'utf8')
      } catch {
        return null
      }
    }
    const cgroup = tryRead('/proc/self/cgroup')
    const cpuMax = tryRead('/sys/fs/cgroup/cpu.max')
    if (cgroup === null || cpuMax === null || cgroup.trim() !== '0::/') return
    const parts = cpuMax.trim().split(/\s+/)
    if (parts.length !== 2 || parts[0] === 'max') return
    const quota = Number(parts[0])
    const period = Number(parts[1])
    if (!Number.isFinite(quota) || !Number.isFinite(period) || quota <= 0 || period <= 0) return
    const affinity = ((): number => {
      try {
        return Math.max(1, Math.min(2, Math.floor(availableParallelism())))
      } catch {
        return 1
      }
    })()
    expect(resolveMaxWorkers()).toBe(Math.max(1, Math.min(affinity, Math.floor(quota / period))))
  })

  it('resolves CI-like capped affinity 2 for unlimited root v2', () => {
    const readFile = stubReader({ [CGROUP]: '0::/\n', [V2_ROOT]: 'max 100000\n' })
    expect(resolveMaxWorkers({ readFile, availableParallelism: 8 })).toBe(2)
  })
})
