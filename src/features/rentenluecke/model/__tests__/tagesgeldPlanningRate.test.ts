// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { insuredInput, automaticInsurance, cashOnlyInput } from './insuranceFixtures'
import { simulateScenario } from '../simulateScenario'
import { simulateScenarioWithReturnPath, createSeededRandom } from '../stochasticReturns'
import {
  simulateHistoricalBootstrapReferenceScenario,
  runHistoricalBootstrapSimulation,
  FIXED_INFLATION_SOURCE_ID,
} from '../historicalReturns'
import { PLANNING_RATE_SOURCE_ID, SYNTHETIC_RETURN_SERIES_IDS } from '../historicalReturns/constants'
import { createPortfolioComponentsFromBuckets } from '../portfolioBuckets'
import { expectedBucketReturns, sampledBucketReturns } from '../capitalIncome/returns'
import {
  resolveComponentNominalReturn,
  resolveComponentExpectedNominalReturn,
  CASH_PLANNING_RATE_ERROR,
} from '../historicalReturns/bootstrapSampling'
import { createFixedInflationSource } from '../historicalReturns/inflationSeriesRegistry'
import { getConfirmedCashPlanningRate, cashPlanningRateIssue } from '../cashPlanningRate'
import { portfolioEstimatorReadiness } from '../capitalIncome/portfolioEstimator'
import { createEstimatorState, simulateEstimatorYear } from '../capitalIncome/insuranceEstimator'
import type { RentenlueckeInput } from '../types'

function bankOnlyInput(overrides: Partial<RentenlueckeInput> = {}): RentenlueckeInput {
  return insuredInput({
    currentAge: 67,
    retirementAge: 67,
    planningAge: 68,
    currentCapital: 100_000,
    monthlyContributionToday: 0,
    monthlyDesiredSpendingToday: 0,
    monthlyRetirementIncomeToday: 0,
    annualInflationRate: 0,
    estimatorPortfolio: [
      { id: 'bank', name: 'Bank', value: 100_000, holding: 'ordinary-bank-deposit', returnSeriesId: PLANNING_RATE_SOURCE_ID, annualCostRate: 0.03 },
    ],
    retirementInsurance: automaticInsurance({
      bridge: { status: 'voluntary', circumstances: 'standard', capitalMode: 'automatic' },
      capitalEstimator: { fundAcquisitionCost: 0, projectedBasisRate: 0.032, scopeConfirmed: true, lossScopeConfirmed: true },
    }),
    retirementIncomeStreams: [],
    ...overrides,
  })
}

function fundBankInput(): RentenlueckeInput {
  return insuredInput({
    currentAge: 66,
    retirementAge: 67,
    planningAge: 70,
    currentCapital: 100_000,
    monthlyContributionToday: 0,
    monthlyDesiredSpendingToday: 2_500,
    annualInflationRate: 0,
    estimatorPortfolio: [
      { id: 'fund', name: 'Fonds', value: 60_000, holding: 'accumulating-equity-fund', returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.equity },
      { id: 'bank', name: 'Bank', value: 40_000, holding: 'ordinary-bank-deposit', returnSeriesId: PLANNING_RATE_SOURCE_ID },
    ],
    retirementInsurance: automaticInsurance({
      pension: { status: 'voluntary', circumstances: 'standard', capitalMode: 'automatic', drvSubsidy: 'not-received' },
      capitalEstimator: { fundAcquisitionCost: 30_000, projectedBasisRate: 0.032, scopeConfirmed: true, lossScopeConfirmed: true },
    }),
  })
}

