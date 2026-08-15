import { describe, expect, it } from 'vitest'
import type { StochasticPercentileRow } from '../../model/stochasticReturns'
import type { SimulationResult, YearlyPeriodRow } from '../../model/types'
import {
  buildDisplayRows,
  buildRiskChips,
  buildScenarioOutcomeRows,
  calculateCapitalDisplayCap,
  isCapitalDisplayCapped,
  type ScenarioOutcomeChartRow,
} from '../scenarioOutcomeData'

function chartRow(overrides: Partial<ScenarioOutcomeChartRow> = {}): ScenarioOutcomeChartRow {
  return {
    ageStart: 64,
    ageEnd: 65,
    planCapitalToday: 100_000,
    p10CapitalToday: 80_000,
    p50CapitalToday: 100_000,
    p90CapitalToday: 120_000,
    p10ToP90CapitalToday: [80_000, 120_000],
    survivalProbabilityEnd: 0.5,
    depletionProbability: 0.1,
    ...overrides,
  }
}

function yearlyRow(overrides: Partial<YearlyPeriodRow> = {}): YearlyPeriodRow {
  return {
    yearIndex: 0,
    ageStart: 64,
    ageEnd: 65,
    phase: 'retirement',
    inflationFactor: 1,
    nominalReturnRate: 0,
    openingCapital: 100_000,
    investmentReturn: 0,
    capitalBeforeCashflow: 100_000,
    contribution: 0,
    desiredSpending: 0,
    retirementIncome: 0,
    gapWithdrawal: 0,
    closingCapital: 100_000,
    closingCapitalToday: 100_000,
    depleted: false,
    unfundedWithdrawal: 0,
    ...overrides,
  }
}

function result(rows: YearlyPeriodRow[]): SimulationResult {
  return {
    rows,
    accumulationRows: [],
    retirementRows: rows,
    summary: {
      annualGapToday: 0,
      monthlyGapToday: 0,
      projectedCapitalAtRetirement: 0,
      requiredCapitalAtRetirement: 0,
      capitalShortfallAtRetirement: 0,
      capitalSurplusAtRetirement: 0,
      depletionAge: null,
      depletionAgeEnd: null,
      survivesUntilPlanningAge: true,
    },
  }
}

