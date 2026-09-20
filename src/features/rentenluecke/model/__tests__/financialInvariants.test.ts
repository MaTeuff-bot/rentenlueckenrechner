import { describe, expect, it } from 'vitest'
import { applyCoverage } from '../insuranceCoverage'
import { completedCoverage } from './insuranceFixtures'
import { timelineBoundary } from '../scenarioTimeline'
import { clearHiddenInvalidInsuranceValues } from '../retirementInsurance'
import { simulateScenario } from '../simulateScenario'
import { simulateScenarioWithReturnPath } from '../stochasticReturns'
import { assessCore } from '../tax/pureCore'
import { scaledSparerpauschbetrag } from '../tax/capitalIncomeTax'
import { simulateHistoricalBootstrapScenario, simulateHistoricalBootstrapReferenceScenario, FIXED_INFLATION_SOURCE_ID } from '../historicalReturns'
import { createPortfolioComponentsFromBuckets } from '../portfolioBuckets'
import { runStochasticSimulation } from '../stochasticReturns'
import type { RentenlueckeInput, YearlyPeriodRow } from '../types'
import {
  depletedScenario,
  earlyRetirementBridgeScenario,
  estimatorScenario,
  kvdrStandardScenario,
  voluntaryManualCapitalScenario,
  zeroStartAccumulationScenario,
} from './referenceScenarios.test'

/**
 * Financial-correctness sweep (hardening PR3). Extends the PR2 reference suite with
 * cross-year accounting guarantees that unit tests per module cannot prove:
 * rollforward of acquisition cost / Vorabpauschale / loss balances across the whole
 * ledger, an independent closed-form accumulator for multi-decade convention drift,
 * real/nominal reconciliation, bootstrap-accounting consistency, phase cashflow
 * boundaries and required-capital search soundness.
 */

const REL = 1e-6
expect.extend({
  toBeMoneyClose(received: number, expected: number) {
    const pass = Math.abs(received - expected) <= Math.max(REL * Math.abs(expected), 1e-9)
    return { pass, message: () => `expected ${received} to be within ${REL} of ${expected}` }
  },
})

function prepare(input: RentenlueckeInput, keepPensionAge = false): RentenlueckeInput {
  const base = { ...input, retirementInsurance: input.retirementInsurance ? applyCoverage(input.retirementInsurance, completedCoverage()) : undefined }
  return clearHiddenInvalidInsuranceValues({
    ...base,
    retirementInsurance: base.retirementInsurance
      ? { ...base.retirementInsurance, ...(keepPensionAge ? {} : { pensionAge: timelineBoundary(base.retirementIncomeStreams ?? []) }) }
      : undefined,
  })
}

function allRows(result: { rows: YearlyPeriodRow[] }): YearlyPeriodRow[] {
  return result.rows
}

