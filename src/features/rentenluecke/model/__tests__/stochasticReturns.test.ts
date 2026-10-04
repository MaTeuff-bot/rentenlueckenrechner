import { describe, expect, it } from 'vitest'
import { cashOnlyInput, withFullCostBasis, zeroBucketPath } from './insuranceFixtures'
import { simulateScenario } from '../simulateScenario'
import {
  ASSET_CLASS_ASSUMPTIONS,
  calculatePortfolioExpectedReturn,
  createSeededRandom,
  DEFAULT_ASSET_ALLOCATION,
  getAllocationValidationError,
  runStochasticSimulation,
  simulateScenarioWithReturnPath,
  type AssetAllocation,
  type AssetClassAssumption,
  type StochasticSettings,
} from '../stochasticReturns'
import type { RentenlueckeInput } from '../types'
import { sampledBucketReturns } from '../capitalIncome/returns'
import { createPortfolioComponentsFromBuckets } from '../portfolioBuckets'
import { createFixedInflationSource } from '../historicalReturns/inflationSeriesRegistry'

function input(overrides: Partial<RentenlueckeInput> = {}): RentenlueckeInput {
  return withFullCostBasis(cashOnlyInput(overrides))
}

function settings(overrides: Partial<StochasticSettings> = {}): StochasticSettings {
  return {
    allocation: DEFAULT_ASSET_ALLOCATION,
    simulations: 100,
    seed: 123,
    ...overrides,
  }
}

