import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { DEFAULT_INPUT } from '../defaults'
import { rentenlueckeInputSchema } from '../inputSchema'
import { normalizeInput } from '../normalizeInput'
import { simulateAccumulationRows } from '../simulateAccumulation'
import { simulateRetirementRows } from '../simulateRetirement'
import { simulateScenario } from '../simulateScenario'
import type { RentenlueckeInput } from '../types'

function input(overrides: Partial<RentenlueckeInput> = {}): RentenlueckeInput {
  return { ...DEFAULT_INPUT, ...overrides }
}

describe('Rentenluecke model', () => {
  it('returns zero required capital, monthly gap, and withdrawals when there is no gap', () => {
    const result = simulateScenario(
      input({
        currentCapital: 10_000,
        monthlyDesiredSpendingToday: 1_800,
        monthlyRetirementIncomeToday: 2_000,
      }),
    )

    expect(result.summary.requiredCapitalAtRetirement).toBe(0)
    expect(result.summary.monthlyGapToday).toBe(0)
    expect(result.retirementRows.every((row) => row.gapWithdrawal === 0)).toBe(true)
  })

  it('uses annual gap times retirement years as required capital with no return and no inflation', () => {
    const result = simulateScenario(
      input({
        retirementAge: 67,
        planningAge: 70,
        monthlyDesiredSpendingToday: 3_000,
        monthlyRetirementIncomeToday: 2_000,
        annualInflationRate: 0,
        annualReturnInRetirement: 0,
      }),
    )

    expect(result.summary.requiredCapitalAtRetirement).toBeCloseTo(36_000, 0)
  })

  it('applies accumulation return before adding the end-of-year contribution', () => {
    const scenario = normalizeInput(
      input({
        currentAge: 40,
        retirementAge: 41,
        currentCapital: 100,
        monthlyContributionToday: 10,
        annualInflationRate: 0,
        annualReturnBeforeRetirement: 0.1,
      }),
    )
    const [row] = simulateAccumulationRows(scenario)

    expect(row.investmentReturn).toBe(10)
    expect(row.capitalBeforeCashflow).toBe(110)
    expect(row.contribution).toBe(120)
    expect(row.closingCapital).toBe(230)
  })

  it('applies retirement return before taking the end-of-year withdrawal', () => {
    const scenario = normalizeInput(
      input({
        currentAge: 67,
        retirementAge: 67,
        planningAge: 68,
        monthlyDesiredSpendingToday: 100,
        monthlyRetirementIncomeToday: 0,
        annualInflationRate: 0,
        annualReturnInRetirement: 0.1,
      }),
    )
    const [row] = simulateRetirementRows(scenario, 1_000)

    expect(row.investmentReturn).toBe(100)
    expect(row.capitalBeforeCashflow).toBe(1_100)
    expect(row.gapWithdrawal).toBe(1_200)
    expect(row.depleted).toBe(true)
    expect(row.closingCapital).toBe(0)
  })

  it('uses global years-to-retirement inflation for the first retirement row', () => {
    const scenario = normalizeInput(
      input({
        currentAge: 60,
        retirementAge: 67,
        planningAge: 68,
        monthlyDesiredSpendingToday: 3_000,
        monthlyRetirementIncomeToday: 1_800,
        annualInflationRate: 0.02,
      }),
    )
    const [row] = simulateRetirementRows(scenario, 1_000_000)

    expect(row.yearIndex).toBe(7)
    expect(row.gapWithdrawal).toBeCloseTo(14_400 * 1.02 ** 7)
  })

  it('inflates contributions with yearIndex 0 for the first row and 1 for the second row', () => {
    const scenario = normalizeInput(
      input({
        currentAge: 40,
        retirementAge: 42,
        monthlyContributionToday: 100,
        annualInflationRate: 0.02,
        annualReturnBeforeRetirement: 0,
      }),
    )
    const rows = simulateAccumulationRows(scenario)

    expect(rows[0].contribution).toBeCloseTo(1_200)
    expect(rows[1].contribution).toBeCloseTo(1_200 * 1.02)
  })

  it('marks depletion and clamps closing capital when capital is insufficient', () => {
    const scenario = normalizeInput(
      input({
        currentAge: 67,
        retirementAge: 67,
        planningAge: 68,
        monthlyDesiredSpendingToday: 100,
        monthlyRetirementIncomeToday: 0,
        annualInflationRate: 0,
        annualReturnInRetirement: 0,
      }),
    )
    const [row] = simulateRetirementRows(scenario, 1_000)

    expect(row.depleted).toBe(true)
    expect(row.unfundedWithdrawal).toBe(200)
    expect(row.closingCapital).toBe(0)
  })

  it('treats exact zero at the final row as success', () => {
    const scenario = normalizeInput(
      input({
        currentAge: 67,
        retirementAge: 67,
        planningAge: 68,
        monthlyDesiredSpendingToday: 100,
        monthlyRetirementIncomeToday: 0,
        annualInflationRate: 0,
        annualReturnInRetirement: 0,
      }),
    )
    const [row] = simulateRetirementRows(scenario, 1_200)

    expect(row.closingCapital).toBe(0)
    expect(row.depleted).toBe(false)
  })

  it('uses current capital as projected retirement capital for immediate retirement', () => {
    const result = simulateScenario(
      input({
        currentAge: 67,
        retirementAge: 67,
        planningAge: 68,
        currentCapital: 123_456,
      }),
    )

    expect(result.accumulationRows).toHaveLength(0)
    expect(result.summary.projectedCapitalAtRetirement).toBe(123_456)
  })

  it('ignores retirement income surplus instead of adding it to capital', () => {
    const scenario = normalizeInput(
      input({
        currentAge: 67,
        retirementAge: 67,
        planningAge: 68,
        monthlyDesiredSpendingToday: 100,
        monthlyRetirementIncomeToday: 200,
        annualInflationRate: 0,
        annualReturnInRetirement: 0,
      }),
    )
    const [row] = simulateRetirementRows(scenario, 1_000)

    expect(row.gapWithdrawal).toBe(0)
    expect(row.closingCapital).toBe(1_000)
  })

  it('creates retirement intervals through the planning age', () => {
    const result = simulateScenario(input({ retirementAge: 67, planningAge: 90 }))

    expect(result.retirementRows).toHaveLength(23)
    expect(result.retirementRows.at(-1)?.ageStart).toBe(89)
    expect(result.retirementRows.at(-1)?.ageEnd).toBe(90)
  })

  it('keeps rates as decimal units internally', () => {
    const scenario = normalizeInput(input({ annualInflationRate: 0.02 }))

    expect(scenario.annualInflationRate).toBe(0.02)
    expect(rentenlueckeInputSchema.safeParse(input({ annualInflationRate: 2 })).success).toBe(false)
  })

  it('rejects invalid ages, negative money, and out-of-range rates', () => {
    const cases = [
      input({ currentAge: 40.5 }),
      input({ retirementAge: 39 }),
      input({ planningAge: 67, retirementAge: 67 }),
      input({ currentCapital: -1 }),
      input({ monthlyContributionToday: -1 }),
      input({ annualInflationRate: 0.21 }),
      input({ annualReturnBeforeRetirement: -0.51 }),
      input({ annualReturnInRetirement: 0.51 }),
    ]

    for (const invalidInput of cases) {
      expect(() => rentenlueckeInputSchema.parse(invalidInput)).toThrow(z.ZodError)
    }
  })
})
