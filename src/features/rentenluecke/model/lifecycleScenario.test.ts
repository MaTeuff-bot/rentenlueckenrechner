import { describe, expect, it } from 'vitest'
import { SYNTHETIC_RETURN_SERIES_IDS } from './historicalReturns/constants.js'
import { createDefaultRetirementInsurance } from './retirementInsurance.js'
import type { PortfolioBucket } from './portfolioBuckets.js'
import {
  buildLedgerYears,
  buildLifecycleConfig,
  buildOpeningBuckets,
  deriveDeterministicMarketYears,
  deriveMarketYears,
  runLifecycleBootstrap,
  runLifecycleScenario,
  searchLifecycleCapital,
  summarizeLedgerResult,
} from './lifecycleScenario.js'
import { liquidateLifecycle } from './lifecycleAllocation/index.js'
import { runLedgerDeterministic } from './lifecycleLedger/index.js'
import {
  applySourceCostTreatment,
  resolveComponentExpectedNominalReturn,
  resolveComponentNominalReturn,
} from './historicalReturns/bootstrapSampling.js'
import { findHistoricalReturnSeries } from './historicalReturns/returnSeriesRegistry.js'
import type { HistoricalBootstrapSettings } from './historicalReturns/types.js'
import type { RentenlueckeInput } from './types.js'

