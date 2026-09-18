import { describe, expect, it } from 'vitest'
import { createLifecycleState } from '../lifecycleAllocation/index.js'
import type { LifecycleConfig } from '../lifecycleAllocation/index.js'
import type { OpeningBucket } from '../investmentTax/index.js'
import { buildContributionInput, calculateLedgerContributions, isCapitalIndependentInsuranceSpec, resolveInsuranceBurden, sumAssessmentIncomeAnnual } from './insuranceAssessment.js'
import { calculateContributions } from '../contributions/contributionEngine.js'
import { simulateLedgerYear } from './annualCashflow.js'
import type { LedgerYearInput } from './types.js'

function config(): LifecycleConfig {
  return {
    buckets: [{ id: 'cash', name: 'Cash', kind: 'deposit', priority: 1 }],
    milestones: [{ name: 'only', startAge: 65, targets: { cash: { role: 'percent', share: 1 } } }],
    transitions: [],
    taxCashId: 'cash',
  }
}
function opening(value = 50000): OpeningBucket[] {
  return [{ id: 'cash', name: 'Cash', classification: 'deposit', value }]
}
function baseSpec(year = 2026, patch: Record<string, unknown> = {}) {
  return {
    status: 'kvdr' as const,
    phase: 'pension' as const,
    calendarYear: year,
    cashflowBeforeInsuranceMonthly: 100,
    insurerAdditionalRate: 0.025,
    insuredBirthYear: 1960,
    isParent: false,
    childBirthYears: [] as number[],
    statutoryPensions: [],
    occupationalPensions: [],
    rentalAssessmentMonthly: 0,
    drvSubsidy: 'not-received' as const,
    manual: null,
    ...patch,
  }
}
function yearInput(spec: unknown, year = 2026): LedgerYearInput {
  return {
    age: 65, year, contribution: 0, withdrawalNeed: 1000, allowance: 1000, churchRate: 0,
    fundPrices: {}, depositRates: { cash: 0.01 }, basisRate: 0.025, inflationFactor: 1.02,
    insurance: spec as LedgerYearInput['insurance'],
  }
}

describe('insurance hoisting parity', () => {
  it('domain check identifies capital-independent specs and falls back for per-bucket automatic', () => {
    const kvdr = baseSpec()
    const manual = baseSpec(2026, { status: 'voluntary' as const, manual: { reason: 't', kvMonthly: 10, pvMonthly: 5 } })
    const manualCapital = baseSpec(2026, { status: 'voluntary' as const, manualCapitalAssessmentMonthlyToday: 50 })
    const perBucket = baseSpec(2026, { status: 'voluntary' as const })
    expect(isCapitalIndependentInsuranceSpec(kvdr as never)).toBe(true)
    expect(isCapitalIndependentInsuranceSpec(manual as never)).toBe(true)
    expect(isCapitalIndependentInsuranceSpec(manualCapital as never)).toBe(true)
    expect(isCapitalIndependentInsuranceSpec(perBucket as never)).toBe(false)
  })
  it('supported specs give identical burden amounts across different capital states', () => {
    const cfg = config()
    const s1 = createLifecycleState(cfg, 2026, opening(50000))
    const s2 = createLifecycleState(cfg, 2026, opening(100000))
    ;(s1 as unknown as { contributionIncome: unknown[] }).contributionIncome = [{ ledgerYear: 2026, receiptYear: 2026, gross: 1000, exemptFraction: 0, amount: 1000 }]
    ;(s2 as unknown as { contributionIncome: unknown[] }).contributionIncome = [{ ledgerYear: 2026, receiptYear: 2026, gross: 9000, exemptFraction: 0, amount: 9000 }]
    for (const spec of [baseSpec(), baseSpec(2026, { status: 'voluntary' as const, manual: { reason: 't', kvMonthly: 10, pvMonthly: 5 } }), baseSpec(2026, { status: 'voluntary' as const, manualCapitalAssessmentMonthlyToday: 50 })]) {
      const a = resolveInsuranceBurden(spec as never, s1, 2026, 1.02)
      const b = resolveInsuranceBurden(spec as never, s2, 2026, 1.02)
      expect(a.converged).toBe(true)
      expect(b.converged).toBe(true)
      if (a.converged && b.converged) {
        expect(a.result.ownKvMonthly).toBe(b.result.ownKvMonthly)
        expect(a.result.ownPvMonthly).toBe(b.result.ownPvMonthly)
        expect(a.assumption).toBe(b.assumption)
      }
    }
  })
  it('hoisted ledger year is byte-identical across repeated runs for supported and unsupported', () => {
    const cfg = config()
    const specs = [
      baseSpec(),
      baseSpec(2026, { status: 'voluntary' as const, manual: { reason: 't', kvMonthly: 10, pvMonthly: 5 } }),
      baseSpec(2026, { status: 'voluntary' as const, manualCapitalAssessmentMonthlyToday: 50 }),
      baseSpec(2026, { status: 'voluntary' as const }),
    ]
    for (const spec of specs) {
      const input = yearInput(spec)
      const r1 = simulateLedgerYear(cfg, createLifecycleState(cfg, 2026, opening()), input)
      const r2 = simulateLedgerYear(cfg, createLifecycleState(cfg, 2026, opening()), input)
      expect(JSON.stringify(r1)).toBe(JSON.stringify(r2))
      expect(r1.report.insuranceConverged).toBe(true)
      expect(sumAssessmentIncomeAnnual(r1.state, 2026)).toBeGreaterThanOrEqual(0)
    }
  })
  it('invalid manual+manualCapital combo fails identically (hoisted validation parity)', () => {
    const cfg = config()
    const bad = baseSpec(2026, { status: 'voluntary' as const, manual: { reason: 't', kvMonthly: 1, pvMonthly: 1 }, manualCapitalAssessmentMonthlyToday: 5 })
    expect(isCapitalIndependentInsuranceSpec(bad as never)).toBe(true)
    const input = yearInput(bad)
    expect(() => simulateLedgerYear(cfg, createLifecycleState(cfg, 2026, opening()), input)).toThrow(/must not combine/)
  })
})