describe('tagesgeld planning rate arithmetic', () => {
  it('computes gross 2000, net -1000, tax 263.75, closing 98736.25', () => {
    const input = bankOnlyInput()
    const result = simulateScenario(input, 0.02)
    expect(result.rows).toHaveLength(1)
    const row = result.rows[0]
    expect(row.capitalAssessment!.bankInterest).toBeCloseTo(2_000, 8)
    expect(row.investmentReturn).toBeCloseTo(-1_000, 8)
    expect(row.capitalIncomeTax).toBeCloseTo(263.75, 8)
    expect(row.taxableWithdrawal).toBeCloseTo(2_000, 8)
    expect(row.sparerpauschbetragApplied).toBeCloseTo(1_000, 8)
    expect(row.closingCapital).toBeCloseTo(98_736.25, 8)
  })

  it('threads the same rate through expected and sampled returns', () => {
    const input = bankOnlyInput()
    const comps = createPortfolioComponentsFromBuckets(input.estimatorPortfolio!)
    const expected = expectedBucketReturns(input, {
      portfolioComponents: comps,
      inflationSourceId: 'fixed-manual',
      simulations: 1,
      cashPlanningRate: 0.02,
    })
    expect(expected[0]!.grossBankReturnRate).toBeCloseTo(0.02, 12)
    expect(expected[0]!.totalReturnRate).toBeCloseTo(-0.01, 12)
    const inflationSource = createFixedInflationSource(0)
    const sampled = sampledBucketReturns(comps, inflationSource, [0], createSeededRandom(1), 0.02)
    expect(sampled[0]![0]!.grossBankReturnRate).toBeCloseTo(0.02, 12)
    expect(sampled[0]![0]!.totalReturnRate).toBeCloseTo(-0.01, 12)
  })
})

describe('tagesgeld rate zero and real cases', () => {
  it('allows rate 0 end-to-end without throw or clipping', () => {
    const input = bankOnlyInput({
      estimatorPortfolio: [
        { id: 'bank', name: 'Bank', value: 100_000, holding: 'ordinary-bank-deposit', returnSeriesId: PLANNING_RATE_SOURCE_ID, annualCostRate: 0 },
      ],
    })
    const result = simulateScenario(input, 0)
    const row = result.rows[0]
    expect(row.capitalAssessment!.bankInterest).toBeCloseTo(0, 12)
    expect(row.investmentReturn).toBeCloseTo(0, 12)
    expect(row.capitalIncomeTax ?? 0).toBeCloseTo(0, 12)
    expect(row.closingCapital).toBeCloseTo(100_000, 8)
  })

  it('allows net-negative via costs with rate 0', () => {
    const input = bankOnlyInput({
      estimatorPortfolio: [
        { id: 'bank', name: 'Bank', value: 100_000, holding: 'ordinary-bank-deposit', returnSeriesId: PLANNING_RATE_SOURCE_ID, annualCostRate: 0.01 },
      ],
    })
    const result = simulateScenario(input, 0)
    expect(result.rows[0].investmentReturn).toBeCloseTo(-1_000, 8)
    expect(result.rows[0].closingCapital).toBeCloseTo(99_000, 8)
  })

  it('keeps nominal 2 percent with 3 percent inflation without adding inflation', () => {
    const comps = createPortfolioComponentsFromBuckets(bankOnlyInput().estimatorPortfolio!)
    const inflationSource = createFixedInflationSource(0.03)
    const sampled = sampledBucketReturns(comps, inflationSource, [0], createSeededRandom(7), 0.02)
    expect(sampled[0]![0]!.grossBankReturnRate).toBeCloseTo(0.02, 12)
    const nominal = 0.02
    const real = (1 + nominal) / (1 + 0.03) - 1
    expect(real).toBeLessThan(0)
    const comp = comps[0]!
    const gross = resolveComponentNominalReturn(comp, 0, 0.03, createSeededRandom(7), 0.02)
    expect(gross).toBeCloseTo(0.02, 12)
    const expected = resolveComponentExpectedNominalReturn({ ...comp, annualCostRate: 0 }, 0, 0.03, 0.02)
    expect(expected).toBeCloseTo(0.02, 12)
  })
})

