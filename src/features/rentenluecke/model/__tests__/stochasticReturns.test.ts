import { describe, expect, it } from 'vitest'
import { DEFAULT_INPUT } from '../defaults'
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

function input(overrides: Partial<RentenlueckeInput> = {}): RentenlueckeInput {
  return { ...DEFAULT_INPUT, ...overrides }
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
    const deterministicResult = simulateScenario(scenarioInput)
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
    const result = simulateScenarioWithReturnPath(scenarioInput, [0, 0, 0])

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
    const result = simulateScenarioWithReturnPath(scenarioInput, [0])

    expect(result.rows[0].closingCapitalToday).toBe(0)
    expect(result.summary.survivesUntilPlanningAge).toBe(true)
  })

  it('does not increase success probability when desired spending rises', () => {
    const stochasticSettings = settings({ simulations: 200, seed: 456 })
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