describe('scenario outcome chart data', () => {
  it('selects the first row at or below each survival threshold', () => {
    const chips = buildRiskChips([
      chartRow({ ageEnd: 70, survivalProbabilityEnd: 0.21, depletionProbability: 0.1 }),
      chartRow({ ageEnd: 71, survivalProbabilityEnd: 0.2, depletionProbability: 0.2 }),
      chartRow({ ageEnd: 72, survivalProbabilityEnd: 0.09, depletionProbability: 0.3 }),
      chartRow({ ageEnd: 73, survivalProbabilityEnd: 0.04, depletionProbability: 0.4 }),
      chartRow({ ageEnd: 74, survivalProbabilityEnd: 0.02, depletionProbability: 0.5 }),
    ])

    expect(chips.map((chip) => [chip.key, chip.ageEnd, chip.depletionProbability])).toEqual([
      ['survival-20', 71, 0.2],
      ['survival-10', 72, 0.3],
      ['survival-5', 73, 0.4],
      ['planning-horizon', 74, 0.5],
    ])
  })

  it('adds a planning horizon chip unless that age was already selected', () => {
    expect(
      buildRiskChips([
        chartRow({ ageEnd: 70, survivalProbabilityEnd: 0.3 }),
        chartRow({ ageEnd: 71, survivalProbabilityEnd: 0.25 }),
      ]).map((chip) => chip.key),
    ).toEqual(['planning-horizon'])

    expect(
      buildRiskChips([
        chartRow({ ageEnd: 70, survivalProbabilityEnd: 0.3 }),
        chartRow({ ageEnd: 71, survivalProbabilityEnd: 0.2 }),
      ]).map((chip) => chip.key),
    ).toEqual(['survival-20'])
  })

  it('dedupes duplicate threshold ages', () => {
    const chips = buildRiskChips([
      chartRow({ ageEnd: 90, survivalProbabilityEnd: 0.2 }),
      chartRow({ ageEnd: 91, survivalProbabilityEnd: 0.04 }),
    ])

    expect(chips.map((chip) => [chip.key, chip.ageEnd])).toEqual([
      ['survival-20', 90],
      ['survival-10', 91],
    ])
  })

  it('falls back to plan rows when stochastic rows are absent or short', () => {
    const rows = [
      yearlyRow({ ageStart: 64, ageEnd: 65, closingCapitalToday: 100_000 }),
      yearlyRow({ ageStart: 65, ageEnd: 66, closingCapitalToday: 90_000, depleted: true }),
    ]
    const stochasticRows: StochasticPercentileRow[] = [
      {
        ageStart: 64,
        ageEnd: 65,
        planCapitalToday: 101_100.4,
        p10CapitalToday: 70_200.2,
        p50CapitalToday: 99_999.6,
        p90CapitalToday: 130_400.5,
        depletionProbability: 0.25,
      },
    ]

    const [stochasticRow, fallbackRow] = buildScenarioOutcomeRows(result(rows), stochasticRows, 'conservative')
    const [absentFallbackRow] = buildScenarioOutcomeRows(result([rows[0]]), [], 'conservative')

    expect(stochasticRow).toMatchObject({
      planCapitalToday: 101_100,
      p10CapitalToday: 70_200,
      p50CapitalToday: 100_000,
      p90CapitalToday: 130_401,
      depletionProbability: 0.25,
    })
    expect(fallbackRow).toMatchObject({
      planCapitalToday: 90_000,
      p10CapitalToday: 90_000,
      p50CapitalToday: 90_000,
      p90CapitalToday: 90_000,
      p10ToP90CapitalToday: [90_000, 90_000],
      depletionProbability: 1,
    })
    expect(absentFallbackRow.p50CapitalToday).toBe(100_000)
  })

  it('pins zero and negative chart values to 1 for log scale without mutating true values', () => {
    const [row] = buildDisplayRows(
      [
        chartRow({
          planCapitalToday: -10,
          p10CapitalToday: -5,
          p50CapitalToday: 0,
          p90CapitalToday: 2,
          p10ToP90CapitalToday: [-5, 2],
        }),
      ],
      true,
      1_000,
    )

    expect(row).toMatchObject({
      planCapitalToday: -10,
      p10CapitalToday: -5,
      p50CapitalToday: 0,
      p90CapitalToday: 2,
      chartPlanCapitalToday: 1,
      chartP10CapitalToday: 1,
      chartP50CapitalToday: 1,
      chartP90CapitalToday: 2,
      chartP10ToP90CapitalToday: [1, 2],
    })
  })

  it('caps only chart-rendered capital values at the capital display cap', () => {
    const sourceRow = chartRow({
      planCapitalToday: 200,
      p10CapitalToday: 50,
      p50CapitalToday: 150,
      p90CapitalToday: 500,
      p10ToP90CapitalToday: [50, 500],
    })
    const [displayRow] = buildDisplayRows([sourceRow], false, 250)

    expect(displayRow.p90CapitalToday).toBe(500)
    expect(displayRow.chartP90CapitalToday).toBe(250)
    expect(displayRow.chartP10ToP90CapitalToday).toEqual([50, 250])
    expect(sourceRow.p90CapitalToday).toBe(500)
  })

  it('derives cap state from plan capital while detecting capped chart values', () => {
    const rows = [
      chartRow({ planCapitalToday: 100, p10CapitalToday: 50, p50CapitalToday: 100, p90CapitalToday: 250 }),
    ]
    const cap = calculateCapitalDisplayCap(rows)

    expect(cap).toBe(200)
    expect(isCapitalDisplayCapped(rows, cap)).toBe(true)
  })
})