describe('estimator rollforward: acquisition cost, assessed VP, pending VP and losses', () => {
  const input = prepare(estimatorScenario())
  const result = simulateScenario(input)
  const rows = result.rows
  const ledger = rows.map(row => row.capitalAssessment!)

  it('chains each year\'s closing state into the next year exactly once', () => {
    // Reconstructs the engine's rollforward identities from the returned ledger only
    // (insuranceEstimator.ts: closing = movement.state + fundContribution).
    // movement.state already includes: prior cost − released + purchases, and
    // prior assessed VP + received − adjustmentReleased (via maintainAllocation).
    for (let index = 1; index < rows.length; index++) {
      const previous = ledger[index - 1], current = ledger[index]
      // Fund acquisition cost: prior − released by the withdrawal sale AND by the
      // allocation-maintenance sales + purchases + end-year fund contributions.
      const priorFundValue = previous.closingState!.buckets.filter(b => b.eligibility === 'accumulating-equity-fund').reduce((s, b) => s + b.value, 0)
      const priorTotal = previous.closingState!.buckets.reduce((s, b) => s + b.value, 0)
      const fundShare = priorTotal > 0 ? priorFundValue / priorTotal : 0
      const impliedCost = previous.closingState!.fundAcquisitionCost
        - current.sale.costReleased - current.movement.costReleased
        + current.movement.fundPurchases + current.contribution * fundShare
      expect(current.closingState!.fundAcquisitionCost, `cost year ${index}`).toBeMoneyClose(impliedCost)
      // Assessed VP: prior + received − released (withdrawal sale + allocation sales);
      // releases reconstructed from the two sale-gain identities.
      const saleAdjustmentReleased = current.sale.fundProceeds - current.sale.costReleased - current.sale.adjustedFundSaleGain
      const movementAdjustmentReleased = current.movement.fundSales - current.movement.costReleased - current.movement.adjustedFundSaleGain
      expect(current.closingState!.assessedVorabpauschalen, `assessed VP year ${index}`).toBeMoneyClose(
        previous.closingState!.assessedVorabpauschalen + current.receivedVorabpauschale
        - saleAdjustmentReleased - movementAdjustmentReleased)
      // Pending VP received this year is exactly last year's closing pending.
      expect(current.receivedVorabpauschale).toBeMoneyClose(previous.pendingVorabpauschale)
      // Loss carryforward equals the assessment's closing loss, never negative.
      expect(current.closingState!.simulatedLossCarryforward).toBe(current.assessment.closingSimulatedLoss)
      expect(current.closingState!.simulatedLossCarryforward).toBeGreaterThanOrEqual(0)
    }
  })

  it('never resets balances at the accumulation→retirement phase boundary', () => {
    const boundary = rows.findIndex(row => row.phase === 'retirement')
    expect(boundary).toBeGreaterThan(0)
    const lastAccumulation = ledger[boundary - 1], firstRetirement = ledger[boundary]
    expect(firstRetirement.closingState!.fundAcquisitionCost).toBeGreaterThan(0)
    const priorFundValue = lastAccumulation.closingState!.buckets.filter(b => b.eligibility === 'accumulating-equity-fund').reduce((s, b) => s + b.value, 0)
    const priorTotal = lastAccumulation.closingState!.buckets.reduce((s, b) => s + b.value, 0)
    const fundShare = priorTotal > 0 ? priorFundValue / priorTotal : 0
    expect(firstRetirement.closingState!.fundAcquisitionCost)
      .toBeMoneyClose(lastAccumulation.closingState!.fundAcquisitionCost
        - firstRetirement.sale.costReleased - firstRetirement.movement.costReleased
        + firstRetirement.movement.fundPurchases + firstRetirement.contribution * fundShare)
  })

  it('keeps assessments out of spendable cash across the whole ledger', () => {
    for (const row of rows) {
      // portfolioContributionBase is assessment-only; it must never appear in net income.
      if (row.phase === 'retirement') {
        expect(row.retirementIncomeNet).toBeMoneyClose(
          row.retirementIncomeGross - row.retirementIncomeOtherDeductions - row.healthInsurance - row.careInsurance)
      }
    }
  })
})