describe('ledger contribution memo', () => {
  const matrix = [
    baseSpec(),
    baseSpec(2026, { status: 'voluntary' as const, manual: { reason: 't', kvMonthly: 10, pvMonthly: 5 } }),
    baseSpec(2026, { status: 'voluntary' as const, manualCapitalAssessmentMonthlyToday: 50 }),
    baseSpec(2026, { status: 'voluntary' as const, rentalAssessmentMonthly: 200, capitalAssessmentMonthly: undefined }),
    baseSpec(2026, { status: 'unknown' as const }),
  ]
  it('memoized results are byte-identical to direct computation, including failures', () => {
    for (const spec of matrix) {
      for (const capital of [0, 1234.56]) {
        const direct = calculateContributions(buildContributionInput(spec as never, capital, 1.02))
        const memo = calculateLedgerContributions(spec as never, capital, 1.02)
        expect(JSON.parse(JSON.stringify(memo))).toEqual(JSON.parse(JSON.stringify(direct)))
      }
    }
    const invalid = baseSpec(2026, { status: 'voluntary' as const, insurerAdditionalRate: 5 })
    const directBad = calculateContributions(buildContributionInput(invalid as never, 0, 1.02))
    const memoBad = calculateLedgerContributions(invalid as never, 0, 1.02)
    expect(directBad.status).not.toBe('automatic')
    expect(JSON.parse(JSON.stringify(memoBad))).toEqual(JSON.parse(JSON.stringify(directBad)))
  })
  it('identical triples share the reference; distinct capital computes separately', () => {
    const spec = baseSpec()
    const a = calculateLedgerContributions(spec as never, 0, 1.02)
    const b = calculateLedgerContributions(structuredClone(spec) as never, 0, 1.02)
    expect(b).toBe(a)
    const other = calculateLedgerContributions(spec as never, 999, 1.02)
    expect(JSON.parse(JSON.stringify(other))).toEqual(JSON.parse(JSON.stringify(calculateContributions(buildContributionInput(spec as never, 999, 1.02)))))
  })
  it('frozen shared results survive a full ledger year untouched', () => {
    const cfg = config()
    const spec = baseSpec()
    const shared = calculateLedgerContributions(spec as never, 0, 1.02)
    Object.freeze(shared)
    if (shared.status === 'automatic' || shared.status === 'manual') {
      Object.freeze((shared as { assessment?: unknown[] }).assessment)
    }
    const r = simulateLedgerYear(cfg, createLifecycleState(cfg, 2026, opening()), yearInput(spec))
    expect(r.report.insuranceConverged).toBe(true)
    expect(JSON.parse(JSON.stringify(calculateLedgerContributions(spec as never, 0, 1.02)))).toEqual(JSON.parse(JSON.stringify(shared)))
  })
})

