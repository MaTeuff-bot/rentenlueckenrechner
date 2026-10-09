import { describe, expect, it } from 'vitest'
import {
  isSupportedAllocationEligibility,
  marginalTargetsForAdditionalWealth,
  prefillAllocationDraft,
  resolveAllocationTargets,
  validateAllocationDraft,
  type AllocationBucketView,
} from '../capitalIncome/allocationEvent'

const fund = (id: string): AllocationBucketView => ({ id, eligibility: 'accumulating-equity-fund' })
const bank = (id: string): AllocationBucketView => ({ id, eligibility: 'ordinary-bank-deposit' })
const buckets = [fund('fund'), bank('bank')]

describe('allocation eligibility', () => {
  it('supports equity funds and ordinary deposits only', () => {
    expect(isSupportedAllocationEligibility('accumulating-equity-fund')).toBe(true)
    expect(isSupportedAllocationEligibility('ordinary-bank-deposit')).toBe(true)
    for (const other of ['distributing-fund', 'bond', 'cash', undefined, '']) {
      expect(isSupportedAllocationEligibility(other)).toBe(false)
    }
  })
})

describe('resolveAllocationTargets', () => {
  it('splits equally across ALL declared supported buckets when weights are undefined', () => {
    const targets = resolveAllocationTargets({ netWealth: 3000, inflationFactor: 1, buckets, fixedTargets: [] })
    expect(targets).toEqual([{ id: 'fund', target: 1500 }, { id: 'bank', target: 1500 }])
  })
  it('splits equally when all weights are zero (including zero-balance destinations)', () => {
    const targets = resolveAllocationTargets({
      netWealth: 1000, inflationFactor: 1,
      buckets: [fund('a'), bank('b'), bank('zero')],
      fixedTargets: [], remainderWeights: { a: 0, b: 0, zero: 0 },
    })
    expect(targets.map(t => t.target)).toEqual([1000 / 3, 1000 / 3, 1000 / 3])
  })
  it('fills fixed today-euro amounts sequentially with inflation scaling, then weights the rest', () => {
    // Base 3,000; fixed 2,000 today's euros x factor 1.1 = 2,200 nominal to bank;
    // remainder 800 by weights 0.25/0.75 -> fund 200, bank 2,200 + 600 = 2,800.
    const targets = resolveAllocationTargets({
      netWealth: 3000, inflationFactor: 1.1, buckets,
      fixedTargets: [{ bucketId: 'bank', amountToday: 2000 }],
      remainderWeights: { fund: 0.25, bank: 0.75 },
    })
    expect(targets.find(t => t.id === 'fund')!.target).toBeCloseTo(200, 9)
    expect(targets.find(t => t.id === 'bank')!.target).toBeCloseTo(2800, 9)
  })
  it('lets the same bucket receive both a fixed amount and a remainder share', () => {
    // Base 1,000; fixed 400 to fund, remainder 600 at fund-only weight -> fund 1,000.
    const targets = resolveAllocationTargets({
      netWealth: 1000, inflationFactor: 1, buckets,
      fixedTargets: [{ bucketId: 'fund', amountToday: 400 }],
      remainderWeights: { fund: 1, bank: 0 },
    })
    expect(targets.find(t => t.id === 'fund')!.target).toBeCloseTo(1000, 9)
    expect(targets.find(t => t.id === 'bank')!.target).toBeCloseTo(0, 9)
  })
  it('caps fixed priorities at remaining wealth when they overdraw the base', () => {
    // Base 500; fixed 400 fund then 400 bank: fund 400, bank 100, remainder 0.
    const targets = resolveAllocationTargets({
      netWealth: 500, inflationFactor: 1, buckets,
      fixedTargets: [{ bucketId: 'fund', amountToday: 400 }, { bucketId: 'bank', amountToday: 400 }],
      remainderWeights: { fund: 1, bank: 1 },
    })
    expect(targets.find(t => t.id === 'fund')!.target).toBeCloseTo(400, 9)
    expect(targets.find(t => t.id === 'bank')!.target).toBeCloseTo(100, 9)
  })
  it('resolves zero targets at a zero base instead of throwing', () => {
    const targets = resolveAllocationTargets({ netWealth: 0, inflationFactor: 1, buckets,
      fixedTargets: [{ bucketId: 'fund', amountToday: 100 }], remainderWeights: { fund: 1, bank: 1 } })
    expect(targets).toEqual([{ id: 'fund', target: 0 }, { id: 'bank', target: 0 }])
  })
  it('rejects negative bases, unknown ids and unsupported eligibility', () => {
    expect(() => resolveAllocationTargets({ netWealth: -1, inflationFactor: 1, buckets, fixedTargets: [] })).toThrow()
    expect(() => resolveAllocationTargets({ netWealth: 100, inflationFactor: 1, buckets,
      fixedTargets: [{ bucketId: 'ghost', amountToday: 10 }] })).toThrow(/unbekannte Anlage/)
    expect(() => resolveAllocationTargets({ netWealth: 100, inflationFactor: 1,
      buckets: [{ id: 'x', eligibility: 'bond' } as unknown as AllocationBucketView], fixedTargets: [] })).toThrow(/thesaurierende Aktienfonds/)
  })
  it('validates the full declared spec inside the pure operation (no silent remainder rescue)', () => {
    // Unknown remainder ids throw instead of being ignored.
    expect(() => resolveAllocationTargets({ netWealth: 100, inflationFactor: 1, buckets,
      fixedTargets: [], remainderWeights: { fund: 1, bank: 1, ghost: 1 } })).toThrow(/unbekannte Anlage/)
    // Negative, NaN and infinite weights throw instead of defaulting to zero.
    for (const bad of [-1, NaN, Infinity]) {
      expect(() => resolveAllocationTargets({ netWealth: 100, inflationFactor: 1, buckets,
        fixedTargets: [], remainderWeights: { fund: 1, bank: bad } })).toThrow(/nicht negatives, endliches Gewicht/)
    }
    // Duplicate fixed entries throw instead of stacking silently.
    expect(() => resolveAllocationTargets({ netWealth: 1000, inflationFactor: 1, buckets,
      fixedTargets: [{ bucketId: 'fund', amountToday: 100 }, { bucketId: 'fund', amountToday: 50 }],
      remainderWeights: { fund: 1, bank: 1 } })).toThrow(/doppelt/)
    // A supported bucket missing from a positive-weight map still resolves to
    // zero for the remainder (documented), while an explicit zero is kept.
    const targets = resolveAllocationTargets({ netWealth: 1000, inflationFactor: 1,
      buckets: [fund('a'), bank('b'), bank('zero')],
      fixedTargets: [], remainderWeights: { a: 1, b: 1 } })
    expect(targets.find(x => x.id === 'zero')!.target).toBe(0)
  })
})

