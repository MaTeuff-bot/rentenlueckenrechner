import { describe, expect, it } from 'vitest'
import type { OpeningBucket } from '../investmentTax/index.js'
import type { LifecycleConfig } from '../lifecycleAllocation/index.js'
import { assessTrialForSearch, isBankOnlySearchSupported, searchLedgerCapital } from './adapters.js'
import type { LedgerYearInput } from './types.js'

function bankConfig(): LifecycleConfig {
  return {
    buckets: [{ id: 'cash', name: 'Cash', kind: 'deposit', priority: 1 }],
    milestones: [{ name: 'only', startAge: 30, targets: { cash: { role: 'percent', share: 1 } } }],
    transitions: [],
    taxCashId: 'cash',
  }
}
function kvdr(year: number) {
  return {
    status: 'kvdr' as const, phase: 'pension' as const, calendarYear: year,
    cashflowBeforeInsuranceMonthly: 0, insurerAdditionalRate: 0.025,
    insuredBirthYear: 1960, isParent: false, childBirthYears: [] as number[],
    statutoryPensions: [], occupationalPensions: [], rentalAssessmentMonthly: 0, drvSubsidy: 'not-received' as const,
  }
}
function manual(year: number, kvMonthly = 0, pvMonthly = 0) {
  return { ...kvdr(year), manual: { reason: 'test', kvMonthly, pvMonthly } }
}
function yr(patch: Partial<LedgerYearInput> = {}, age = 66, year = 2026): LedgerYearInput {
  return {
    age, year, contribution: 0, withdrawalNeed: 0, allowance: 1000, churchRate: 0,
    fundPrices: {}, depositRates: { cash: 0 }, basisRate: 0.025, inflationFactor: 1,
    insurance: manual(year), ...patch,
  }
}
function opening(value: number): OpeningBucket[] {
  return [{ id: 'cash', name: 'Cash', classification: 'deposit', value }]
}

// Independent scalar oracle: own arithmetic, own tax formula, no production survival helpers.
// Mirrors the supported bank-only ledger order: market -> contribution -> capped
// withdrawal -> tax -> fixed insurance. Funded wealth recurrence:
// G(W)=W*(1+r)+c-withdrawal-k*max(0,W*max(r,0)-allowance)-fixedInsurance.
function taxRate(church: 0 | 0.08 | 0.09): number {
  return (1 + 0.055 + church) / (4 + church)
}
function fixedInsurance(y: LedgerYearInput): number {
  const spec = y.insurance as unknown as {
    manual?: { kvMonthly: number; pvMonthly: number }
    status: string
    manualCapitalAssessmentMonthlyToday?: number
  }
  if (spec.manual) {
    const kv = spec.manual.kvMonthly
    const pv = spec.manual.pvMonthly
    if (!Number.isFinite(kv) || !Number.isFinite(pv) || kv < 0 || pv < 0) throw new Error('oracle: invalid manual insurance')
    return (kv + pv) * 12
  }
  if (spec.status === 'kvdr') return 0
  throw new Error('oracle: unsupported insurance assumption (automatic voluntary without manual replacement needs the contribution engine)')
}
function scalarSurvives(capital: number, years: LedgerYearInput[]): boolean {
  if (!Number.isFinite(capital) || capital < 0) throw new Error('oracle: invalid trial capital')
  let w = capital
  for (const y of years) {
    const r = y.depositRates['cash'] ?? 0
    if (typeof r !== 'number' || !Number.isFinite(r) || r < -1) throw new Error('oracle: unsupported deposit rate')
    if (typeof y.allowance !== 'number' || !Number.isFinite(y.allowance) || y.allowance < 0) {
      throw new Error('oracle: unsupported allowance')
    }
    if (y.churchRate !== 0 && y.churchRate !== 0.08 && y.churchRate !== 0.09) throw new Error('oracle: unsupported church rate')
    const afterInflows = w * (1 + r) + y.contribution
    const interestBase = w * Math.max(0, r)
    const tax = Math.max(0, interestBase - y.allowance) * taxRate(y.churchRate)
    const ins = fixedInsurance(y)
    if (!Number.isFinite(afterInflows) || !Number.isFinite(tax) || !Number.isFinite(ins)) {
      throw new Error('oracle: non-finite trial state')
    }
    if (afterInflows < y.withdrawalNeed + tax + ins - 1e-9) return false
    w = afterInflows - y.withdrawalNeed - tax - ins
    if (w < -0.01) return false
  }
  return w >= -0.01
}
function oracleRequiredCapital(years: LedgerYearInput[]): number {
  let low = 0
  let high = 1
  while (!scalarSurvives(high, years)) {
    high *= 2
    if (high > 1e12) throw new Error('oracle: upper bound not found')
  }
  while (high - low > 1) {
    const mid = (low + high) / 2
    if (scalarSurvives(mid, years)) high = mid
    else low = mid
  }
  return high
}