describe('multi-decade convention drift: engine vs independent accumulator', () => {
  it('matches an independently written accumulator over 60 years', () => {
    // Return on opening capital, contribution added at year end, both inflated —
    // the README-documented convention. Independent loop, different code path.
    const input = prepare(kvdrStandardScenario())
    const long: RentenlueckeInput = {
      ...input,
      currentAge: 30, retirementAge: 67, planningAge: 68,
      currentCapital: 50_000, monthlyContributionToday: 500,
      monthlyDesiredSpendingToday: 1_000, monthlyRetirementIncomeToday: 0,
      annualInflationRate: 0.02, annualReturnBeforeRetirement: 0.05,
      annualReturnInRetirement: 0,
      retirementIncomeStreams: [],
      retirementInsurance: {
        ...input.retirementInsurance!,
        bridge: { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 },
        pension: { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 },
      },
    }
    const result = simulateScenario(long)
    let capital = 50_000
    for (let yearIndex = 0; yearIndex < 37; yearIndex++) {
      const inflationFactor = 1.02 ** yearIndex
      capital = capital * 1.05 + 6_000 * inflationFactor
    }
    expect(result.accumulationRows).toHaveLength(37)
    expect(result.summary.projectedCapitalAtRetirement).toBeMoneyClose(capital)
  })

  it('keeps a 50-year zero-return zero-inflation run exactly linear (no compounding of rounding)', () => {
    // All-manual insurance keeps long horizons free of missing pensionAge issues.
    const input = prepare({ ...zeroStartAccumulationScenario(),
      currentAge: 0, retirementAge: 50, planningAge: 100,
      monthlyContributionToday: 1_000, monthlyDesiredSpendingToday: 12_000 / 12,
      monthlyRetirementIncomeToday: 0,
      annualInflationRate: 0, annualReturnInRetirement: 0,
      retirementIncomeStreams: [],
      retirementInsurance: {
        referenceYear: 2026, childBirthYears: [], pensionAge: 50,
        bridge: { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 },
        pension: { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 },
      },
    }, true)
    const result = simulateScenario(input)
    expect(result.accumulationRows.at(-1)!.closingCapital).toBeMoneyClose(50 * 12_000)
    // Retirement consumption is exactly linear: 600,000 − 12,000 per year, reaching
    // exactly zero at the final row (success under the exact-zero rule).
    expect(result.retirementRows).toHaveLength(50)
    for (const [index, row] of result.retirementRows.entries()) {
      expect(row.closingCapital).toBeMoneyClose(50 * 12_000 - 12_000 * (index + 1))
    }
    expect(result.retirementRows.at(-1)!.closingCapital).toBe(0)
    expect(result.summary.survivesUntilPlanningAge).toBe(true)
  })
})

describe('real/nominal reconciliation', () => {
  it('divides closing capital by the cumulative factor at year end (yearIndex+1)', () => {
    for (const scenario of [kvdrStandardScenario, earlyRetirementBridgeScenario, voluntaryManualCapitalScenario, depletedScenario]) {
      const result = simulateScenario(prepare(scenario()))
      for (const row of allRows(result)) {
        // Engine convention: closingCapitalToday divides by the cumulative factor of
        // yearIndex+1. For a fixed 2% path: inflationFactor(yearIndex) × 1.02.
        // Zero-inflation scenarios keep factor 1 everywhere (no discount at all).
        const zeroInflation = row.inflationFactor === 1
        const yearEndFactor = zeroInflation ? row.inflationFactor : row.inflationFactor * 1.02
        expect(row.closingCapitalToday).toBeMoneyClose(row.closingCapital / yearEndFactor)
      }
    }
  })

  it('keeps today-views equal to nominal amounts at zero inflation', () => {
    const result = simulateScenario(prepare(kvdrStandardScenario()))
    for (const row of allRows(result)) {
      expect(row.closingCapitalToday).toBeMoneyClose(row.closingCapital)
      expect(row.gapWithdrawalToday).toBeMoneyClose(row.gapWithdrawal)
    }
  })
})

