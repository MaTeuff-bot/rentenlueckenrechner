import { describe, expect, it } from 'vitest'
import type { OpeningBucket } from '../investmentTax/index.js'
import type { LifecycleBucketDef, LifecycleConfig } from '../lifecycleAllocation/index.js'
import { buildContributionInput, resolveInsuranceBurden } from './insuranceAssessment.js'
import { createLedgerState, simulateLedgerYear } from './index.js'
import { assessTerminalInsurance } from './terminalInsurance.js'
import type { LedgerInsuranceSpec, LedgerYearInput } from './index.js'

const buckets: LifecycleBucketDef[] = [
  { id: 'cash', name: 'Cash', kind: 'deposit', priority: 1 },
  { id: 'equity', name: 'Equity', kind: 'equityFund', priority: 2 },
]
function config(): LifecycleConfig {
  return {
    buckets,
    milestones: [{ name: 'only', startAge: 30, targets: { cash: { role: 'percent', share: 0.5 }, equity: { role: 'percent', share: 0.5 } } }],
    transitions: [],
    taxCashId: 'cash',
  }
}
function opening(): OpeningBucket[] {
  return [
    { id: 'cash', name: 'Cash', classification: 'deposit', value: 20000 },
    { id: 'equity', name: 'Equity', classification: 'equityFund', units: 400, price: 100, acquisitionCost: 40000 },
  ]
}
function spec(patch: Partial<LedgerInsuranceSpec> = {}): LedgerInsuranceSpec {
  return {
    status: 'voluntary',
    phase: 'pension',
    calendarYear: 2026,
    cashflowBeforeInsuranceMonthly: 2000,
    insurerAdditionalRate: 0.025,
    insuredBirthYear: 1960,
    isParent: false,
    childBirthYears: [],
    statutoryPensions: [],
    occupationalPensions: [],
    rentalAssessmentMonthly: 0,
    drvSubsidy: 'not-received',
    ...patch,
  }
}
function yearInput(insurance: LedgerInsuranceSpec): LedgerYearInput {
  return {
    age: 66,
    year: 2026,
    contribution: 0,
    withdrawalNeed: 0,
    allowance: 100000,
    churchRate: 0,
    fundPrices: { equity: 120 },
    depositRates: { cash: 0 },
    basisRate: 0.025,
    inflationFactor: 1,
    insurance,
  }
}
describe('manual capital assessment fallback', () => {
  it('manual capital 0 differs from per-bucket automatic and does not become full replacement', () => {
    const cfg = config()
    const stAuto = createLedgerState(cfg, 2026, opening())
    const auto = simulateLedgerYear(cfg, stAuto, yearInput(spec({})))
    expect(auto.report.insuranceAssumption).toBe('per-bucket')
    expect(auto.report.capitalAssessmentAnnual).toBeGreaterThan(0)
    const stManual = createLedgerState(cfg, 2026, opening())
    const manual = simulateLedgerYear(cfg, stManual, yearInput(spec({ manualCapitalAssessmentMonthlyToday: 0 })))
    expect(manual.report.insuranceAssumption).toBe('manual-capital-assessment')
    expect(manual.report.capitalAssessmentAnnual).toBe(0)
    expect(manual.report.insuranceStatus).toBe('automatic')
  })
  it('manual capital 500 today indexes with inflation', () => {
    const cfg = config()
    const st = createLedgerState(cfg, 2026, opening())
    const step = simulateLedgerYear(cfg, st, yearInput(spec({ manualCapitalAssessmentMonthlyToday: 500 })))
    expect(step.report.capitalAssessmentAnnual).toBeCloseTo(500 * 12, 6)
    expect(step.report.insuranceAssumption).toBe('manual-capital-assessment')
  })
  it('manual full replacement and manual capital must not combine', () => {
    const cfg = config()
    const st = createLedgerState(cfg, 2026, opening())
    const burden = resolveInsuranceBurden(
      spec({ manual: { reason: 'full', kvMonthly: 100, pvMonthly: 50 }, manualCapitalAssessmentMonthlyToday: 100 }),
      st,
      2026,
      1,
    )
    expect(burden.converged).toBe(false)
  })
  it('kvdr with manual capital is rejected', () => {
    const cfg = config()
    const st = createLedgerState(cfg, 2026, opening())
    const burden = resolveInsuranceBurden(spec({ status: 'kvdr', manualCapitalAssessmentMonthlyToday: 100 }), st, 2026, 1)
    expect(burden.converged).toBe(false)
  })
  it('terminal incremental respects manual capital base plus liquidation gain', () => {
    const cfg = config()
    const year = yearInput(spec({ manualCapitalAssessmentMonthlyToday: 200 }))
    const { state } = simulateLedgerYear(cfg, createLedgerState(cfg, 2026, opening()), year)
    const terminal = assessTerminalInsurance({
      state,
      taxCashId: 'cash',
      cumulativeInflation: 1,
      spec: spec({ manualCapitalAssessmentMonthlyToday: 200 }),
      baseCapitalAssessmentAnnual: 200 * 12,
    })
    expect(terminal.baseCapitalAssessmentAnnual).toBeCloseTo(2400, 6)
    expect(terminal.augmentedCapitalAssessmentAnnual).toBeGreaterThanOrEqual(2400)
    expect(buildContributionInput(spec({ manualCapitalAssessmentMonthlyToday: 200 }), 999999, 1)).toMatchObject({ mode: 'automatic' })
  })
})
