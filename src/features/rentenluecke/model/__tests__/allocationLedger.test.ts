import { describe, expect, it } from 'vitest'
import { insuredInput, automaticInsurance, cashOnlyInput } from './insuranceFixtures'
import { simulateScenario } from '../simulateScenario'
import { simulateScenarioWithReturnPath } from '../stochasticReturns'
import { resolveAllocationTargets } from '../capitalIncome/allocationEvent'
import { sampledBucketReturns } from '../capitalIncome/returns'
import { createPortfolioComponentsFromBuckets } from '../portfolioBuckets'
import { getRequiredInflationSource } from '../historicalReturns/sourceOptions'
import { PLANNING_RATE_SOURCE_ID, SYNTHETIC_RETURN_SERIES_IDS, FIXED_INFLATION_SOURCE_ID } from '../historicalReturns/constants'
import { simulateHistoricalBootstrapReferenceScenario, simulateHistoricalBootstrapScenario } from '../historicalReturns/bootstrapSimulation'
import type { RentenlueckeInput } from '../types'

function estimatorInput(): RentenlueckeInput {
  return insuredInput({
    currentAge: 64, retirementAge: 65, planningAge: 69, currentCapital: 100000,
    monthlyContributionToday: 100, monthlyDesiredSpendingToday: 2500,
    estimatorPortfolio: [
      { id: 'fund', name: 'Fonds', value: 60000, holding: 'accumulating-equity-fund', returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.equity },
      { id: 'bank', name: 'Bank', value: 40000, holding: 'ordinary-bank-deposit', returnSeriesId: PLANNING_RATE_SOURCE_ID },
    ],
    retirementInsurance: automaticInsurance({
      bridge: { status: 'voluntary', circumstances: 'standard', capitalMode: 'automatic' },
      capitalEstimator: { fundAcquisitionCost: 30000, projectedBasisRate: 0.032, scopeConfirmed: true, lossScopeConfirmed: true },
    }),
  })
}

const bucketPath = (input: RentenlueckeInput) => Array.from({ length: input.planningAge - input.currentAge }, () => [
  { id: 'fund', totalReturnRate: 0.06 },
  { id: 'bank', totalReturnRate: 0.02, grossBankReturnRate: 0.02 },
])

const withEvent = (input: RentenlueckeInput): RentenlueckeInput => ({
  ...input,
  allocationAtRetirement: {
    enabled: true, accepted: true, fixedTargets: [],
    remainderWeights: { fund: 0.5, bank: 0.5 },
  },
})