describe('bootstrap accounting consistency', () => {
  const settings = { inflationSourceId: FIXED_INFLATION_SOURCE_ID, simulations: 3 } as const

  it('every sampled bootstrap path satisfies row conservation, for scalar and estimator ledgers', () => {
    for (const makeScenario of [kvdrStandardScenario, earlyRetirementBridgeScenario, voluntaryManualCapitalScenario, zeroStartAccumulationScenario, depletedScenario, estimatorScenario]) {
      const input = prepare(makeScenario())
      // Bootstrap functions require portfolioComponents; build them from the buckets
      // when present, otherwise an empty list keeps fixed inflation valid (all years
      // sample deterministically with synthetic/cash-less portfolios).
      const components = input.estimatorPortfolio?.length
        ? createPortfolioComponentsFromBuckets(input.estimatorPortfolio)
        : []
      const settingsWithComponents = { ...settings, portfolioComponents: components }
      const single = simulateHistoricalBootstrapScenario(input, settingsWithComponents)
      for (const row of allRows(single)) {
        if (row.capitalAssessment) {
          expect(row.closingCapital, `${makeScenario.name} age ${row.ageStart}`).toBeMoneyClose(
            row.openingCapital + row.investmentReturn + row.contribution - row.capitalAssessment.paidWithdrawal)
        } else {
          // Slice-1 funding rule: the portfolio funds gap + Kapitalertragsteuer.
          expect(row.closingCapital, `${makeScenario.name} age ${row.ageStart}`).toBeMoneyClose(
            row.openingCapital + row.investmentReturn + row.contribution - row.gapWithdrawal - (row.capitalIncomeTax ?? 0) + row.unfundedWithdrawal)
        }
        expect(Number.isFinite(row.closingCapital)).toBe(true)
      }
    }
  })

  it('reference and sampled paths share identical insurance cashflows when inflation is fixed', () => {
    const input = prepare(earlyRetirementBridgeScenario())
    const settingsWithComponents = { ...settings, portfolioComponents: createPortfolioComponentsFromBuckets(input.estimatorPortfolio ?? []) }
    const reference = simulateHistoricalBootstrapReferenceScenario(input, settingsWithComponents)
    const sampled = simulateHistoricalBootstrapScenario(input, settingsWithComponents)
    expect(reference.metadata.sampledYears).toEqual(sampled.metadata.sampledYears)
    for (const [index, row] of reference.retirementRows.entries()) {
      const other = sampled.retirementRows[index]
      expect(row.healthInsurance).toBeMoneyClose(other.healthInsurance)
      expect(row.careInsurance).toBeMoneyClose(other.careInsurance)
      expect(row.retirementIncomeNet).toBeMoneyClose(other.retirementIncomeNet)
      expect(row.gapWithdrawal).toBeMoneyClose(other.gapWithdrawal)
    }
  })

  it('stochastic summaries agree with their own deterministic plan line length and bounds', () => {
    const input = prepare(voluntaryManualCapitalScenario())
    const summary = runStochasticSimulation(input, { simulations: 5, seed: 314, allocation: { equity: 0.5, bonds: 0.3, fixed: 0.2 } })
    const deterministic = simulateScenario(input)
    expect(summary.rows).toHaveLength(deterministic.rows.length)
    for (const [index, row] of summary.rows.entries()) {
      expect(row.planCapitalToday).toBeMoneyClose(deterministic.rows[index].closingCapitalToday)
    }
  })
})

describe('phase cashflow boundaries', () => {
  it('contributions end exactly at retirement age and never occur in retirement rows', () => {
    const input = prepare({ ...zeroStartAccumulationScenario(), currentCapital: 1_000 })
    const result = simulateScenario(input)
    expect(result.accumulationRows.every(row => row.contribution > 0)).toBe(true)
    expect(result.retirementRows.every(row => row.contribution === 0)).toBe(true)
    expect(result.accumulationRows.at(-1)!.ageEnd).toBe(input.retirementAge)
  })

  it('insurance phase switch happens exactly at the statutory boundary with no gap or overlap year', () => {
    const result = simulateScenario(prepare(earlyRetirementBridgeScenario()))
    const boundary = 67
    const bridgeRows = result.retirementRows.filter(row => row.ageStart < boundary)
    const pensionRows = result.retirementRows.filter(row => row.ageStart >= boundary)
    expect(bridgeRows.every(row => row.healthInsurance === 2_160)).toBe(true)
    expect(pensionRows.every(row => row.healthInsurance === 2_100)).toBe(true)
    expect(bridgeRows.length + pensionRows.length).toBe(result.retirementRows.length)
  })
})

