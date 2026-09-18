import { describe, expect, it } from 'vitest'
import {
  applyAnnualPricesAndInterestInBatch,
  beginInvestmentYearInBatch,
  createInvestmentState,
  finishTransactionBatch,
  startTransactionBatch,
} from '../investmentTax/index.js'
import { checked } from '../investmentTax/validation.js'
import { resolveYearlyTargetsEuro, validateLifecycleConfig } from '../lifecycleAllocation/index.js'
import type { LifecycleConfig } from '../lifecycleAllocation/index.js'
import { calculateLedgerContributions } from './insuranceAssessment.js'
import { stableStringifyLifecycleKey } from '../../hooks/useScenarioState.js'

function opening() {
  return [
    { id: 'equity', name: 'Equity', classification: 'equityFund', units: 100, price: 100, acquisitionCost: 8000 },
    { id: 'cash', name: 'Cash', classification: 'deposit', value: 20000 },
  ] as never
}

function validConfig(): LifecycleConfig {
  return {
    buckets: [{ id: 'cash', name: 'Cash', kind: 'deposit', priority: 1 }],
    milestones: [{ name: 'only', startAge: 30, targets: { cash: { role: 'percent', share: 1 } } }],
    transitions: [],
    taxCashId: 'cash',
  }
}

describe('review-fix-final B1 batch finish always fully validates', () => {
  it('prefix mutation below baseCounts throws with batch', () => {
    const b0 = startTransactionBatch(createInvestmentState(2026, opening()))
    beginInvestmentYearInBatch(b0.next, b0.seen, 2026, 1000, 0)
    applyAnnualPricesAndInterestInBatch(b0.next, b0.seen, { equity: 110 }, { cash: 0.02 })
    const finished = finishTransactionBatch(b0.next, b0)
    expect(() => checked(finished)).not.toThrow()
    const b1 = startTransactionBatch(finished)
    b1.next.taxIncome[0]!.gross = NaN
    expect(() => checked(b1.next)).toThrow()
    expect(() => finishTransactionBatch(b1.next, b1)).toThrow()
  })
  it('same-length replacement and truncate-refill throw with batch', () => {
    const b0 = startTransactionBatch(createInvestmentState(2026, opening()))
    beginInvestmentYearInBatch(b0.next, b0.seen, 2026, 1000, 0)
    applyAnnualPricesAndInterestInBatch(b0.next, b0.seen, { equity: 110 }, { cash: 0.02 })
    const finished = finishTransactionBatch(b0.next, b0)
    const b1 = startTransactionBatch(finished)
    const good = { ...b1.next.transactions[0]! }
    b1.next.transactions[0] = { ...good, cash: NaN }
    expect(() => checked(b1.next)).toThrow()
    expect(() => finishTransactionBatch(b1.next, b1)).toThrow()
    b1.next.transactions[0] = good
    expect(() => finishTransactionBatch(b1.next, b1)).not.toThrow()
    const dropped = b1.next.transactions.pop()!
    b1.next.transactions.push({ ...dropped, cash: NaN })
    expect(() => finishTransactionBatch(b1.next, b1)).toThrow()
  })
})

describe('review-fix-final B2 config validation revalidates after mutation', () => {
  it('mutating buckets after a valid result revalidates instead of returning stale null', () => {
    const cfg = validConfig()
    expect(validateLifecycleConfig(cfg)).toBeNull()
    expect(() => resolveYearlyTargetsEuro(cfg, 30, 10000, 1)).not.toThrow()
    cfg.buckets.push({ id: 'evil', name: 'Evil', kind: 'deposit', priority: 2 })
    expect(validateLifecycleConfig(cfg)).toMatch(/misses target|unknown bucket/)
    expect(() => resolveYearlyTargetsEuro(cfg, 30, 10000, 1)).toThrow()
  })
  it('mutating kind after derived use is observed on next call', () => {
    const cfg = validConfig()
    expect(validateLifecycleConfig(cfg)).toBeNull()
    cfg.buckets[0]!.kind = 'equityFund' as never
    expect(validateLifecycleConfig(cfg)).toMatch(/Settlement bucket|at least one deposit/)
  })
})

describe('review-fix-final B3 content-keyed frozen contributions', () => {
  it('in-place spec mutation recomputes instead of returning stale identity hit', () => {
    const spec = {
      status: 'voluntary', phase: 'pension', calendarYear: 2026, cashflowBeforeInsuranceMonthly: 0,
      insurerAdditionalRate: 0.025, insuredBirthYear: 1960, isParent: false, childBirthYears: [],
      statutoryPensions: [], occupationalPensions: [], rentalAssessmentMonthly: 0, drvSubsidy: 'not-received',
    }
    const a = calculateLedgerContributions(spec as never, 0, 1.02)
    spec.rentalAssessmentMonthly = 99999
    const b = calculateLedgerContributions(spec as never, 0, 1.02)
    expect(b).not.toBe(a)
    expect(JSON.stringify(b)).not.toBe(JSON.stringify(a))
  })
  it('cached results are deeply frozen and later hits are not poisoned', () => {
    const spec = {
      status: 'voluntary', phase: 'pension', calendarYear: 2026, cashflowBeforeInsuranceMonthly: 0,
      insurerAdditionalRate: 0.025, insuredBirthYear: 1960, isParent: false, childBirthYears: [],
      statutoryPensions: [], occupationalPensions: [], rentalAssessmentMonthly: 0, drvSubsidy: 'not-received',
    }
    const c = calculateLedgerContributions(spec as never, 999, 1.02)
    expect(Object.isFrozen(c)).toBe(true)
    if (c.status === 'automatic' || c.status === 'manual') {
      expect(Object.isFrozen((c as { assessment?: unknown }).assessment)).toBe(true)
    }
    expect(() => {
      (c as Record<string, unknown>).ownKvMonthly = 99999
    }).toThrow()
    const d = calculateLedgerContributions(spec as never, 999, 1.02)
    expect(d).toBe(c)
    if (d.status === 'automatic' || d.status === 'manual') {
      expect((d as { ownKvMonthly: number }).ownKvMonthly).not.toBe(99999)
    }
  })
})

describe('review-fix-final N4 lifecycle key distinguishes nullish numerics', () => {
  it('undefined, null, NaN, zero, minus-zero and infinities do not collide', () => {
    const keys = new Set([
      stableStringifyLifecycleKey({ a: undefined }),
      stableStringifyLifecycleKey({ a: null }),
      stableStringifyLifecycleKey({ a: NaN }),
      stableStringifyLifecycleKey({}),
      stableStringifyLifecycleKey({ a: 0 }),
      stableStringifyLifecycleKey({ a: -0 }),
      stableStringifyLifecycleKey({ a: Infinity }),
      stableStringifyLifecycleKey({ a: -Infinity }),
    ])
    expect(keys.size).toBe(8)
  })
})