describe('arbeitsende allocation ledger integration', () => {
  it('absent and disabled specs produce identical drift rows', () => {
    const base = estimatorInput()
    const disabled: RentenlueckeInput = { ...base, allocationAtRetirement: { enabled: false, accepted: false, fixedTargets: [], remainderWeights: {} } }
    const absent = simulateScenarioWithReturnPath(base, [], undefined, bucketPath(base))
    const off = simulateScenarioWithReturnPath(disabled, [], undefined, bucketPath(disabled))
    expect(off.rows.length).toBe(absent.rows.length)
    for (let i = 0; i < absent.rows.length; i++) {
      expect(off.rows[i].closingCapital).toBeCloseTo(absent.rows[i].closingCapital, 9)
      expect(off.rows[i].openingCapital).toBeCloseTo(absent.rows[i].openingCapital, 9)
    }
  })

  it('fires only at the end of the first retirement year; other years drift', () => {
    const base = estimatorInput()
    const event = withEvent(base)
    const path = bucketPath(base)
    const drift = simulateScenarioWithReturnPath(base, [], undefined, path)
    const allocated = simulateScenarioWithReturnPath(event, [], undefined, path)
    // Accumulation rows are untouched by the future event.
    expect(allocated.accumulationRows.length).toBe(drift.accumulationRows.length)
    for (let i = 0; i < drift.accumulationRows.length; i++) {
      expect(allocated.accumulationRows[i].closingCapital).toBeCloseTo(drift.accumulationRows[i].closingCapital, 9)
    }
    // Event row: pure 50/50 remainder weights allocate the whole net base, so the
    // settled halves match after removing the starting-share contributions
    // (estimatorInput saves 100 / month on the 60/40 starting shares, added
    // after the event settlement; marginals follow the same resolver).
    const eventRow = allocated.retirementRows[0]
    expect(eventRow.closingCapital).toBeGreaterThan(0)
    const fundClose = eventRow.capitalAssessment!.closingState!.buckets.find(b => b.id === 'fund')!.value
    const bankClose = eventRow.capitalAssessment!.closingState!.buckets.find(b => b.id === 'bank')!.value
    const contribution = eventRow.capitalAssessment!.contribution
    expect(fundClose - contribution * 0.6).toBeCloseTo((eventRow.closingCapital - contribution) / 2, 4)
    expect(bankClose - contribution * 0.4).toBeCloseTo((eventRow.closingCapital - contribution) / 2, 4)
    // Conservation: closing = opening + return + contribution - paid + extras.
    const assessment = eventRow.capitalAssessment!
    expect(eventRow.closingCapital).toBeCloseTo(
      eventRow.openingCapital + eventRow.investmentReturn + assessment.contribution
        - assessment.paidWithdrawal + assessment.eventSurplusDeposit + assessment.roundingExcess, 6)
    // Later retirement years drift again: unequal returns move shares off 50/50.
    if (allocated.retirementRows.length > 1) {
      const next = allocated.retirementRows[1]
      const nextFund = next.capitalAssessment!.closingState!.buckets.find(b => b.id === 'fund')!.value
      expect(Math.abs(nextFund - next.closingCapital / 2)).toBeGreaterThan(1)
    }
  })

  it('matches the pure resolver on the event-year net base', () => {
    const base = estimatorInput()
    const event = withEvent(base)
    const allocated = simulateScenarioWithReturnPath(event, [], undefined, bucketPath(event))
    const eventRow = allocated.retirementRows[0]
    const assessment = eventRow.capitalAssessment!
    const baseWealth = eventRow.openingCapital + eventRow.investmentReturn
      - assessment.paidWithdrawal + assessment.eventSurplusDeposit
    const resolved = resolveAllocationTargets({ netWealth: baseWealth, inflationFactor: eventRow.inflationFactor,
      buckets: [{ id: 'fund', eligibility: 'accumulating-equity-fund' }, { id: 'bank', eligibility: 'ordinary-bank-deposit' }],
      fixedTargets: [], remainderWeights: { fund: 0.5, bank: 0.5 } })
    // Closing equals resolver targets plus the bounded rounding marginal (same
    // 50/50 split) plus starting-share contributions (estimatorInput saves 100 /
    // month on the 60/40 starting shares, added after the event settlement).
    const shares: Record<string, number> = { fund: 0.6, bank: 0.4 }
    for (const target of resolved) {
      const closed = assessment.closingState!.buckets.find(b => b.id === target.id)!.value
      const expected = target.target + assessment.roundingExcess / 2 + assessment.contribution * shares[target.id]!
      expect(closed).toBeCloseTo(expected, 4)
    }
  })

  it('credits the event-year genuine surplus exactly once (poststep disabled)', () => {
    // Hand-derived: fund 60,000 + bank 40,000, zero returns, full cost basis (no
    // tax), manual zero insurance, other income 36,000, spending 0. Signed need
    // N = -36,000, so the event year folds S = 36,000 into the allocation base
    // once (B = 136,000 -> 50/50 targets 68,000/68,000) instead of the ordinary
    // year-end poststep. The disabled twin reinvests the same 36,000
    // proportionally to current holdings (81,600/54,400): same total, different
    // split, each credited exactly once.
    const surplusBase: RentenlueckeInput = cashOnlyInput({
      currentAge: 67, retirementAge: 67, planningAge: 68, currentCapital: 100_000,
      monthlyContributionToday: 0, monthlyDesiredSpendingToday: 0,
      annualInflationRate: 0, annualReturnBeforeRetirement: 0, annualReturnInRetirement: 0,
      estimatorPortfolio: [
        { id: 'fund', name: 'Fonds', value: 60_000, holding: 'accumulating-equity-fund', returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.equity },
        { id: 'bank', name: 'Bank', value: 40_000, holding: 'ordinary-bank-deposit', returnSeriesId: PLANNING_RATE_SOURCE_ID },
      ],
      retirementIncomeStreams: [{ id: 'other', name: 'Other', amountMonthlyToday: 3000,
        startAge: 67, endAge: null, amountBasis: 'gross', deductionMode: 'effectiveHaircut', effectiveDeductionRate: 0 }],
      retirementInsurance: {
        referenceYear: 2026, childBirthYears: [], pensionAge: 67,
        capitalEstimator: { fundAcquisitionCost: 60_000, projectedBasisRate: 0.032, scopeConfirmed: true, lossScopeConfirmed: true },
        bridge: { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 },
        pension: { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 },
      },
    })
    const zeroPath = [[{ id: 'fund', totalReturnRate: 0 }, { id: 'bank', totalReturnRate: 0, grossBankReturnRate: 0 }]]
    const event = withEvent(surplusBase)
    const allocated = simulateScenarioWithReturnPath(event, [], undefined, zeroPath)
    const eventRow = allocated.retirementRows[0]
    const assessment = eventRow.capitalAssessment!
    expect(assessment.eventSurplusDeposit).toBeCloseTo(36_000, 6)
    expect(assessment.roundingExcess).toBeCloseTo(0, 6)
    expect(eventRow.closingCapital).toBeCloseTo(136_000, 6)
    expect(assessment.closingState!.buckets.find(b => b.id === 'fund')!.value).toBeCloseTo(68_000, 6)
    expect(assessment.closingState!.buckets.find(b => b.id === 'bank')!.value).toBeCloseTo(68_000, 6)
    expect(eventRow.surplusReinvested).toBe(0)
    // No double credit: closing exceeds the funded base by the bounded rounding
    // excess only.
    const fundedBase = eventRow.openingCapital + eventRow.investmentReturn
      + assessment.contribution - assessment.paidWithdrawal + assessment.eventSurplusDeposit
    expect(eventRow.closingCapital).toBeCloseTo(fundedBase + assessment.roundingExcess, 6)
    // The disabled twin reinvests the same surplus through the ordinary poststep.
    const drift = simulateScenarioWithReturnPath(surplusBase, [], undefined, zeroPath)
    expect(drift.retirementRows[0].surplusReinvested).toBeCloseTo(36_000, 6)
    expect(drift.retirementRows[0].closingCapital).toBeCloseTo(136_000, 6)
    expect(drift.retirementRows[0].capitalAssessment!.closingState!.buckets.find(b => b.id === 'fund')!.value).toBeCloseTo(81_600, 6)
  })

  it('scales fixed today-euro priorities by the event-year inflation factor', () => {
    const base = estimatorInput()
    const fixed: RentenlueckeInput = { ...base,
      allocationAtRetirement: { enabled: true, accepted: true,
        fixedTargets: [{ bucketId: 'bank', amountToday: 20000 }], remainderWeights: { fund: 1 } } }
    const allocated = simulateScenarioWithReturnPath(fixed, [], [0.05, 0.05, 0.05, 0.05, 0.05], bucketPath(fixed))
    const eventRow = allocated.retirementRows[0]
    // Event-year factor is 1.05 (second model year): bank target is at least the
    // scaled 21,000 fixed priority; the fund takes the remainder.
    const bankClose = eventRow.capitalAssessment!.closingState!.buckets.find(b => b.id === 'bank')!.value
    expect(bankClose).toBeGreaterThanOrEqual(21000 - 1)
    expect(eventRow.closingCapital).toBeCloseTo(
      eventRow.openingCapital + eventRow.investmentReturn + eventRow.capitalAssessment!.contribution
        - eventRow.capitalAssessment!.paidWithdrawal + eventRow.capitalAssessment!.eventSurplusDeposit
        + eventRow.capitalAssessment!.roundingExcess, 4)
  })

  it('throws on dangling destinations instead of silently reallocating', () => {
    const base = estimatorInput()
    const dangling: RentenlueckeInput = { ...base,
      allocationAtRetirement: { enabled: true, accepted: true, fixedTargets: [{ bucketId: 'ghost', amountToday: 100 }], remainderWeights: {} } }
    expect(() => simulateScenario(dangling, 0.02)).toThrow(/ghost/)
  })
})