describe('withdrawal-tax funding: gap + Kapitalertragsteuer conservation', () => {
  it('taxes gain-proportional scalar withdrawals at positive returns (hand-computed 5% case)', () => {
    // 100,000 capital, 5% retirement return, 24,000 gap, no income, 2 retirement years.
    // Gain-proportional base (no holdings breakdown, no Teilfreistellung):
    // year gain = 5,000 x 24,000/105,000 = 1,142.857; allowance 1,000 -> base 142.857;
    // tax = 142.857 x 0.25 x 1.055 = 37.678571...; closing = 105,000 - 24,000 - 37.678571...
    // Year 2 repeats exactly (gain = G x r/(1+r) is capital-independent while fully funded).
    const input = prepare({ ...zeroStartAccumulationScenario(),
      currentAge: 67, retirementAge: 67, planningAge: 69, currentCapital: 100_000,
      monthlyContributionToday: 0, monthlyDesiredSpendingToday: 2_000,
      monthlyRetirementIncomeToday: 0,
      annualInflationRate: 0, annualReturnInRetirement: 0.05,
      retirementIncomeStreams: [],
      retirementInsurance: {
        referenceYear: 2026, childBirthYears: [], pensionAge: 67,
        bridge: { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 },
        pension: { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 },
      },
    }, true)
    const result = simulateScenario(input)
    expect(result.retirementRows).toHaveLength(2)
    for (const row of result.retirementRows) {
      expect(row.capitalIncomeTax).toBeMoneyClose(37.67857142857144)
      expect(row.taxableWithdrawal).toBeMoneyClose(1142.857142857143)
      expect(row.sparerpauschbetragApplied).toBeMoneyClose(1_000)
      expect(row.netGapWithdrawal).toBeMoneyClose(row.gapWithdrawal)
      expect(row.unfundedWithdrawal).toBe(0)
      // Money conservation WITH tax funding.
      expect(row.closingCapital).toBeMoneyClose(
        row.openingCapital + row.investmentReturn + row.contribution - row.gapWithdrawal - row.capitalIncomeTax! + row.unfundedWithdrawal)
    }
    expect(result.retirementRows[0].closingCapital).toBeMoneyClose(80962.32142857143)
    // Required capital funds gap + tax, not just the gap (2 x 24,000 = 48,000 pre-tax basis).
    expect(result.summary.requiredCapitalAtRetirement).toBeMoneyClose(44696.044921875)
    expect(result.summary.survivesUntilPlanningAge).toBe(true)
  })

  it('funds tax first and keeps the shortfall visible when proceeds are insufficient', () => {
    // 20,000 capital, 10% return -> 22,000 before cashflow vs 24,000 gap: gain 2,000,
    // tax (2,000 - 1,000) x 0.25 x 1.055 = 263.75; need 24,263.75 -> unfunded 2,263.75.
    const input = prepare({ ...zeroStartAccumulationScenario(),
      currentAge: 67, retirementAge: 67, planningAge: 68, currentCapital: 20_000,
      monthlyContributionToday: 0, monthlyDesiredSpendingToday: 2_000,
      monthlyRetirementIncomeToday: 0,
      annualInflationRate: 0, annualReturnInRetirement: 0.1,
      retirementIncomeStreams: [],
      retirementInsurance: {
        referenceYear: 2026, childBirthYears: [], pensionAge: 67,
        bridge: { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 },
        pension: { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 },
      },
    }, true)
    const result = simulateScenario(input)
    const row = result.retirementRows[0]
    expect(row.capitalIncomeTax).toBeMoneyClose(263.75)
    expect(row.depleted).toBe(true)
    expect(row.closingCapital).toBe(0)
    expect(row.unfundedWithdrawal).toBeMoneyClose(2_263.75)
    // Abgeltungsteuer withholding order: tax funded first, the gap gets the remainder.
    expect(row.netGapWithdrawal).toBeMoneyClose(22_000 - 263.75)
    expect(row.closingCapital).toBeMoneyClose(
      row.openingCapital + row.investmentReturn + row.contribution - row.gapWithdrawal - row.capitalIncomeTax! + row.unfundedWithdrawal)
  })

  it('funds gap, insurance and tax from the single estimator sale', () => {
    const result = simulateScenario(prepare(estimatorScenario()))
    for (const row of result.retirementRows) {
      const tax = row.capitalIncomeTax ?? 0
      // Required withdrawal = net spending gap + insurance + tax (single funding fixed point).
      expect(row.gapWithdrawal).toBeMoneyClose(Math.max(0, row.desiredSpending - row.retirementIncomeNet + tax))
      // The paid sale covers all three; the gap receives the remainder.
      const insurance = row.healthInsurance + row.careInsurance
      expect((row.netGapWithdrawal ?? 0) + insurance + tax).toBeMoneyClose(row.capitalAssessment!.paidWithdrawal)
      // Conservation through the single outflow; shortfall stays visible.
      expect(row.closingCapital).toBeMoneyClose(
        row.openingCapital + row.investmentReturn + row.contribution - row.capitalAssessment!.paidWithdrawal)
      expect(row.unfundedWithdrawal).toBeMoneyClose(Math.max(0, row.gapWithdrawal - row.capitalAssessment!.paidWithdrawal))
    }
    // Slice 1b: accumulation Umschichtung gains are taxed through the same path and
    // funded from the portfolio; the single paid sale covers tax (gap is zero).
    for (const row of result.accumulationRows) {
      expect(row.capitalIncomeTax).toBeDefined()
      expect(row.taxableWithdrawal).toBeDefined()
      expect(row.sparerpauschbetragApplied).toBeDefined()
      expect(row.netGapWithdrawal).toBeDefined()
      const tax = row.capitalIncomeTax ?? 0
      expect(row.gapWithdrawal).toBeMoneyClose(0)
      expect(row.netGapWithdrawal ?? 0).toBeMoneyClose(0)
      expect(row.capitalAssessment!.paidWithdrawal).toBeMoneyClose(tax + row.unfundedWithdrawal)
      expect(row.closingCapital).toBeMoneyClose(
        row.openingCapital + row.investmentReturn + row.contribution - tax + row.unfundedWithdrawal)
    }
  })
})