describe('cross-path memoization parity', () => {
  it('identity-keyed contribution cache shares the reference without recomputation', () => {
    const spec = baseSpec()
    const a = calculateLedgerContributions(spec as never, 0, 1.02)
    const b = calculateLedgerContributions(spec as never, 0, 1.02)
    expect(b).toBe(a)
    const otherInflation = calculateLedgerContributions(spec as never, 0, 1.03)
    expect(otherInflation).not.toBe(a)
    expect(JSON.parse(JSON.stringify(otherInflation))).toEqual(
      JSON.parse(JSON.stringify(calculateContributions(buildContributionInput(spec as never, 0, 1.03)))),
    )
  })
  it('per-year insurance specs are shared for identical inputs and rebuilt otherwise', async () => {
    const scenario = await import('../lifecycleScenario.js')
    const fixtures = await import('../__tests__/insuranceFixtures.js')
    const streams: never[] = []
    const insurance = fixtures.automaticInsurance()
    const input = {
      currentAge: 65, retirementAge: 67, planningAge: 70,
      monthlyContributionToday: 100, monthlyDesiredSpendingToday: 500,
      retirementInsurance: insurance,
    } as never
    type LedgerYearsArgs = Parameters<typeof scenario.buildLedgerYears>[0]
    const market = (inflationFactor: number): LedgerYearsArgs['marketYears'] => ([
      { fundPrices: {}, depositRates: { fixed: 0.01 }, inflationFactor, annualInflationRate: 0.02 },
    ])
    const args = (marketYears: LedgerYearsArgs['marketYears']): LedgerYearsArgs => ({
      input, streams,
      portfolioBuckets: [{ id: 'fixed', name: 'Fixed', value: 1000, returnSeriesId: 'synthetic-cash-assumption-v1', annualCostRate: 0 }],
      classification: { fixed: 'deposit' },
      tax: { allowanceAnnualToday: 0, churchRate: 0, basisRate: 0.03 },
      marketYears, firstCalendarYear: 2026,
    }) as never
    const first = scenario.buildLedgerYears(args(market(1.05)))
    const second = scenario.buildLedgerYears(args(market(1.05)))
    expect(second[0]!.insurance).toBe(first[0]!.insurance)
    expect(second).toEqual(first)
    const shifted = scenario.buildLedgerYears(args(market(1.1)))
    expect(shifted[0]!.insurance).not.toBe(first[0]!.insurance)
    expect(JSON.stringify(shifted[0])).not.toBe(JSON.stringify(first[0]))
    const rebuilt = scenario.buildLedgerYears({
      ...args(market(1.05)),
      streams: [...streams],
      input: { ...(input as Record<string, unknown>), retirementInsurance: { ...insurance } },
    } as never)
    expect(rebuilt[0]!.insurance).not.toBe(first[0]!.insurance)
    expect(rebuilt[0]!.insurance).toEqual(first[0]!.insurance)
    expect(() => scenario.buildLedgerYears({ ...args(market(1.05)), input: { ...(input as Record<string, unknown>), retirementInsurance: undefined } } as never)).toThrow(
      /Insurance answers required/,
    )
  })
  it('expected bucket returns are shared for identical references and recomputed otherwise', async () => {
    const scenario = await import('../lifecycleScenario.js')
    const state = (await import('../../hooks/scenarioState/defaults.js')).createDefaultState()
    const portfolioBuckets = state.portfolioBuckets
    const { createPortfolioComponentsFromBuckets } = await import('../portfolioBuckets.js')
    const settings = { portfolioComponents: createPortfolioComponentsFromBuckets(portfolioBuckets), inflationSourceId: 'fixed-manual', simulations: 1 }
    const a = scenario.expectedBucketReturns(portfolioBuckets as never, settings as never, 0.02)
    const b = scenario.expectedBucketReturns(portfolioBuckets as never, settings as never, 0.02)
    expect(b).toBe(a)
    const c = scenario.expectedBucketReturns([...portfolioBuckets] as never, settings as never, 0.02)
    expect(c).toEqual(a)
    expect(c).not.toBe(a)
  })
})