describe('zero-balance future destinations earn real returns', () => {
  // Hand-derived: fund 60,000 (full cost basis) + bank 40,000 + zero fund 0,
  // zero rates in the event year, 10% on the zero fund the year after. The
  // event moves 100% to the zero fund: no current-year return on the December
  // purchase (closing = invested base exactly), real 10% the following year
  // with applicable December VP for the year after that.
  const zeroInput = (): RentenlueckeInput => cashOnlyInput({
    currentAge: 66, retirementAge: 67, planningAge: 69, currentCapital: 100_000,
    monthlyContributionToday: 0, monthlyDesiredSpendingToday: 0,
    annualInflationRate: 0, annualReturnBeforeRetirement: 0, annualReturnInRetirement: 0,
    estimatorPortfolio: [
      { id: 'fund', name: 'Fonds', value: 60_000, holding: 'accumulating-equity-fund', returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.equity },
      { id: 'bank', name: 'Bank', value: 40_000, holding: 'ordinary-bank-deposit', returnSeriesId: PLANNING_RATE_SOURCE_ID },
      { id: 'zero', name: 'Zukunft', value: 0, holding: 'accumulating-equity-fund', returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.equity },
    ],
    retirementIncomeStreams: [{ id: 'other', name: 'Other', amountMonthlyToday: 0,
      startAge: 66, endAge: null, amountBasis: 'gross', deductionMode: 'effectiveHaircut', effectiveDeductionRate: 0 }],
    retirementInsurance: {
      referenceYear: 2026, childBirthYears: [], pensionAge: 67,
      capitalEstimator: { fundAcquisitionCost: 60_000, projectedBasisRate: 0.032, scopeConfirmed: true, lossScopeConfirmed: true },
      bridge: { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 },
      pension: { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 },
    },
    allocationAtRetirement: { enabled: true, accepted: true, fixedTargets: [], remainderWeights: { zero: 1 } },
  })
  const zeroPath = [
    [{ id: 'fund', totalReturnRate: 0 }, { id: 'bank', totalReturnRate: 0, grossBankReturnRate: 0 }, { id: 'zero', totalReturnRate: 0 }],
    [{ id: 'fund', totalReturnRate: 0 }, { id: 'bank', totalReturnRate: 0, grossBankReturnRate: 0 }, { id: 'zero', totalReturnRate: 0 }],
    [{ id: 'fund', totalReturnRate: 0 }, { id: 'bank', totalReturnRate: 0, grossBankReturnRate: 0 }, { id: 'zero', totalReturnRate: 0.1 }],
  ]
  it('invests the zero destination in the event year and compounds it really afterwards', () => {
    const input = zeroInput()
    const result = simulateScenarioWithReturnPath(input, [], undefined, zeroPath)
    expect(result.retirementRows).toHaveLength(2)
    // Accumulation drift: nothing moves, nothing is sold (need is zero).
    expect(result.accumulationRows).toHaveLength(1)
    expect(result.accumulationRows[0].closingCapital).toBeCloseTo(100000, 9)
    // Event year: base = H = 100,000 (no spending, no charges), all to zero.
    // No current-year return on the December purchase: closing is the base.
    const eventRow = result.retirementRows[0]
    expect(eventRow.investmentReturn).toBe(0)
    const zeroClose = eventRow.capitalAssessment!.closingState!.buckets.find(b => b.id === 'zero')!.value
    expect(zeroClose).toBeCloseTo(100000, 6)
    expect(eventRow.closingCapital).toBeCloseTo(100000, 6)
    expect(eventRow.capitalAssessment!.eventSurplusDeposit).toBe(0)
    // Full-basis sales realize no gains; the moved cost base is the purchase.
    expect(eventRow.capitalAssessment!.withdrawalTax!.capitalIncomeTax).toBe(0)
    expect(eventRow.capitalAssessment!.closingState!.fundAcquisitionCost).toBeCloseTo(100000, 6)
    // Following year: the invested destination earns its real 10% on opening.
    const next = result.retirementRows[1]
    expect(next.openingCapital).toBeCloseTo(100000, 9)
    const nextZeroOpen = next.capitalAssessment!.closingState!.buckets.find(b => b.id === 'zero')!.value
    expect(nextZeroOpen).toBeGreaterThan(100000)
    expect(next.investmentReturn).toBeCloseTo(0.1 * 100000, 6)
    // The 10% gain accrues applicable VP for the year after (capped at gain).
    expect(next.capitalAssessment!.pendingVorabpauschale).toBeGreaterThan(0)
    // Ledger continuity holds across the event boundary.
    expect(next.openingCapital).toBeCloseTo(eventRow.closingCapital, 9)
  })
  it('invests a zero-balance deposit destination and earns real bank returns afterwards', () => {
    // Hand-derived deposit twin: fund 60,000 + bank 40,000 + zero deposit 0,
    // zero rates in the event year, 2% gross bank return the year after. The
    // event moves 100% to the zero deposit: no current-year return on the new
    // money (closing = invested base exactly), real 2% interest the following
    // year with no fund cost and no VP on the bank leg.
    const depositInput = (): RentenlueckeInput => cashOnlyInput({
      currentAge: 66, retirementAge: 67, planningAge: 69, currentCapital: 100_000,
      monthlyContributionToday: 0, monthlyDesiredSpendingToday: 0,
      annualInflationRate: 0, annualReturnBeforeRetirement: 0, annualReturnInRetirement: 0,
      estimatorPortfolio: [
        { id: 'fund', name: 'Fonds', value: 60_000, holding: 'accumulating-equity-fund', returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.equity },
        { id: 'bank', name: 'Bank', value: 40_000, holding: 'ordinary-bank-deposit', returnSeriesId: PLANNING_RATE_SOURCE_ID },
        { id: 'zeroBank', name: 'Zukunft Bank', value: 0, holding: 'ordinary-bank-deposit', returnSeriesId: PLANNING_RATE_SOURCE_ID },
      ],
      retirementIncomeStreams: [{ id: 'other', name: 'Other', amountMonthlyToday: 0,
        startAge: 66, endAge: null, amountBasis: 'gross', deductionMode: 'effectiveHaircut', effectiveDeductionRate: 0 }],
      retirementInsurance: {
        referenceYear: 2026, childBirthYears: [], pensionAge: 67,
        capitalEstimator: { fundAcquisitionCost: 60_000, projectedBasisRate: 0.032, scopeConfirmed: true, lossScopeConfirmed: true },
        bridge: { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 },
        pension: { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 },
      },
      allocationAtRetirement: { enabled: true, accepted: true, fixedTargets: [], remainderWeights: { zeroBank: 1 } },
    })
    const depositPath = [
      [{ id: 'fund', totalReturnRate: 0 }, { id: 'bank', totalReturnRate: 0, grossBankReturnRate: 0 }, { id: 'zeroBank', totalReturnRate: 0, grossBankReturnRate: 0 }],
      [{ id: 'fund', totalReturnRate: 0 }, { id: 'bank', totalReturnRate: 0, grossBankReturnRate: 0 }, { id: 'zeroBank', totalReturnRate: 0, grossBankReturnRate: 0 }],
      [{ id: 'fund', totalReturnRate: 0 }, { id: 'bank', totalReturnRate: 0, grossBankReturnRate: 0 }, { id: 'zeroBank', totalReturnRate: 0.008, grossBankReturnRate: 0.008 }],
    ]
    const input = depositInput()
    const result = simulateScenarioWithReturnPath(input, [], undefined, depositPath)
    expect(result.retirementRows).toHaveLength(2)
    const eventRow = result.retirementRows[0]
    expect(eventRow.investmentReturn).toBe(0)
    expect(eventRow.capitalAssessment!.closingState!.buckets.find(b => b.id === 'zeroBank')!.value).toBeCloseTo(100000, 6)
    expect(eventRow.closingCapital).toBeCloseTo(100000, 6)
    expect(eventRow.capitalAssessment!.closingState!.fundAcquisitionCost).toBe(0)
    expect(eventRow.capitalAssessment!.pendingVorabpauschale).toBe(0)
    const next = result.retirementRows[1]
    expect(next.openingCapital).toBeCloseTo(100000, 9)
    expect(next.investmentReturn).toBeCloseTo(0.008 * 100000, 6)
    expect(next.capitalAssessment!.closingState!.buckets.find(b => b.id === 'zeroBank')!.value).toBeCloseTo(100800, 6)
    expect(next.openingCapital).toBeCloseTo(eventRow.closingCapital, 9)
  })
  it('never invents a zero return: a missing destination rate throws', () => {
    const input = zeroInput()
    const missingZero = zeroPath.map(year => year.filter(r => r.id !== 'zero'))
    expect(() => simulateScenarioWithReturnPath(input, [], undefined, missingZero)).toThrow(/Fehlender Renditepfad/)
  })
  it('carries zero-weight components with real sampled returns (no source drop)', () => {
    const components = createPortfolioComponentsFromBuckets([
      { id: 'fund', name: 'Fonds', value: 60000, returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.equity },
      { id: 'zero', name: 'Zukunft', value: 0, returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.equity },
    ])
    expect(components.find(c => c.id === 'zero')!.weight).toBe(0)
    const source = getRequiredInflationSource(FIXED_INFLATION_SOURCE_ID, 0.02)
    const path = sampledBucketReturns(components, source, [2000], () => 0.5, 0.02)
    expect(path).toHaveLength(1)
    expect(path[0].map(r => r.id).sort()).toEqual(['fund', 'zero'])
    for (const rate of path[0]) expect(Number.isFinite(rate.totalReturnRate)).toBe(true)
  })
})