describe('tagesgeld multiple bank buckets share one rate', () => {
  it('applies the same planning rate to both buckets with different costs', () => {
    const input = insuredInput({
      currentAge: 67,
      retirementAge: 67,
      planningAge: 68,
      currentCapital: 100_000,
      monthlyContributionToday: 0,
      monthlyDesiredSpendingToday: 0,
      annualInflationRate: 0,
      estimatorPortfolio: [
        { id: 'bank1', name: 'Bank1', value: 60_000, holding: 'ordinary-bank-deposit', returnSeriesId: PLANNING_RATE_SOURCE_ID, annualCostRate: 0.01 },
        { id: 'bank2', name: 'Bank2', value: 40_000, holding: 'ordinary-bank-deposit', returnSeriesId: PLANNING_RATE_SOURCE_ID, annualCostRate: 0.02 },
      ],
      retirementInsurance: automaticInsurance({
        bridge: { status: 'voluntary', circumstances: 'standard', capitalMode: 'automatic' },
        capitalEstimator: { fundAcquisitionCost: 0, projectedBasisRate: 0.032, scopeConfirmed: true, lossScopeConfirmed: true },
      }),
      retirementIncomeStreams: [],
    })
    const comps = createPortfolioComponentsFromBuckets(input.estimatorPortfolio!)
    const inflationSource = createFixedInflationSource(0)
    const sampled = sampledBucketReturns(comps, inflationSource, [0], createSeededRandom(3), 0.02)
    const row = sampled[0]!
    const b1 = row.find((r) => r.id === 'bank1')!
    const b2 = row.find((r) => r.id === 'bank2')!
    expect(b1.grossBankReturnRate).toBeCloseTo(0.02, 12)
    expect(b2.grossBankReturnRate).toBeCloseTo(0.02, 12)
    expect(b1.totalReturnRate).toBeCloseTo(0.01, 12)
    expect(b2.totalReturnRate).toBeCloseTo(0.0, 12)
    const result = simulateScenario(input, 0.02)
    expect(result.rows[0].capitalAssessment!.bankInterest).toBeCloseTo(2_000, 8)
    expect(result.rows[0].investmentReturn).toBeCloseTo(600, 8)
  })
})

describe('tagesgeld same rate on all paths', () => {
  it('keeps reference identical across N and deterministic across reloads', () => {
    const input = fundBankInput()
    const comps = createPortfolioComponentsFromBuckets(input.estimatorPortfolio!)
    const base = { portfolioComponents: comps, inflationSourceId: FIXED_INFLATION_SOURCE_ID, cashPlanningRate: 0.02 } as const
    const ref2 = simulateHistoricalBootstrapReferenceScenario(input, { ...base, simulations: 2 })
    const ref5 = simulateHistoricalBootstrapReferenceScenario(input, { ...base, simulations: 5 })
    expect(ref5.rows).toEqual(ref2.rows)
    const once = runHistoricalBootstrapSimulation(input, { ...base, simulations: 3 })
    const twice = runHistoricalBootstrapSimulation(input, { ...base, simulations: 3 })
    expect(twice).toEqual(once)
  })
})

describe('tagesgeld tax contracts', () => {
  it('does not double count interest, does not retax principal, exempts only funds', () => {
    const input = fundBankInput()
    const path = [
      [
        { id: 'fund', totalReturnRate: 0.1 },
        { id: 'bank', totalReturnRate: 0.02, grossBankReturnRate: 0.02 },
      ],
      [
        { id: 'fund', totalReturnRate: 0.0 },
        { id: 'bank', totalReturnRate: 0.02, grossBankReturnRate: 0.02 },
      ],
      [
        { id: 'fund', totalReturnRate: 0.0 },
        { id: 'bank', totalReturnRate: 0.02, grossBankReturnRate: 0.02 },
      ],
      [
        { id: 'fund', totalReturnRate: 0.0 },
        { id: 'bank', totalReturnRate: 0.02, grossBankReturnRate: 0.02 },
      ],
    ]
    const result = simulateScenarioWithReturnPath(input, [], undefined, path)
    for (const row of result.rows) {
      expect(row.closingCapital).toBeCloseTo(
        row.openingCapital + row.investmentReturn + row.contribution - row.capitalAssessment!.paidWithdrawal + (row.surplusReinvested ?? 0),
        5,
      )
      const assessment = row.capitalAssessment!
      expect(assessment.bankInterest).toBeGreaterThanOrEqual(0)
      expect(row.taxableWithdrawal ?? 0).toBeLessThanOrEqual(
        assessment.sale.adjustedFundSaleGain + assessment.movement.adjustedFundSaleGain + assessment.receivedVorabpauschale + assessment.bankInterest + 1e-6,
      )
    }
    const first = result.rows[0]
    expect(first.capitalAssessment!.bankInterest).toBeCloseTo(800, 8)
  })
})