describe('stochastic returns', () => {
  it('creates deterministic seeded random sequences', () => {
    const first = createSeededRandom(42)
    const second = createSeededRandom(42)

    expect([first(), first(), first()]).toEqual([second(), second(), second()])
  })

  it('returns identical stochastic summaries for the same input and settings', () => {
    const scenarioInput = input()
    const stochasticSettings = settings()

    expect(runStochasticSimulation(scenarioInput, stochasticSettings)).toEqual(
      runStochasticSimulation(scenarioInput, stochasticSettings),
    )
  })

  it('derives weighted deterministic return from allocation', () => {
    const allocation: AssetAllocation = { equity: 0.5, bonds: 0.25, fixed: 0.25 }

    expect(calculatePortfolioExpectedReturn(allocation)).toBeCloseTo(0.0475)
  })

  it('validates allocation sum and range', () => {
    expect(getAllocationValidationError({ equity: 0.7, bonds: 0.2, fixed: 0.1 })).toBeNull()
    expect(getAllocationValidationError({ equity: 0.7, bonds: 0.2, fixed: 0.2 })).toBe(
      'Die Aufteilung muss zusammen 100 % ergeben.',
    )
    expect(getAllocationValidationError({ equity: -0.1, bonds: 1.1, fixed: 0 })).toBe(
      'Die Aufteilung muss je Anlageklasse zwischen 0 % und 100 % liegen.',
    )
  })

  it('matches the deterministic path at p50 when volatility is zero and returns are derived from allocation', () => {
    const allocation: AssetAllocation = { equity: 1, bonds: 0, fixed: 0 }
    const assumptions: AssetClassAssumption[] = ASSET_CLASS_ASSUMPTIONS.map((assumption) => ({
      ...assumption,
      annualVolatility: 0,
    }))
    const derivedReturn = calculatePortfolioExpectedReturn(allocation, assumptions)
    const scenarioInput = input({
      annualReturnBeforeRetirement: derivedReturn,
      annualReturnInRetirement: derivedReturn,
    })
    const deterministicResult = simulateScenario(scenarioInput, 0.02)
    const stochasticSummary = runStochasticSimulation(
      scenarioInput,
      settings({ allocation, simulations: 25 }),
      assumptions,
    )

    expect(stochasticSummary.rows).toHaveLength(deterministicResult.rows.length)
    for (const [index, row] of stochasticSummary.rows.entries()) {
      expect(row.p50CapitalToday).toBeCloseTo(deterministicResult.rows[index].closingCapitalToday)
    }
  })

  it('keeps depleted paths at zero in later rows', () => {
    const scenarioInput = input({
      currentAge: 67,
      retirementAge: 67,
      planningAge: 70,
      currentCapital: 1_000,
      monthlyDesiredSpendingToday: 100,
      monthlyRetirementIncomeToday: 0,
      annualInflationRate: 0,
    })
    // Mandatory detailed portfolio at explicitly modeled zero returns: the
    // 1,000 fund allocation (full cost basis, no gains) depletes against the
    // 1,200 gap in year 1 and stays at zero afterwards.
    const result = simulateScenarioWithReturnPath(scenarioInput, [], undefined, zeroBucketPath(scenarioInput, 3))

    expect(result.rows[0].depleted).toBe(true)
    expect(result.rows[1].openingCapital).toBe(0)
    expect(result.rows[1].closingCapitalToday).toBe(0)
    expect(result.rows[2].closingCapitalToday).toBe(0)
  })

  it('reports full success when there are no withdrawals and capital cannot deplete', () => {
    const scenarioInput = input({
      monthlyDesiredSpendingToday: 1_000,
      monthlyRetirementIncomeToday: 2_000,
      annualReturnBeforeRetirement: 0.02,
      annualReturnInRetirement: 0.02,
    })
    const summary = runStochasticSimulation(scenarioInput, settings({ simulations: 50 }))

    expect(summary.successProbability).toBe(1)
  })

  it('allows ending exactly at zero after the final planned withdrawal to count as success', () => {
    const scenarioInput = input({
      currentAge: 67,
      retirementAge: 67,
      planningAge: 68,
      currentCapital: 1_200,
      monthlyDesiredSpendingToday: 100,
      monthlyRetirementIncomeToday: 0,
      annualInflationRate: 0,
    })
    const result = simulateScenarioWithReturnPath(scenarioInput, [], undefined, zeroBucketPath(scenarioInput, 1))

    expect(result.rows[0].closingCapitalToday).toBe(0)
    expect(result.summary.survivesUntilPlanningAge).toBe(true)
  })

  it('deducts bucket costs from synthetic sampled fund returns', () => {
    const zeroVol = ASSET_CLASS_ASSUMPTIONS.map((assumption) => ({ ...assumption, annualVolatility: 0 }))
    const fund = { id: 'fund', name: 'Fonds', value: 100_000, holding: 'accumulating-equity-fund' as const, returnSeriesId: 'synthetic-equity-assumption-v1' }
    const base = {
      currentAge: 66, retirementAge: 67, planningAge: 68, currentCapital: 100_000,
      monthlyDesiredSpendingToday: 0, monthlyRetirementIncomeToday: 0, monthlyContributionToday: 0,
      annualInflationRate: 0, retirementIncomeStreams: [],
    }
    const noCost = withFullCostBasis(cashOnlyInput({ ...base, estimatorPortfolio: [{ ...fund }] }))
    const withCost = withFullCostBasis(cashOnlyInput({ ...base, estimatorPortfolio: [{ ...fund, annualCostRate: 0.01 }] }))
    const sampledNoCost = runStochasticSimulation(noCost, settings({ simulations: 1, seed: 42 }), zeroVol)
    const sampledCost = runStochasticSimulation(withCost, settings({ simulations: 1, seed: 42 }), zeroVol)
    expect(sampledCost.rows[0].p50CapitalToday).toBeLessThan(sampledNoCost.rows[0].p50CapitalToday)
    expect(sampledCost.rows[1].p50CapitalToday).toBeLessThan(sampledNoCost.rows[1].p50CapitalToday)
    const explicitNoCost = simulateScenarioWithReturnPath(noCost, [], undefined, [
      [{ id: 'fund', totalReturnRate: 0.07 }],
      [{ id: 'fund', totalReturnRate: 0.07 }],
    ])
    const explicitCost = simulateScenarioWithReturnPath(withCost, [], undefined, [
      [{ id: 'fund', totalReturnRate: 0.06 }],
      [{ id: 'fund', totalReturnRate: 0.06 }],
    ])
    expect(sampledNoCost.rows[0].p50CapitalToday).toBeCloseTo(explicitNoCost.rows[0].closingCapitalToday, 8)
    expect(sampledCost.rows[0].p50CapitalToday).toBeCloseTo(explicitCost.rows[0].closingCapitalToday, 8)
  })

  it('keeps gross bank interest taxable while deducting costs from planning-rate bank returns', () => {
    const bank = { id: 'bank', name: 'Bank', value: 100_000, holding: 'ordinary-bank-deposit' as const, returnSeriesId: 'tagesgeld-planzins-v1' }
    const base = {
      currentAge: 66, retirementAge: 67, planningAge: 68, currentCapital: 100_000,
      monthlyDesiredSpendingToday: 0, monthlyRetirementIncomeToday: 0, monthlyContributionToday: 0,
      annualInflationRate: 0, retirementIncomeStreams: [],
    }
    const noCost = cashOnlyInput({ ...base, estimatorPortfolio: [{ ...bank }] })
    const withCost = cashOnlyInput({ ...base, estimatorPortfolio: [{ ...bank, annualCostRate: 0.01 }] })
    const inflationSource = createFixedInflationSource(0)
    const sampledNoCostPath = sampledBucketReturns(
      createPortfolioComponentsFromBuckets(noCost.estimatorPortfolio!),
      inflationSource,
      [0, 1],
      createSeededRandom(42),
      0.02,
    )
    const sampledCostPath = sampledBucketReturns(
      createPortfolioComponentsFromBuckets(withCost.estimatorPortfolio!),
      inflationSource,
      [0, 1],
      createSeededRandom(42),
      0.02,
    )
    expect(sampledNoCostPath[0]?.[0]?.grossBankReturnRate).toBeCloseTo(0.02, 12)
    expect(sampledNoCostPath[0]?.[0]?.totalReturnRate).toBeCloseTo(0.02, 12)
    expect(sampledCostPath[0]?.[0]?.grossBankReturnRate).toBeCloseTo(0.02, 12)
    expect(sampledCostPath[0]?.[0]?.totalReturnRate).toBeCloseTo(0.01, 12)
    const sampledNoCost = simulateScenarioWithReturnPath(noCost, [], undefined, sampledNoCostPath)
    const sampledCost = simulateScenarioWithReturnPath(withCost, [], undefined, sampledCostPath)
    expect(sampledCost.rows[0].closingCapitalToday).toBeLessThan(sampledNoCost.rows[0].closingCapitalToday)
    const explicitNoCost = simulateScenarioWithReturnPath(noCost, [], undefined, [
      [{ id: 'bank', totalReturnRate: 0.02, grossBankReturnRate: 0.02 }],
      [{ id: 'bank', totalReturnRate: 0.02, grossBankReturnRate: 0.02 }],
    ])
    const explicitPreserved = simulateScenarioWithReturnPath(withCost, [], undefined, [
      [{ id: 'bank', totalReturnRate: 0.01, grossBankReturnRate: 0.02 }],
      [{ id: 'bank', totalReturnRate: 0.01, grossBankReturnRate: 0.02 }],
    ])
    expect(sampledNoCost.rows[0].closingCapitalToday).toBeCloseTo(explicitNoCost.rows[0].closingCapitalToday, 8)
    expect(sampledCost.rows[0].closingCapitalToday).toBeCloseTo(explicitPreserved.rows[0].closingCapitalToday, 8)
    expect(explicitPreserved.rows[0].capitalIncomeTax).toBeCloseTo(explicitNoCost.rows[0].capitalIncomeTax ?? 0, 8)
    expect((explicitPreserved.rows[0].capitalIncomeTax ?? 0)).toBeGreaterThan(0)
  })

  it('does not increase success probability when desired spending rises', () => {
    // Paired market paths (same seed → identical sampled returns): higher
    // spending can only deplete each path weakly earlier, so the inequality is
    // exact for any simulation count; 50 paths keep the detailed-ledger run fast.
    const stochasticSettings = settings({ simulations: 50, seed: 456 })
    const lowerSpending = runStochasticSimulation(
      input({ monthlyDesiredSpendingToday: 2_000 }),
      stochasticSettings,
    ).successProbability
    const higherSpending = runStochasticSimulation(
      input({ monthlyDesiredSpendingToday: 4_000 }),
      stochasticSettings,
    ).successProbability

    expect(higherSpending).toBeLessThanOrEqual(lowerSpending)
  })
})