describe('event off/on across public surfaces (reference, bootstrap, scalar)', () => {
  const settingsFor = (input: RentenlueckeInput) => ({
    portfolioComponents: createPortfolioComponentsFromBuckets(
      (input.estimatorPortfolio ?? []) as { id: string; name: string; value: number; returnSeriesId: string }[]),
    inflationSourceId: FIXED_INFLATION_SOURCE_ID,
    simulations: 1,
    cashPlanningRate: 0.02,
  })
  const closings = (rows: { closingCapital: number }[]) => rows.map(r => r.closingCapital)
  it('reference surface: disabled matches absent, enabled allocates the event mix', () => {
    const base = estimatorInput()
    const disabled: RentenlueckeInput = { ...base,
      allocationAtRetirement: { enabled: false, accepted: false, fixedTargets: [], remainderWeights: {} } }
    const absent = simulateHistoricalBootstrapReferenceScenario(base, settingsFor(base))
    const off = simulateHistoricalBootstrapReferenceScenario(disabled, settingsFor(disabled))
    expect(closings(off.rows)).toHaveLength(closings(absent.rows).length)
    for (let i = 0; i < absent.rows.length; i++) {
      expect(off.rows[i].closingCapitalToday).toBeCloseTo(absent.rows[i].closingCapitalToday, 9)
      expect(off.rows[i].closingCapital).toBeCloseTo(absent.rows[i].closingCapital, 9)
    }
    const event: RentenlueckeInput = { ...base,
      allocationAtRetirement: { enabled: true, accepted: true, fixedTargets: [], remainderWeights: { fund: 0.5, bank: 0.5 } } }
    const on = simulateHistoricalBootstrapReferenceScenario(event, settingsFor(event))
    expect(on.rows).toHaveLength(absent.rows.length)
    // Accumulation rows are untouched by the future event on the actual public output.
    for (let i = 0; i < absent.accumulationRows.length; i++) {
      expect(on.accumulationRows[i].closingCapital).toBeCloseTo(absent.accumulationRows[i].closingCapital, 9)
    }
    // Analytic event mix on the returned public rows: the event row settles the
    // net base 50/50 (plus starting-share contributions added after settlement),
    // and conserves closing = opening + return + contribution - paid + extras.
    const eventRow = on.retirementRows[0]
    const assessment = eventRow.capitalAssessment!
    const settled = eventRow.openingCapital + eventRow.investmentReturn
      - assessment.paidWithdrawal + assessment.eventSurplusDeposit + assessment.roundingExcess
    const contribution = assessment.contribution
    const fundClose = assessment.closingState!.buckets.find(b => b.id === 'fund')!.value
    const bankClose = assessment.closingState!.buckets.find(b => b.id === 'bank')!.value
    expect(fundClose - contribution * 0.6).toBeCloseTo((eventRow.closingCapital - contribution) / 2, 2)
    expect(bankClose - contribution * 0.4).toBeCloseTo((eventRow.closingCapital - contribution) / 2, 2)
    expect(settled).toBeCloseTo(eventRow.closingCapital - contribution, 4)
    expect(eventRow.closingCapital).toBeCloseTo(
      eventRow.openingCapital + eventRow.investmentReturn + contribution
        - assessment.paidWithdrawal + assessment.eventSurplusDeposit + assessment.roundingExcess, 4)
    // The enabled event row differs from the disabled drift row (same public
    // surface, same seed): reallocation trade taxes move the close.
    expect(eventRow.closingCapital).not.toBe(absent.retirementRows[0].closingCapital)
  })
  it('single-path bootstrap surface: off runs drift, on allocates the event mix', () => {
    const base = estimatorInput()
    const disabled: RentenlueckeInput = { ...base,
      allocationAtRetirement: { enabled: false, accepted: false, fixedTargets: [], remainderWeights: {} } }
    const absent = simulateHistoricalBootstrapScenario(base, settingsFor(base))
    const off = simulateHistoricalBootstrapScenario(disabled, settingsFor(disabled))
    // The bootstrap seed hashes the full input including the allocation spec, so
    // off vs absent sample different market years and cannot match euro-exactly;
    // both run the same drift baseline (no event trades) with the same lengths.
    expect(off.rows).toHaveLength(absent.rows.length)
    for (const row of [...off.accumulationRows, ...off.retirementRows]) {
      expect(row.capitalAssessment!.eventSurplusDeposit).toBe(0)
      expect(row.capitalAssessment!.roundingExcess).toBeCloseTo(0, 9)
    }
    for (const row of [...absent.accumulationRows, ...absent.retirementRows]) {
      expect(row.capitalAssessment!.eventSurplusDeposit).toBe(0)
    }
    const event: RentenlueckeInput = { ...base,
      allocationAtRetirement: { enabled: true, accepted: true, fixedTargets: [], remainderWeights: { fund: 0.5, bank: 0.5 } } }
    const on = simulateHistoricalBootstrapScenario(event, settingsFor(event))
    expect(on.rows).toHaveLength(absent.rows.length)
    // Analytic event mix on the returned single-path rows (same seed, same
    // sampled path): the event row lands on the 50/50 split of its settled
    // base plus starting-share contributions, not on an unrelated hand path.
    const eventRow = on.retirementRows[0]
    const assessment = eventRow.capitalAssessment!
    const settled = eventRow.openingCapital + eventRow.investmentReturn
      - assessment.paidWithdrawal + assessment.eventSurplusDeposit + assessment.roundingExcess
    const contribution = assessment.contribution
    expect(assessment.closingState!.buckets.find(b => b.id === 'fund')!.value - contribution * 0.6).toBeCloseTo((eventRow.closingCapital - contribution) / 2, 2)
    expect(assessment.closingState!.buckets.find(b => b.id === 'bank')!.value - contribution * 0.4).toBeCloseTo((eventRow.closingCapital - contribution) / 2, 2)
    expect(settled).toBeCloseTo(eventRow.closingCapital - contribution, 4)
    expect(eventRow.closingCapital).toBeCloseTo(
      eventRow.openingCapital + eventRow.investmentReturn + contribution
        - assessment.paidWithdrawal + assessment.eventSurplusDeposit + assessment.roundingExcess, 4)
  })
  it('constant-source bootstrap: absent matches disabled euro-exactly, enabled allocates fixed priority', () => {
    // Controlled constant-return fixture: two ordinary deposits on the constant
    // planning rate plus fixed-manual inflation. Every sampled year returns the
    // planning rate and inflation is fixed, so the changed seed (which hashes the
    // allocation spec) cannot change returns; absent vs disabled must match
    // euro-exactly on the actual returned rows. No hand twin: the enabled fixed
    // priority is verified on the returned rows' own inflation factor and base.
    const constantBase: RentenlueckeInput = cashOnlyInput({
      currentAge: 64, retirementAge: 65, planningAge: 69, currentCapital: 100_000,
      monthlyContributionToday: 0, monthlyDesiredSpendingToday: 0,
      annualInflationRate: 0, annualReturnBeforeRetirement: 0, annualReturnInRetirement: 0,
      estimatorPortfolio: [
        { id: 'cashA', name: 'CashA', value: 60_000, holding: 'ordinary-bank-deposit', returnSeriesId: PLANNING_RATE_SOURCE_ID },
        { id: 'cashB', name: 'CashB', value: 40_000, holding: 'ordinary-bank-deposit', returnSeriesId: PLANNING_RATE_SOURCE_ID },
      ],
      retirementIncomeStreams: [{ id: 'other', name: 'Other', amountMonthlyToday: 0,
        startAge: 64, endAge: null, amountBasis: 'gross', deductionMode: 'effectiveHaircut', effectiveDeductionRate: 0 }],
      retirementInsurance: {
        referenceYear: 2026, childBirthYears: [], pensionAge: 65,
        capitalEstimator: { fundAcquisitionCost: 0, projectedBasisRate: 0, scopeConfirmed: true, lossScopeConfirmed: true },
        bridge: { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 },
        pension: { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 },
      },
    })
    const disabled: RentenlueckeInput = { ...constantBase,
      allocationAtRetirement: { enabled: false, accepted: false, fixedTargets: [], remainderWeights: {} } }
    const absent = simulateHistoricalBootstrapScenario(constantBase, settingsFor(constantBase))
    const off = simulateHistoricalBootstrapScenario(disabled, settingsFor(disabled))
    expect(off.rows).toHaveLength(absent.rows.length)
    for (let i = 0; i < absent.rows.length; i++) {
      expect(off.rows[i].closingCapital).toBeCloseTo(absent.rows[i].closingCapital, 9)
      expect(off.rows[i].openingCapital).toBeCloseTo(absent.rows[i].openingCapital, 9)
    }
    for (const row of [...off.accumulationRows, ...off.retirementRows]) {
      expect(row.capitalAssessment!.eventSurplusDeposit).toBe(0)
    }
    const event: RentenlueckeInput = { ...constantBase,
      allocationAtRetirement: { enabled: true, accepted: true,
        fixedTargets: [{ bucketId: 'cashB', amountToday: 20000 }], remainderWeights: { cashA: 1 } } }
    const on = simulateHistoricalBootstrapScenario(event, settingsFor(event))
    expect(on.rows).toHaveLength(absent.rows.length)
    for (let i = 0; i < absent.accumulationRows.length; i++) {
      expect(on.accumulationRows[i].closingCapital).toBeCloseTo(absent.accumulationRows[i].closingCapital, 9)
    }
    const eventRow = on.retirementRows[0]
    const assessment = eventRow.capitalAssessment!
    const fixedNominal = 20000 * eventRow.inflationFactor
    const cashBClose = assessment.closingState!.buckets.find(b => b.id === 'cashB')!.value
    const cashAClose = assessment.closingState!.buckets.find(b => b.id === 'cashA')!.value
    expect(cashBClose).toBeCloseTo(fixedNominal + assessment.roundingExcess / 2, 2)
    expect(cashAClose).toBeCloseTo(eventRow.closingCapital - cashBClose, 6)
    expect(eventRow.closingCapital).toBeCloseTo(
      eventRow.openingCapital + eventRow.investmentReturn + assessment.contribution
        - assessment.paidWithdrawal + assessment.eventSurplusDeposit + assessment.roundingExcess, 6)
  })
  it('scalar surface: disabled matches absent, enabled keeps ledger identity', () => {
    const base = estimatorInput()
    const disabled: RentenlueckeInput = { ...base,
      allocationAtRetirement: { enabled: false, accepted: false, fixedTargets: [], remainderWeights: {} } }
    const absent = simulateScenario(base, 0.02)
    const off = simulateScenario(disabled, 0.02)
    for (let i = 0; i < absent.rows.length; i++) {
      expect(off.rows[i].closingCapital).toBeCloseTo(absent.rows[i].closingCapital, 9)
    }
    const event: RentenlueckeInput = { ...base,
      allocationAtRetirement: { enabled: true, accepted: true, fixedTargets: [], remainderWeights: { fund: 0.5, bank: 0.5 } } }
    const on = simulateScenario(event, 0.02)
    expect(on.rows).toHaveLength(absent.rows.length)
    const eventRow = on.retirementRows[0]
    const assessment = eventRow.capitalAssessment!
    expect(eventRow.closingCapital).toBeCloseTo(
      eventRow.openingCapital + eventRow.investmentReturn + assessment.contribution
        - assessment.paidWithdrawal + assessment.eventSurplusDeposit + assessment.roundingExcess, 6)
    // Scalar event mix is analytic too: 50/50 of the settled base plus
    // starting-share contributions on the actual scalar output.
    const settled = eventRow.openingCapital + eventRow.investmentReturn
      - assessment.paidWithdrawal + assessment.eventSurplusDeposit + assessment.roundingExcess
    expect(settled).toBeCloseTo(eventRow.closingCapital - assessment.contribution, 4)
    expect(assessment.closingState!.buckets.find(b => b.id === 'fund')!.value - assessment.contribution * 0.6).toBeCloseTo((eventRow.closingCapital - assessment.contribution) / 2, 2)
  })
})