describe('marginalTargetsForAdditionalWealth', () => {
  it('conserves a bounded extra across partially funded fixed priorities', () => {
    // Base 500 with fixed 400/400: T(500) = 400/100. Extra 700 -> T(1200):
    // fund 400 + remainder 200, bank 400 + remainder 200 (weights 1/1 split the
    // 400 leftover after both fixed priorities fill). Marginals 200/500.
    const marginals = marginalTargetsForAdditionalWealth({ netWealth: 500, baseWealth: 500, additionalWealth: 700,
      inflationFactor: 1, buckets,
      fixedTargets: [{ bucketId: 'fund', amountToday: 400 }, { bucketId: 'bank', amountToday: 400 }],
      remainderWeights: { fund: 1, bank: 1 } })
    expect(marginals.find(m => m.id === 'fund')!.additional).toBeCloseTo(200, 9)
    expect(marginals.find(m => m.id === 'bank')!.additional).toBeCloseTo(500, 9)
    expect(marginals.reduce((s, m) => s + m.additional, 0)).toBeCloseTo(700, 9)
    for (const m of marginals) expect(m.additional).toBeGreaterThanOrEqual(0)
  })
  it('routes the extra to the remainder when fixed targets are fully funded', () => {
    const marginals = marginalTargetsForAdditionalWealth({ netWealth: 3000, baseWealth: 3000, additionalWealth: 300,
      inflationFactor: 1, buckets,
      fixedTargets: [{ bucketId: 'bank', amountToday: 2000 }],
      remainderWeights: { fund: 0.25, bank: 0.75 } })
    expect(marginals.find(m => m.id === 'fund')!.additional).toBeCloseTo(75, 9)
    expect(marginals.find(m => m.id === 'bank')!.additional).toBeCloseTo(225, 9)
  })
})

describe('prefillAllocationDraft', () => {
  it('prefills starting shares without enabling or accepting', () => {
    const draft = prefillAllocationDraft([
      { id: 'fund', value: 60000, holding: 'accumulating-equity-fund' },
      { id: 'bank', value: 40000, holding: 'ordinary-bank-deposit' },
      { id: 'zero', value: 0, holding: 'ordinary-bank-deposit' },
    ])
    expect(draft.enabled).toBe(false)
    expect(draft.accepted).toBe(false)
    expect(draft.fixedTargets).toEqual([])
    expect(draft.remainderWeights.fund).toBeCloseTo(0.6, 9)
    expect(draft.remainderWeights.bank).toBeCloseTo(0.4, 9)
    expect(draft.remainderWeights.zero).toBe(0)
  })
})

describe('validateAllocationDraft', () => {
  const declared = [
    { id: 'fund', holding: 'accumulating-equity-fund' },
    { id: 'bank', holding: 'ordinary-bank-deposit' },
  ]
  it('accepts clean drafts and empty drafts', () => {
    expect(validateAllocationDraft(declared, undefined).clean).toBe(true)
    expect(validateAllocationDraft(declared, { enabled: true, accepted: true,
      fixedTargets: [{ bucketId: 'fund', amountToday: 100 }],
      remainderWeights: { fund: 1, bank: 2 } }).clean).toBe(true)
  })
  it('preserves dangling ids with meaningful field ids instead of dropping them', () => {
    const result = validateAllocationDraft(declared, { enabled: true, accepted: true,
      fixedTargets: [{ bucketId: 'ghost', amountToday: 100 }],
      remainderWeights: { bank: 1, stale: 2 } })
    expect(result.clean).toBe(false)
    expect(result.danglingIds.sort()).toEqual(['ghost', 'stale'])
    expect(result.fieldIssues.map(f => f.fieldId).sort()).toEqual(
      ['allocation-dangling-ghost', 'allocation-dangling-stale'])
  })
  it('flags reclassified-to-unsupported destinations as dangling', () => {
    const result = validateAllocationDraft(
      [{ id: 'fund', holding: 'bond' }, { id: 'bank', holding: 'ordinary-bank-deposit' }],
      { enabled: true, accepted: true, fixedTargets: [], remainderWeights: { fund: 1, bank: 1 } })
    expect(result.clean).toBe(false)
    expect(result.danglingIds).toEqual(['fund'])
  })
})
