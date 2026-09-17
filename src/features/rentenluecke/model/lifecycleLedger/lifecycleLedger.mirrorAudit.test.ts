import { describe, expect, it } from 'vitest'
import type { OpeningBucket } from '../investmentTax/index.js'
import { createLifecycleState, simulateLifecycleYear } from '../lifecycleAllocation/index.js'
import type { LifecycleBucketDef, LifecycleConfig } from '../lifecycleAllocation/index.js'
import { LedgerInsuranceError, createLedgerState, simulateLedgerYear } from './index.js'
import type { LedgerInsuranceSpec, LedgerYearInput } from './index.js'

const buckets: LifecycleBucketDef[] = [
  { id: 'cash', name: 'Cash', kind: 'deposit', priority: 1 },
  { id: 'bond', name: 'Bond', kind: 'bondFund', priority: 2 },
  { id: 'equity', name: 'Equity', kind: 'equityFund', priority: 3 },
]
function config(): LifecycleConfig {
  return {
    buckets,
    milestones: [
      { name: 'accum', startAge: 30, targets: { cash: { role: 'percent', share: 0.2 }, bond: { role: 'percent', share: 0.3 }, equity: { role: 'percent', share: 0.5 } } },
      { name: 'retired', startAge: 65, targets: { cash: { role: 'percent', share: 0.3 }, bond: { role: 'percent', share: 0.3 }, equity: { role: 'percent', share: 0.4 } } },
    ],
    transitions: [{ fromMilestone: 'accum', toMilestone: 'retired', startAge: 65, durationYears: 0 }],
    taxCashId: 'cash',
  }
}
function opening(): OpeningBucket[] {
  return [
    { id: 'cash', name: 'Cash', classification: 'deposit', value: 18000 },
    { id: 'bond', name: 'Bond', classification: 'bondFund', units: 270, price: 100, acquisitionCost: 27000 },
    { id: 'equity', name: 'Equity', classification: 'equityFund', units: 450, price: 100, acquisitionCost: 45000 },
  ]
}
function manualZero(calendarYear: number): LedgerInsuranceSpec {
  return {
    status: 'voluntary',
    phase: 'pension',
    calendarYear,
    cashflowBeforeInsuranceMonthly: 2500,
    insurerAdditionalRate: 0.025,
    insuredBirthYear: 1960,
    isParent: false,
    childBirthYears: [],
    statutoryPensions: [],
    occupationalPensions: [],
    rentalAssessmentMonthly: 0,
    drvSubsidy: 'not-received',
    manual: { reason: 'audit isolation', kvMonthly: 0, pvMonthly: 0 },
  }
}
describe('execution mirror audit', () => {
  it('non-depleted ledger matches engine when tax is neutralised and insurance is zero', () => {
    const cfg = config()
    const ledgerState = createLedgerState(cfg, 2026, opening())
    const engineState = createLifecycleState(cfg, 2026, opening())
    const ledgerInput: LedgerYearInput = {
      age: 66,
      year: 2026,
      contribution: 0,
      withdrawalNeed: 5000,
      allowance: 100000,
      churchRate: 0,
      fundPrices: { bond: 102, equity: 105 },
      depositRates: { cash: 0.01 },
      basisRate: 0.025,
      inflationFactor: 1,
      insurance: manualZero(2026),
    }
    const ledger = simulateLedgerYear(cfg, ledgerState, ledgerInput)
    const engine = simulateLifecycleYear(cfg, engineState, {
      age: 66,
      year: 2026,
      contribution: 0,
      withdrawalNeed: 5000,
      allowance: 100000,
      churchRate: 0,
      fundPrices: { bond: 102, equity: 105 },
      depositRates: { cash: 0.01 },
      basisRate: 0.025,
      inflationFactor: 1,
    })
    expect(ledger.report.solverExhausted).toBe(false)
    expect(engine.report.solverExhausted).toBe(false)
    expect(ledger.report.withdrawal).toBeCloseTo(engine.report.withdrawal, 2)
    expect(ledger.report.closingValue).toBeCloseTo(engine.report.closingValue, 2)
    expect(ledger.report.unfundedWithdrawal).toBeCloseTo(engine.report.unfundedWithdrawal, 6)
    expect(ledger.report.taxPaid).toBeCloseTo(engine.report.taxPaid, 2)
  })
  it('insurance calendar mismatch fails closed', () => {
    const cfg = config()
    const st = createLedgerState(cfg, 2026, opening())
    const bad: LedgerYearInput = {
      age: 66,
      year: 2026,
      contribution: 0,
      withdrawalNeed: 0,
      allowance: 1000,
      churchRate: 0,
      fundPrices: { bond: 100, equity: 100 },
      depositRates: { cash: 0 },
      basisRate: 0.025,
      inflationFactor: 1,
      insurance: manualZero(2027),
    }
    expect(() => simulateLedgerYear(cfg, st, bad)).toThrowError(LedgerInsuranceError)
  })
})