describe('accumulation drift and starting-share savings with an accepted event', () => {
  it('keeps contributions on starting shares and holdings drifting before the event', () => {
    // estimatorInput saves 100/month on 60/40 starting shares with zero rates:
    // the accepted future event must not move a euro before the first
    // retirement year, and savings split 720/480 exactly.
    const base = estimatorInput()
    const event = withEvent(base)
    const path = bucketPath(base).map(year => year.map(r => ({ ...r, totalReturnRate: 0, grossBankReturnRate: 0 })))
    const drift = simulateScenarioWithReturnPath(base, [], undefined, path)
    const allocated = simulateScenarioWithReturnPath(event, [], undefined, path)
    expect(drift.accumulationRows).toHaveLength(1)
    const row = allocated.accumulationRows[0]
    const fundClose = row.capitalAssessment!.closingState!.buckets.find(b => b.id === 'fund')!.value
    const bankClose = row.capitalAssessment!.closingState!.buckets.find(b => b.id === 'bank')!.value
    expect(fundClose).toBeCloseTo(60000 + 1200 * 0.6, 9)
    expect(bankClose).toBeCloseTo(40000 + 1200 * 0.4, 9)
    expect(row.closingCapital).toBeCloseTo(101200, 9)
    expect(fundClose / row.closingCapital).toBeCloseTo(0.6, 9)
    expect(row.capitalAssessment!.sale.paid).toBe(0)
    expect(row.closingCapital).toBeCloseTo(drift.accumulationRows[0].closingCapital, 9)
  })
  it('keeps savings on ORIGINAL 60/40 starting shares over unequal returns (not drifted)', () => {
    // Three accumulation years with unequal returns (fund 5%, bank 0%): holdings
    // drift far off 60/40, but each year's 1,200 savings must still split 720/480
    // on the ORIGINAL starting shares, not on the drifted/current mix. New money
    // earns no current-year return. projectedBasisRate 0 isolates this
    // contribution contract: no VP accrues, so accumulation funds no tax (drift
    // sells nothing, bank interest zero) and closes are hand-derived exactly.
    // Year 0: 60,000*1.05+720=63,720 / 40,000+480=40,480 (total 104,200).
    // Year 1: 63,720*1.05+720=67,626 / 40,480+480=40,960 (total 108,586).
    // Year 2: 67,626*1.05+720=71,727.3 / 40,960+480=41,440 (total 113,167.3).
    // A drifted-share twin would contribute ~733/467 in year 1 (61.1% fund)
    // instead of 720/480.
    const base: RentenlueckeInput = insuredInput({
      currentAge: 62, retirementAge: 65, planningAge: 69, currentCapital: 100000,
      monthlyContributionToday: 100, monthlyDesiredSpendingToday: 2500,
      estimatorPortfolio: [
        { id: 'fund', name: 'Fonds', value: 60000, holding: 'accumulating-equity-fund', returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.equity },
        { id: 'bank', name: 'Bank', value: 40000, holding: 'ordinary-bank-deposit', returnSeriesId: PLANNING_RATE_SOURCE_ID },
      ],
      retirementInsurance: automaticInsurance({
        bridge: { status: 'voluntary', circumstances: 'standard', capitalMode: 'automatic' },
        capitalEstimator: { fundAcquisitionCost: 60000, projectedBasisRate: 0, scopeConfirmed: true, lossScopeConfirmed: true },
      }),
    })
    const event: RentenlueckeInput = { ...base,
      allocationAtRetirement: { enabled: true, accepted: true, fixedTargets: [], remainderWeights: { fund: 0.5, bank: 0.5 } } }
    const unequal = (fundRate: number) => [
      { id: 'fund', totalReturnRate: fundRate },
      { id: 'bank', totalReturnRate: 0, grossBankReturnRate: 0 },
    ]
    const path = [unequal(0.05), unequal(0.05), unequal(0.05),
      unequal(0), unequal(0), unequal(0), unequal(0)]
    const drift = simulateScenarioWithReturnPath(base, [], undefined, path)
    const allocated = simulateScenarioWithReturnPath(event, [], undefined, path)
    expect(drift.accumulationRows).toHaveLength(3)
    expect(allocated.accumulationRows).toHaveLength(3)
    const expected = [[63720, 40480, 104200], [67626, 40960, 108586], [71727.3, 41440, 113167.3]]
    for (let i = 0; i < 3; i++) {
      const row = allocated.accumulationRows[i]
      const fundClose = row.capitalAssessment!.closingState!.buckets.find(b => b.id === 'fund')!.value
      const bankClose = row.capitalAssessment!.closingState!.buckets.find(b => b.id === 'bank')!.value
      expect(fundClose).toBeCloseTo(expected[i][0], 6)
      expect(bankClose).toBeCloseTo(expected[i][1], 6)
      expect(row.closingCapital).toBeCloseTo(expected[i][2], 6)
      expect(row.closingCapital).toBeCloseTo(drift.accumulationRows[i].closingCapital, 9)
      expect(row.capitalAssessment!.sale.paid).toBe(0)
    }
    // Holdings visibly drifted (fund share ~66.5% by year 2) while savings stayed 60/40.
    const lastFund = allocated.accumulationRows[2].capitalAssessment!.closingState!.buckets.find(b => b.id === 'fund')!.value
    expect(lastFund / allocated.accumulationRows[2].closingCapital).toBeGreaterThan(0.63)
  })
})