describe('bank-only search hardening (Defect B)', () => {
  it('supported bank-only with nonzero tax, church and fixed insurance matches oracle within 1 euro', () => {
    const cfg = bankConfig()
    const years = [0, 1, 2].map((i) =>
      yr(
        {
          contribution: 1000,
          withdrawalNeed: 8000,
          allowance: 1000,
          churchRate: 0.08,
          depositRates: { cash: [0.05, 0.03, 0.04][i]! },
          inflationFactor: 1,
          insurance: manual(2026 + i, 100, 50),
        },
        66 + i,
        2026 + i,
      ),
    )
    const actual = opening(80000)
    const gate = isBankOnlySearchSupported(cfg, years, actual, 1)
    expect(gate).toMatchObject({ supported: true })
    const res = searchLedgerCapital(cfg, years, { actualOpening: actual, terminalInflation: 1 })
    expect(res.status).toBe('converged')
    if (res.status !== 'converged') throw new Error('should converge')
    const expected = oracleRequiredCapital(years)
    expect(Math.abs(res.requiredCapital - expected)).toBeLessThanOrEqual(1)
    expect(res.requiredCapital).toBeGreaterThan(10000)
    const taxAtExpected = Math.max(0, expected * 0.05 - 1000) * taxRate(0.08)
    expect(taxAtExpected).toBeGreaterThan(0)
  })

  it('closed-form zero-rate sum', () => {
    const cfg = bankConfig()
    const years = [0, 1, 2, 3, 4].map((i) => yr({ withdrawalNeed: 10000, allowance: 1e9, depositRates: { cash: 0 }, inflationFactor: 1 }, 66 + i, 2026 + i))
    const res = searchLedgerCapital(cfg, years, { actualOpening: opening(100000), terminalInflation: 1 })
    expect(res.status).toBe('converged')
    if (res.status !== 'converged') throw new Error('should converge')
    expect(Math.abs(res.requiredCapital - 50000)).toBeLessThanOrEqual(1)
  })

  it('mixed funds, multiple deposits, automatic voluntary, fixed reserve, actual zero, nonmonotone all unsupported', () => {
    const cfg = bankConfig()
    const years = [yr({ inflationFactor: 1 }), yr({ inflationFactor: 1 }, 67, 2027)]
    expect(searchLedgerCapital(cfg, years, { actualOpening: opening(0), terminalInflation: 1 }).status).toBe('unsupported')
    const fixedCfg: LifecycleConfig = {
      ...cfg,
      milestones: [{ name: 'only', startAge: 30, targets: { cash: { role: 'fixedReserve', amountToday: 1000 } } }],
    }
    expect(searchLedgerCapital(fixedCfg, years, { actualOpening: opening(50000), terminalInflation: 1 }).status).toBe('unsupported')
    const dipped = [yr({ inflationFactor: 1 }), yr({ inflationFactor: 0.9 }, 67, 2027)]
    expect(searchLedgerCapital(cfg, dipped, { actualOpening: opening(50000), terminalInflation: 1 }).status).toBe('unsupported')
    const twoDepositCfg: LifecycleConfig = {
      buckets: [
        { id: 'cash', name: 'Cash', kind: 'deposit', priority: 1 },
        { id: 'reserve', name: 'Reserve', kind: 'deposit', priority: 2 },
      ],
      milestones: [{ name: 'only', startAge: 30, targets: { cash: { role: 'percent', share: 0.5 }, reserve: { role: 'percent', share: 0.5 } } }],
      transitions: [],
      taxCashId: 'cash',
    }
    const twoDepositYears = [
      yr({ depositRates: { cash: 0, reserve: 0 }, inflationFactor: 1 }),
      yr({ depositRates: { cash: 0, reserve: 0 }, inflationFactor: 1 }, 67, 2027),
    ]
    const twoDepositRes = searchLedgerCapital(twoDepositCfg, twoDepositYears, {
      actualOpening: [
        { id: 'cash', name: 'Cash', classification: 'deposit', value: 25000 },
        { id: 'reserve', name: 'Reserve', classification: 'deposit', value: 25000 },
      ],
      terminalInflation: 1,
    })
    expect(twoDepositRes.status).toBe('unsupported')
    if (twoDepositRes.status === 'unsupported') expect(twoDepositRes.reason).toMatch(/bank-only/)
    const mixedCfg: LifecycleConfig = {
      buckets: [
        { id: 'cash', name: 'Cash', kind: 'deposit', priority: 1 },
        { id: 'equity', name: 'Equity', kind: 'equityFund', priority: 2 },
      ],
      milestones: [{ name: 'only', startAge: 30, targets: { cash: { role: 'percent', share: 0.5 }, equity: { role: 'percent', share: 0.5 } } }],
      transitions: [],
      taxCashId: 'cash',
    }
    const mixedYears = [yr({ fundPrices: { equity: 100 }, inflationFactor: 1 })]
    expect(searchLedgerCapital(mixedCfg, mixedYears, {
      actualOpening: [
        { id: 'cash', name: 'Cash', classification: 'deposit', value: 10000 },
        { id: 'equity', name: 'Equity', classification: 'equityFund', units: 100, price: 100, acquisitionCost: 10000 },
      ],
      terminalInflation: 1,
    }).status).toBe('unsupported')
    const autoYears = [yr({ insurance: kvdr(2026) }, 66, 2026)]
    expect(searchLedgerCapital(cfg, autoYears, { actualOpening: opening(50000), terminalInflation: 1 }).status).not.toBe('unsupported')
    const autoVol = [{ ...yr({}, 66, 2026), insurance: { ...kvdr(2026), status: 'voluntary' as const } }]
    expect(searchLedgerCapital(cfg, autoVol, { actualOpening: opening(50000), terminalInflation: 1 }).status).toBe('unsupported')
  })

  it('oracle throws for unsupported insurance instead of returning zero', () => {
    const autoVol = [{ ...yr({}, 66, 2026), insurance: { ...kvdr(2026), status: 'voluntary' as const } }]
    expect(() => scalarSurvives(50000, autoVol)).toThrow(/unsupported insurance/)
    expect(() => fixedInsurance(autoVol[0]!)).toThrow(/unsupported insurance/)
    expect(() => scalarSurvives(50000, [yr({ depositRates: { cash: -1.01 }, inflationFactor: 1 })])).toThrow(/unsupported deposit rate/)
  })

  it('solver/insurance failure is nonconverged, never false depletion', () => {
    const cfg = bankConfig()
    const mismatched = [yr({ insurance: manual(2099, 0, 0) }, 66, 2026)]
    const res = searchLedgerCapital(cfg, mismatched, { actualOpening: opening(50000), terminalInflation: 1 })
    expect(res.status).toBe('nonconverged')
  })

  it('assessTrialForSearch validates inputs with explicit diagnostics', () => {
    const cfg = bankConfig()
    const years = [yr({ inflationFactor: 1 })]
    expect(() => assessTrialForSearch(cfg, [], years, 1)).toThrow(/trial opening/)
    expect(() => assessTrialForSearch(cfg, opening(1000), [], 1)).toThrow(/ledger year/)
    expect(() => assessTrialForSearch(cfg, opening(1000), years, 0)).toThrow(/terminal inflation/)
  })

  it('zero lower bound with later contributions still converges (low is artefact)', () => {
    const cfg = bankConfig()
    const years = [
      yr({ contribution: 0, withdrawalNeed: 20000, allowance: 1e9, depositRates: { cash: 0 }, inflationFactor: 1 }, 66, 2026),
      yr({ contribution: 30000, withdrawalNeed: 0, allowance: 1e9, depositRates: { cash: 0 }, inflationFactor: 1 }, 67, 2027),
    ]
    const res = searchLedgerCapital(cfg, years, { actualOpening: opening(50000), terminalInflation: 1 })
    expect(res.status).toBe('converged')
  })

  it('true zero required capital when contributions cover needs', () => {
    const cfg = bankConfig()
    const years = [0, 1, 2].map((i) =>
      yr({ contribution: 10000, withdrawalNeed: 0, allowance: 1e9, depositRates: { cash: 0 }, inflationFactor: 1, insurance: manual(2026 + i, 0, 0) }, 66 + i, 2026 + i),
    )
    const res = searchLedgerCapital(cfg, years, { actualOpening: opening(50000), terminalInflation: 1 })
    expect(res.status).toBe('converged')
    if (res.status !== 'converged') throw new Error('should converge')
    expect(res.requiredCapital).toBeLessThanOrEqual(1)
  })

  it('signed rates with church tax, kinked allowance and fixed insurance match oracle', () => {
    const cfg = bankConfig()
    const years = [
      yr({ contribution: 500, withdrawalNeed: 3000, allowance: 200, churchRate: 0.09, depositRates: { cash: 0.06 }, inflationFactor: 1, insurance: manual(2026, 80, 40) }, 66, 2026),
      yr({ contribution: 500, withdrawalNeed: 3000, allowance: 5000, churchRate: 0.09, depositRates: { cash: -0.04 }, inflationFactor: 1, insurance: manual(2027, 80, 40) }, 67, 2027),
      yr({ contribution: 500, withdrawalNeed: 3000, allowance: 200, churchRate: 0.09, depositRates: { cash: 0.03 }, inflationFactor: 1, insurance: manual(2028, 80, 40) }, 68, 2028),
    ]
    const res = searchLedgerCapital(cfg, years, { actualOpening: opening(20000), terminalInflation: 1 })
    expect(res.status).toBe('converged')
    if (res.status !== 'converged') throw new Error('should converge')
    const expected = oracleRequiredCapital(years)
    expect(Math.abs(res.requiredCapital - expected)).toBeLessThanOrEqual(1)
    expect(expected).toBeGreaterThan(0)
  })
})