function buckets(): PortfolioBucket[] {
  return [
    { id: 'cash', name: 'Cash', value: 20000, returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.cash, annualCostRate: 0 },
    { id: 'equity', name: 'Equity', value: 30000, returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.equity, annualCostRate: 0.002 },
  ]
}
function input(): RentenlueckeInput {
  return {
    currentAge: 40,
    retirementAge: 67,
    planningAge: 70,
    currentCapital: 50000,
    monthlyContributionToday: 500,
    monthlyDesiredSpendingToday: 2000,
    monthlyRetirementIncomeToday: 1500,
    retirementIncomeStreams: [
      {
        id: 'statutory-pension',
        name: 'Gesetzliche Rente',
        kind: 'gesetzliche-rente',
        amountMonthlyToday: 1500,
        startAge: 67,
        endAge: null,
        amountBasis: 'gross',
        deductionMode: 'effectiveHaircut',
        effectiveDeductionRate: 0,
      },
    ],
    retirementInsurance: {
      ...createDefaultRetirementInsurance(67),
      referenceYear: 2026,
      insurerAdditionalRate: 0.025,
      isParent: false,
      childrenConfirmed: true,
      childBirthYears: [],
      bridge: { status: 'voluntary', circumstances: 'standard', capitalMode: 'manual', capitalMonthlyToday: 0 },
      pension: { status: 'voluntary', circumstances: 'standard', capitalMode: 'manual', capitalMonthlyToday: 0, drvSubsidy: 'not-received' },
    },
    annualInflationRate: 0.02,
    annualReturnBeforeRetirement: 0.05,
    annualReturnInRetirement: 0.03,
  }
}
function settings(): HistoricalBootstrapSettings {
  return {
    portfolioComponents: buckets().map((b) => ({
      id: b.id,
      label: b.name,
      role: b.id === 'cash' ? 'cash' : 'equity',
      weight: 0.5,
      returnSeriesId: b.returnSeriesId,
      annualCostRate: b.annualCostRate ?? 0,
    })),
    inflationSourceId: 'fixed-manual',
    simulations: 10,
  }
}
describe('lifecycle scenario adapters', () => {
  it('opening starts with zero VP history and explicit basis', () => {
    const classification = { cash: 'deposit' as const, equity: 'equityFund' as const }
    const opening = buildOpeningBuckets(buckets(), classification, { equity: 10000 })
    const equity = opening.find((b) => b.id === 'equity')
    if (!equity || equity.classification === 'deposit') throw new Error('missing equity')
    expect(equity.units).toBeCloseTo(300, 9)
    expect(equity.acquisitionCost).toBe(10000)
    expect(equity.price).toBe(100)
  })
  it('accumulation acquires no retirement insurance charges', () => {
    const classification = { cash: 'deposit' as const, equity: 'equityFund' as const }
    const created = runLifecycleScenario({
      input: input(),
      streams: input().retirementIncomeStreams ?? [],
      portfolioBuckets: buckets(),
      classification,
      acquisitionCost: { equity: 10000 },
      milestones: [
        { name: 'Ansparen', startAge: 40, targets: { cash: { role: 'percent', share: 0.4 }, equity: { role: 'percent', share: 0.6 } } },
        { name: 'Ruhestand', startAge: 67, targets: { cash: { role: 'percent', share: 0.4 }, equity: { role: 'percent', share: 0.6 } } },
      ],
      transitions: [{ fromMilestone: 'Ansparen', toMilestone: 'Ruhestand', startAge: 67, durationYears: 0 }],
      taxCashId: 'cash',
      tax: { allowanceAnnualToday: 1000, churchRate: 0, basisRate: 0.032 },
      historicalSettings: settings(),
      firstCalendarYear: 2026,
    })
    expect(created.years).toHaveLength(30)
    const first = created.years[0]
    if (!first) throw new Error('missing year')
    expect(first.contribution).toBeGreaterThan(0)
    expect(first.withdrawalNeed).toBe(0)
    expect(first.insurance.manual).toMatchObject({ kvMonthly: 0, pvMonthly: 0 })
    const retired = created.years.find((y) => y.age === 67)
    if (!retired) throw new Error('missing retired year')
    expect(retired.contribution).toBeCloseTo(1500 * 12 * retired.inflationFactor, 6)
    expect(retired.withdrawalNeed).toBeCloseTo(2000 * 12 * retired.inflationFactor, 6)
    expect(created.result.reports).toHaveLength(30)
    expect(created.summary.years).toBe(30)
  })
  it('sources and costs apply once with fixed inflation', () => {
    const classification = { cash: 'deposit' as const, equity: 'equityFund' as const }
    const base = runLifecycleScenario({
      input: input(),
      streams: input().retirementIncomeStreams ?? [],
      portfolioBuckets: buckets(),
      classification,
      acquisitionCost: { equity: 0 },
      milestones: [{ name: 'only', startAge: 40, targets: { cash: { role: 'percent', share: 0.4 }, equity: { role: 'percent', share: 0.6 } } }],
      transitions: [],
      taxCashId: 'cash',
      tax: { allowanceAnnualToday: 100000, churchRate: 0, basisRate: 0.025 },
      historicalSettings: settings(),
      firstCalendarYear: 2026,
    })
    expect(base.summary.taxPaidTotal).toBeGreaterThanOrEqual(0)
    expect(base.config.taxCashId).toBe('cash')
  })
  it('buildLifecycleConfig rejects inferred classification', () => {
    expect(() => buildLifecycleConfig(buckets(), {}, [], [], 'cash')).toThrow(/Missing classification/)
  })
  it('buildLedgerYears indexes allowance with inflation and keeps rates constant', () => {
    const classification = { cash: 'deposit' as const, equity: 'equityFund' as const }
    const created = runLifecycleScenario({
      input: input(),
      streams: [],
      portfolioBuckets: buckets(),
      classification,
      acquisitionCost: { equity: 0 },
      milestones: [{ name: 'only', startAge: 40, targets: { cash: { role: 'percent', share: 1 }, equity: { role: 'percent', share: 0 } } }],
      transitions: [],
      taxCashId: 'cash',
      tax: { allowanceAnnualToday: 1000, churchRate: 0.08, basisRate: 0.032 },
      historicalSettings: settings(),
      firstCalendarYear: 2026,
    })
    const y0 = created.years[0]
    const y1 = created.years[1]
    if (!y0 || !y1) throw new Error('missing years')
    expect(y1.allowance).toBeGreaterThan(y0.allowance)
    expect(y1.churchRate).toBe(0.08)
    expect(y1.basisRate).toBe(0.032)
    expect(buildLedgerYears).toBeDefined()
  })
  it('fails closed on terminal liquidation instead of substituting gross closing wealth', () => {
    const classification = { cash: 'deposit' as const, equity: 'equityFund' as const }
    const created = runLifecycleScenario({
      input: input(),
      streams: input().retirementIncomeStreams ?? [],
      portfolioBuckets: buckets(),
      classification,
      acquisitionCost: { equity: 10000 },
      milestones: [{ name: 'only', startAge: 40, targets: { cash: { role: 'percent', share: 0.4 }, equity: { role: 'percent', share: 0.6 } } }],
      transitions: [],
      taxCashId: 'cash',
      tax: { allowanceAnnualToday: 1000, churchRate: 0, basisRate: 0.032 },
      historicalSettings: settings(),
      firstCalendarYear: 2026,
    })
    expect(() => summarizeLedgerResult(created.result, 0, 'cash', created.years.at(-1)?.insurance)).toThrow()
    expect(() => summarizeLedgerResult(created.result, -1, 'cash', created.years.at(-1)?.insurance)).toThrow()
  })
  it('reports terminal outstanding exactly once without adding remaining liabilities', () => {
    const classification = { cash: 'deposit' as const, equity: 'equityFund' as const }
    const created = runLifecycleScenario({
      input: input(),
      streams: input().retirementIncomeStreams ?? [],
      portfolioBuckets: buckets(),
      classification,
      acquisitionCost: { equity: 10000 },
      milestones: [{ name: 'only', startAge: 40, targets: { cash: { role: 'percent', share: 0.4 }, equity: { role: 'percent', share: 0.6 } } }],
      transitions: [],
      taxCashId: 'cash',
      tax: { allowanceAnnualToday: 1000, churchRate: 0, basisRate: 0.032 },
      historicalSettings: settings(),
      firstCalendarYear: 2026,
    })
    const terminalInflation = created.years.at(-1)?.inflationFactor ?? 1
    const direct = liquidateLifecycle(structuredClone(created.result.state), 'cash', terminalInflation)
    expect(created.summary.liquidationOutstandingLiability).toBeCloseTo(direct.outstandingLiability, 6)
    expect(created.summary.liquidationNominal).toBeCloseTo(Math.max(0, direct.nominal - created.summary.incrementalInsuranceAnnual), 6)
    expect(created.summary.liquidationReal).toBeCloseTo(created.summary.liquidationNominal / terminalInflation, 6)
  })
  it('rebuilds nominal inputs per path inflation instead of copying deterministic values', () => {
    const baseInput = input()
    baseInput.currentAge = 67
    baseInput.retirementAge = 67
    baseInput.planningAge = 68
    baseInput.monthlyContributionToday = 0
    baseInput.monthlyDesiredSpendingToday = 2000
    baseInput.retirementInsurance = {
      ...baseInput.retirementInsurance!,
      bridge: { status: 'voluntary', circumstances: 'standard', capitalMode: 'manual', capitalMonthlyToday: 0 },
      pension: { status: 'unsupported', kvMonthlyToday: 100, pvMonthlyToday: 50 },
    }
    const streams = [
      {
        id: 'statutory-pension',
        name: 'Gesetzliche Rente',
        kind: 'gesetzliche-rente' as const,
        amountMonthlyToday: 1500,
        startAge: 67,
        endAge: null,
        amountBasis: 'gross' as const,
        deductionMode: 'effectiveHaircut' as const,
        effectiveDeductionRate: 0,
      },
    ]
    const classification = { cash: 'deposit' as const, equity: 'equityFund' as const }
    const tax = { allowanceAnnualToday: 1000, churchRate: 0 as const, basisRate: 0.032 }
    const marketOne = [{ fundPrices: {}, depositRates: { cash: 0 }, inflationFactor: 1, annualInflationRate: 0 }]
    const marketTwo = [{ fundPrices: {}, depositRates: { cash: 0 }, inflationFactor: 2, annualInflationRate: 1 }]
    const yearsOne = buildLedgerYears({ input: baseInput, streams, portfolioBuckets: buckets(), classification, tax, marketYears: marketOne, firstCalendarYear: 2026 })
    const yearsTwo = buildLedgerYears({ input: baseInput, streams, portfolioBuckets: buckets(), classification, tax, marketYears: marketTwo, firstCalendarYear: 2026 })
    const y1 = yearsOne[0]!
    const y2 = yearsTwo[0]!
    expect(y2.allowance).toBeCloseTo(y1.allowance * 2, 6)
    expect(y2.withdrawalNeed).toBeCloseTo(y1.withdrawalNeed * 2, 6)
    expect(y2.contribution).toBeCloseTo(y1.contribution * 2, 6)
    expect(y2.insurance.manual?.kvMonthly).toBeCloseTo((y1.insurance.manual?.kvMonthly ?? 0) * 2, 6)
    expect(y2.insurance.manual?.pvMonthly).toBeCloseTo((y1.insurance.manual?.pvMonthly ?? 0) * 2, 6)
  })
  it('applies source costs exactly once, matching expected-return handling', () => {
    const etf = findHistoricalReturnSeries('etf-ie00b6r52259-iusq')
    expect(etf?.costTreatment).toBe('netOfFundCosts')
    const etfComponent = { id: 'etf', label: 'ETF', role: 'equity' as const, weight: 1, returnSeriesId: etf!.id, annualCostRate: 0.25 }
    const rawEtf = etf!.normalizedSeries[2012]!
    expect(resolveComponentExpectedNominalReturn(etfComponent, 2012, 0.02)).toBeCloseTo(rawEtf, 10)
    expect(applySourceCostTreatment(resolveComponentNominalReturn(etfComponent, 2012, 0.02, () => 0.5), etf!.id, 0.25)).toBeCloseTo(rawEtf, 10)
    const bills = findHistoricalReturnSeries('jst-r6-developed-equal-weight-bills-real-post1950')!
    expect(bills.costTreatment).toBe('deductBucketAnnualCost')
    const rawBills = bills.normalizedSeries[1950]!
    const inflation = 0.02
    const nominalBills = (1 + rawBills) * (1 + inflation) - 1
    const billsComponent = { id: 'cash', label: 'Cash', role: 'cash' as const, weight: 1, returnSeriesId: bills.id, annualCostRate: 0.01 }
    expect(resolveComponentExpectedNominalReturn(billsComponent, 1950, inflation)).toBeCloseTo(nominalBills - 0.01, 10)
    expect(applySourceCostTreatment(resolveComponentNominalReturn(billsComponent, 1950, inflation, () => 0.5), bills.id, 0.01)).toBeCloseTo(nominalBills - 0.01, 10)
  })
  it('rejects negative deposit nominals in both market builders instead of clamping', () => {
    const depositBuckets: PortfolioBucket[] = [
      { id: 'cash', name: 'Cash', value: 50000, returnSeriesId: 'jst-r6-developed-equal-weight-bills-real-post1950', annualCostRate: 0 },
    ]
    const classification = { cash: 'deposit' as const }
    const historicalSettings: HistoricalBootstrapSettings = {
      portfolioComponents: [{ id: 'cash', label: 'Cash', role: 'cash', weight: 1, returnSeriesId: depositBuckets[0]!.returnSeriesId, annualCostRate: 0 }],
      inflationSourceId: 'fixed-manual',
      simulations: 2,
    }
    expect(() => deriveMarketYears(depositBuckets, classification, historicalSettings, 0.02, 1, [1951], () => 0.5)).toThrow(/nonnegative/)
    expect(() => deriveDeterministicMarketYears(depositBuckets, classification, 0.02, [0.02], { cash: -0.05 })).toThrow(/nonnegative/)
  })
  it.each([40, 50, 60])('keeps %i-year no-tax identity with nonzero inflation (nominal conserved, real deflated)', (horizon) => {
    const currentAge = 30
    const planningAge = currentAge + horizon
    const base = input()
    base.currentAge = currentAge
    base.retirementAge = planningAge
    base.planningAge = planningAge
    base.monthlyContributionToday = 0
    base.monthlyDesiredSpendingToday = 0
    base.retirementIncomeStreams = []
    base.annualInflationRate = 0.02
    const cashOnly: PortfolioBucket[] = [
      { id: 'cash', name: 'Cash', value: 50000, returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.cash, annualCostRate: 0 },
    ]
    const classification = { cash: 'deposit' as const }
    const marketYears = Array.from({ length: horizon }, (_, i) => ({
      fundPrices: {} as Record<string, number>,
      depositRates: { cash: 0 },
      inflationFactor: Math.pow(1.02, i + 1),
      annualInflationRate: 0.02,
    }))
    const tax = { allowanceAnnualToday: 1000000000, churchRate: 0 as const, basisRate: 0 }
    const years = buildLedgerYears({ input: base, streams: [], portfolioBuckets: cashOnly, classification, tax, marketYears, firstCalendarYear: 2026 })
    expect(years).toHaveLength(horizon)
    expect(years.at(-1)?.inflationFactor).toBeCloseTo(Math.pow(1.02, horizon), 10)
    const config = buildLifecycleConfig(cashOnly, classification, [{ name: 'only', startAge: currentAge, targets: { cash: { role: 'percent', share: 1 } } }], [], 'cash')
    const opening = buildOpeningBuckets(cashOnly, classification, {})
    const result = runLedgerDeterministic(config, opening, 2026, years)
    const summary = summarizeLedgerResult(result, years.at(-1)?.inflationFactor ?? 1, 'cash', years.at(-1)?.insurance)
    expect(summary.closingNominal).toBeCloseTo(50000, 4)
    expect(summary.liquidationNominal).toBeCloseTo(50000, 4)
    expect(summary.liquidationReal).toBeCloseTo(50000 / Math.pow(1.02, horizon), 4)
    expect(summary.remainingLiabilitiesTotal).toBeCloseTo(0, 6)
    expect(summary.liquidationOutstandingLiability).toBeCloseTo(0, 6)
  })
  it('searches required opening capital explicitly without proof bypass', () => {
    const classification = { cash: 'deposit' as const, equity: 'equityFund' as const }
    const created = runLifecycleScenario({
      input: input(),
      streams: input().retirementIncomeStreams ?? [],
      portfolioBuckets: buckets(),
      classification,
      acquisitionCost: { equity: 0 },
      milestones: [{ name: 'only', startAge: 40, targets: { cash: { role: 'percent', share: 0.4 }, equity: { role: 'percent', share: 0.6 } } }],
      transitions: [],
      taxCashId: 'cash',
      tax: { allowanceAnnualToday: 1000, churchRate: 0, basisRate: 0.032 },
      historicalSettings: settings(),
      firstCalendarYear: 2026,
    })
    const total = buckets().reduce((n, b) => n + b.value, 0)
    const converged = searchLifecycleCapital(created, (capital: number) => {
      const scale = total > 0 ? capital / total : 0
      return {
        portfolioBuckets: buckets().map((b) => ({ ...b, value: Math.max(0, b.value * scale) })),
        acquisitionCost: { equity: 0 },
      }
    })
    if (converged === null) throw new Error('missing capital result')
    expect(converged.status).toBe('unsupported')
    if (converged.status === 'unsupported') expect(converged.reason).toMatch(/zero-total-start/)
    const reserveBase: typeof created = {
      ...created,
      config: {
        ...created.config,
        milestones: [{ name: 'only', startAge: 40, targets: { cash: { role: 'fixedReserve', amountToday: 1000 }, equity: { role: 'percent', share: 1 } } }],
      },
    }
    const reserveSearch = searchLifecycleCapital(reserveBase, () => ({ portfolioBuckets: buckets(), acquisitionCost: { equity: 0 } }))
    if (reserveSearch === null) throw new Error('missing reserve search result')
    expect(reserveSearch.status).toBe('unsupported')
    expect(runLifecycleBootstrap).toBeDefined()
  })
  it('provides full ledger trajectories to plots for every completed bootstrap path', () => {
    const classification = { cash: 'deposit' as const, equity: 'equityFund' as const }
    const shortInput = { ...input(), currentAge: 65, retirementAge: 67, planningAge: 70 }
    const shortSettings: HistoricalBootstrapSettings = { ...settings(), simulations: 2 }
    const created = runLifecycleScenario({
      input: shortInput,
      streams: shortInput.retirementIncomeStreams ?? [],
      portfolioBuckets: buckets(),
      classification,
      acquisitionCost: { equity: 0 },
      milestones: [{ name: 'only', startAge: 65, targets: { cash: { role: 'percent', share: 0.4 }, equity: { role: 'percent', share: 0.6 } } }],
      transitions: [],
      taxCashId: 'cash',
      tax: { allowanceAnnualToday: 1000, churchRate: 0, basisRate: 0.032 },
      historicalSettings: shortSettings,
      firstCalendarYear: 2026,
    })
    let bootstrap
    try {
      bootstrap = runLifecycleBootstrap(created, {
        input: shortInput,
        streams: shortInput.retirementIncomeStreams ?? [],
        portfolioBuckets: buckets(),
        classification,
        historicalSettings: shortSettings,
        tax: { allowanceAnnualToday: 1000, churchRate: 0, basisRate: 0.032 },
        firstCalendarYear: 2026,
      })
    } catch (error) {
      expect(String(error instanceof Error ? error.message : error)).toMatch(/nonnegative|Deposit nominal/)
      return
    }
    expect(bootstrap.paths).toHaveLength(2)
    for (const path of bootstrap.paths) {
      if (path.status === 'survived' || path.status === 'depleted') {
        expect(path.yearlyClosingNominal).toHaveLength(created.years.length)
        expect(path.yearlyAnchorNominal).toHaveLength(created.years.length)
        expect(path.yearlyInflationFactors).toHaveLength(created.years.length)
      }
    }
    expect(bootstrap.reference.reports).toHaveLength(created.years.length)
  })
})