describe('accumulation Umschichtung tax: conservation with inflation-scaled allowance (slice 1b)', () => {
  it('taxes large rebalancing gains in accumulation and funds them from the portfolio', () => {
    // Estimator ledger, 1 accumulation + 3 retirement years; 5% inflation path;
    // fund +50% / bank +2% every year to force Umschichtung sales above the allowance.
    // Accumulation year 0 (factor 1.0 → allowance 1,000):
    // funding-sale gain 571.652 + rebalancing gain 7,606.829 = 8,178.481;
    // ×0.7 = 5,724.937 − 1,000 = 4,724.937 base; tax 4,724.937 × 0.25 × 1.055 = 1,246.202.
    const input = prepare(estimatorScenario())
    const bucketPath = Array.from({ length: 4 }, () => [
      { id: 'fund', totalReturnRate: 0.5 },
      { id: 'bank', totalReturnRate: 0.02, grossBankReturnRate: 0.02 },
    ])
    const result = simulateScenarioWithReturnPath(input, [], [0.05, 0.05, 0.05, 0.05], bucketPath)
    const acc = result.accumulationRows[0]
    expect(acc.inflationFactor).toBeMoneyClose(1)
    expect(acc.capitalIncomeTax).toBeMoneyClose(1246.202019111374)
    expect(acc.taxableWithdrawal).toBeMoneyClose(5724.936565351181)
    expect(acc.sparerpauschbetragApplied).toBeMoneyClose(1_000)
    expect(acc.gapWithdrawal).toBeMoneyClose(0)
    // Funding: the single paid sale covers the tax (gap and insurance are zero).
    expect(acc.capitalAssessment!.paidWithdrawal).toBeMoneyClose(acc.capitalIncomeTax!)
    expect(acc.netGapWithdrawal).toBeMoneyClose(0)
    // Money conservation WITH accumulation tax funding.
    expect(acc.closingCapital).toBeMoneyClose(
      acc.openingCapital + acc.investmentReturn + acc.contribution - acc.capitalIncomeTax! + acc.unfundedWithdrawal)
    expect(acc.closingCapital).toBeMoneyClose(
      acc.openingCapital + acc.investmentReturn + acc.contribution - acc.capitalAssessment!.paidWithdrawal)
    // Retirement allowances scale with the factor (1.05, 1.05², 1.05³).
    const factors = [1.05, 1.05 ** 2, 1.05 ** 3]
    result.retirementRows.forEach((row, n) => {
      expect(row.inflationFactor).toBeMoneyClose(factors[n])
      expect(row.sparerpauschbetragApplied).toBeMoneyClose(1_000 * factors[n])
    })
    expect(result.retirementRows[0].capitalIncomeTax).toBeMoneyClose(3624.5290940306722)
    // Single-source loss: each retirement tax recomputes from the chained estimator
    // loss (accumulation closing → retirement opening) through the same core path.
    let openingLoss = result.accumulationRows[0].capitalAssessment!.closingState!.simulatedLossCarryforward
    for (const row of result.retirementRows) {
      const recomputed = assessCore(
        row.capitalAssessment!.sale.adjustedFundSaleGain + row.capitalAssessment!.movement.adjustedFundSaleGain,
        row.capitalAssessment!.receivedVorabpauschale,
        openingLoss, scaledSparerpauschbetrag(row.inflationFactor), true)
      expect(row.capitalIncomeTax).toBeMoneyClose(recomputed.capitalIncomeTax)
      expect(row.taxableWithdrawal).toBeMoneyClose(recomputed.taxableWithdrawal)
      openingLoss = row.capitalAssessment!.closingState!.simulatedLossCarryforward
    }
  })

  it('scales the scalar allowance with inflation (hand-computed 10% case)', () => {
    // 100,000 capital, 5% retirement return, 10% inflation, 24,000 gap (today), no income.
    // Year 0 (factor 1.0 → allowance 1,000): gain = 5,000 × 24,000/105,000 = 1,142.857;
    // base 142.857; tax 142.857 × 0.25 × 1.055 = 37.678571; closing 80,962.321.
    // Year 1 (factor 1.1 → allowance 1,100): spending 26,400; gain = 26,400 × 0.05/1.05
    // = 1,257.143; base 157.143; tax 157.143 × 0.25 × 1.055 = 41.446429.
    const input = prepare({ ...zeroStartAccumulationScenario(),
      currentAge: 67, retirementAge: 67, planningAge: 69, currentCapital: 100_000,
      monthlyContributionToday: 0, monthlyDesiredSpendingToday: 2_000,
      monthlyRetirementIncomeToday: 0,
      annualInflationRate: 0.1, annualReturnInRetirement: 0.05,
      retirementIncomeStreams: [],
      retirementInsurance: {
        referenceYear: 2026, childBirthYears: [], pensionAge: 67,
        bridge: { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 },
        pension: { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 },
      },
    }, true)
    const result = simulateScenario(input)
    expect(result.retirementRows).toHaveLength(2)
    const [first, second] = result.retirementRows
    expect(first.inflationFactor).toBeMoneyClose(1)
    expect(first.sparerpauschbetragApplied).toBeMoneyClose(1_000)
    expect(first.taxableWithdrawal).toBeMoneyClose(1142.857142857143)
    expect(first.capitalIncomeTax).toBeMoneyClose(37.67857142857144)
    expect(first.closingCapital).toBeMoneyClose(80962.32142857143)
    expect(second.inflationFactor).toBeMoneyClose(1.1)
    expect(second.sparerpauschbetragApplied).toBeMoneyClose(1_100)
    expect(second.taxableWithdrawal).toBeMoneyClose(1257.1428571428576)
    expect(second.capitalIncomeTax).toBeMoneyClose(41.44642857142868)
    for (const row of result.retirementRows) {
      expect(row.closingCapital).toBeMoneyClose(
        row.openingCapital + row.investmentReturn + row.contribution - row.gapWithdrawal - row.capitalIncomeTax! + row.unfundedWithdrawal)
    }
  })
})

describe('required-capital search soundness', () => {
  it('is monotone: any capital below the required amount depletes, any above survives', () => {
    const input = prepare(depletedScenario())
    const result = simulateScenario(input)
    const required = result.summary.requiredCapitalAtRetirement
    expect(required).toBeGreaterThan(0)
    // Depleted scenario: search over the same ledger must sit between survive/fail.
    const surviveProbe = prepare({ ...depletedScenario(), currentCapital: required })
    const failProbe = prepare({ ...depletedScenario(), currentCapital: Math.max(0, required - 2) })
    expect(simulateScenario(surviveProbe).summary.survivesUntilPlanningAge).toBe(true)
    expect(simulateScenario(failProbe).summary.survivesUntilPlanningAge).toBe(false)
  })

  it('equals the hand-computed annuity-free sum for constant gaps at zero return and inflation', () => {
    // 8 retirement years × 24,000 gap = 192,000.
    const input = prepare(depletedScenario())
    const result = simulateScenario(input)
    expect(result.summary.requiredCapitalAtRetirement).toBeMoneyClose(8 * 24_000)
  })
})