describe('tagesgeld missing rate guard and fund-only', () => {
  it('throws a clear German error without silent fallback', () => {
    const comps = createPortfolioComponentsFromBuckets(bankOnlyInput().estimatorPortfolio!)
    const comp = comps[0]!
    expect(() => resolveComponentNominalReturn(comp, 0, 0, createSeededRandom(1), undefined)).toThrow(CASH_PLANNING_RATE_ERROR)
    expect(() => resolveComponentNominalReturn(comp, 0, 0, createSeededRandom(1), Number.NaN)).toThrow(/Rechenannahmen/)
    expect(() => resolveComponentNominalReturn(comp, 0, 0, createSeededRandom(1), -0.01)).toThrow(/Rechenannahmen/)
    expect(() => resolveComponentExpectedNominalReturn(comp, 0, 0, undefined)).toThrow(CASH_PLANNING_RATE_ERROR)
    expect(() => simulateScenario(bankOnlyInput())).toThrow(/Rechenannahmen/)
  })

  it('requires no rate for fund-only portfolios', () => {
    const input = cashOnlyInput({
      currentAge: 66,
      retirementAge: 67,
      planningAge: 68,
      currentCapital: 10_000,
      monthlyDesiredSpendingToday: 0,
      annualInflationRate: 0,
    })
    expect(cashPlanningRateIssue([{ returnSeriesId: input.estimatorPortfolio![0]!.returnSeriesId! }], undefined)).toBeNull()
    expect(getConfirmedCashPlanningRate(undefined)).toBeUndefined()
    expect(cashPlanningRateIssue([{ returnSeriesId: PLANNING_RATE_SOURCE_ID }], undefined)).not.toBeNull()
    expect(cashPlanningRateIssue([{ returnSeriesId: PLANNING_RATE_SOURCE_ID }], { cashPlanningRate: 0.02, cashPlanningRateConfirmed: true })).toBeNull()
    expect(cashPlanningRateIssue([{ returnSeriesId: PLANNING_RATE_SOURCE_ID }], { cashPlanningRate: 0.02, cashPlanningRateConfirmed: false })).not.toBeNull()
  })
})

describe('tagesgeld legacy cash sources need redecision', () => {
  it('flags Bills and synthetic cash on bank deposits', () => {
    const bills = portfolioEstimatorReadiness(
      { fundAcquisitionCost: 0, projectedBasisRate: 0.032, scopeConfirmed: true, lossScopeConfirmed: true },
      [{ id: 'bank', name: 'Bank', value: 10_000, holding: 'ordinary-bank-deposit', returnSeriesId: 'jst-r6-developed-equal-weight-bills-real-post1950' } as never],
      10_000,
    )
    expect(bills.issues.join(' ')).toMatch(/Tagesgeld/)
    const synth = portfolioEstimatorReadiness(
      { fundAcquisitionCost: 0, projectedBasisRate: 0.032, scopeConfirmed: true, lossScopeConfirmed: true },
      [{ id: 'bank', name: 'Bank', value: 10_000, holding: 'ordinary-bank-deposit', returnSeriesId: 'synthetic-cash-assumption-v1' } as never],
      10_000,
    )
    expect(synth.issues.join(' ')).toMatch(/Tagesgeld/)
    const ok = portfolioEstimatorReadiness(
      { fundAcquisitionCost: 0, projectedBasisRate: 0.032, scopeConfirmed: true, lossScopeConfirmed: true },
      [{ id: 'bank', name: 'Bank', value: 10_000, holding: 'ordinary-bank-deposit', returnSeriesId: PLANNING_RATE_SOURCE_ID } as never],
      10_000,
    )
    expect(ok.issues).toEqual([])
    expect(ok.ready).toBe(true)
  })

  it('keeps the negative gross bank diagnostic', () => {
    const state = createEstimatorState({
      buckets: [{ id: 'bank', value: 10_000, eligibility: 'ordinary-bank-deposit' }],
      fundAcquisitionCost: 0,
      scope: 'single-person-domestic-private-post-2017-no-special-events',
      lossHistory: 'confirmed-none-and-no-external-offsets',
    })
    expect(() =>
      simulateEstimatorYear(
        state,
        {
          projectedBasisRate: 0.032,
          expenseAllowance: 51,
          spendingLessOtherIncome: 0,
          withdrawalTax: { openingLossCarryforward: 0, allowanceAvailable: 1_000 },
          buckets: [{ id: 'bank', totalReturnRate: -0.01, grossBankReturnRate: -0.01, contribution: 0, targetWeight: 1 }],
        },
        () => ({ kv: 0, pv: 0 }),
      ),
    ).toThrow(/Negativer Brutto|Negative bank return/)
  })
})
