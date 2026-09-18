import { describe, expect, it } from 'vitest'
import { validateLifecycleConfig } from './index.js'
import type { LifecycleConfig } from './types.js'

function baseConfig(): LifecycleConfig {
  return {
    buckets: [
      { id: 'cash', name: 'Cash', kind: 'deposit', priority: 1 },
      { id: 'equity', name: 'Equity', kind: 'equityFund', priority: 2 },
    ],
    milestones: [
      {
        name: 'only',
        startAge: 30,
        targets: {
          cash: { role: 'percent', share: 0.4 },
          equity: { role: 'percent', share: 0.6 },
        },
      },
    ],
    transitions: [],
    taxCashId: 'cash',
  }
}

describe('validateLifecycleConfig memo parity', () => {
  it('returns stable results per identity for valid and invalid configs', () => {
    const valid = baseConfig()
    expect(validateLifecycleConfig(valid)).toBeNull()
    expect(validateLifecycleConfig(valid)).toBeNull()
    const dupBuckets: LifecycleConfig = {
      ...baseConfig(),
      buckets: [
        { id: 'cash', name: 'Cash', kind: 'deposit', priority: 1 },
        { id: 'cash', name: 'Cash 2', kind: 'deposit', priority: 2 },
      ],
    }
    const first = validateLifecycleConfig(dupBuckets)
    expect(first).toMatch(/Duplicate lifecycle bucket id/)
    expect(validateLifecycleConfig(dupBuckets)).toBe(first)
    const badSettlement: LifecycleConfig = { ...baseConfig(), taxCashId: 'missing' }
    const second = validateLifecycleConfig(badSettlement)
    expect(second).toMatch(/not a configured bucket/)
    expect(validateLifecycleConfig(badSettlement)).toBe(second)
    expect(validateLifecycleConfig(valid)).toBeNull()
  })

  it('validates structurally equal but distinct objects identically without cross-talk', () => {
    const left = baseConfig()
    const right = baseConfig()
    expect(left).not.toBe(right)
    expect(validateLifecycleConfig(left)).toBeNull()
    expect(validateLifecycleConfig(right)).toBeNull()
    const invalid = { ...baseConfig(), milestones: [] as LifecycleConfig['milestones'] }
    expect(validateLifecycleConfig(invalid)).toMatch(/at least one milestone/)
    expect(validateLifecycleConfig(baseConfig())).toBeNull()
  })

  it('rejects non-object configs without throwing from the cache', () => {
    expect(validateLifecycleConfig(null as never)).toMatch(/at least one bucket/)
    expect(validateLifecycleConfig(undefined as never)).toMatch(/at least one bucket/)
    expect(validateLifecycleConfig('cash' as never)).toMatch(/at least one bucket/)
  })
})
