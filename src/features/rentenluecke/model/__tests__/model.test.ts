import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { cashOnlyInput } from './insuranceFixtures'
import { rentenlueckeInputSchema } from '../inputSchema'
import { normalizeInput } from '../normalizeInput'
import { simulateAccumulationRows } from '../simulateAccumulation'
import { simulateRetirementRows } from '../simulateRetirement'
import { simulateScenario } from '../simulateScenario'
import type { RentenlueckeInput } from '../types'

function input(overrides: Partial<RentenlueckeInput> = {}): RentenlueckeInput {
  return cashOnlyInput(overrides)
}

describe('Rentenluecke model', () => {
  it('funds the GRV-Rentensteuer from a pre-tax surplus before reporting a gap', () => {
    // 2,000/mo GRV pension covers 1,800/mo desired spending pre-tax, but the
    // Rentenbesteuerung (slice 2) applies: the inflated pension (2 % default
    // inflation over 27 years, 97.5 % Besteuerungsanteil for Rentenbeginn 2053)
    // owes 4,105.06 pension tax against a 4,096.53 pre-tax surplus, leaving a
    // small first-year gap of 8.53. Required capital funds that net gap.
    const result = simulateScenario(
      input({
        currentCapital: 10_000,
        monthlyDesiredSpendingToday: 1_800,
        monthlyRetirementIncomeToday: 2_000,
      }),
    )

    const first = result.retirementRows[0]
    expect(first.pensionIncomeTax).toBeCloseTo(4105.061976321859, 8)
    expect(first.gapWithdrawal).toBeCloseTo(8.534432383203239, 8)
    expect(result.summary.requiredCapitalAtRetirement).toBeCloseTo(1132.1350429656745, 8)
    expect(result.summary.monthlyGapToday).toBeCloseTo(5 / 12, 8)
    expect(result.retirementRows.every((row) => row.gapWithdrawal === 0)).toBe(false)
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

    // Slice 2: the 24,000 GRV pension (Rentenbeginn 2053 → 97.5 %) owes 2,405/yr
    // GRV-Rentensteuer, so each year's gap is 12,000 + 2,405 = 14,405 and the
    // required capital is 3 × 14,405 = 43,215 (the gap is net of ALL deductions).
    expect(result.summary.requiredCapitalAtRetirement).toBeCloseTo(43_215, 0)
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
    // Slice 2: the pre-tax gap 14,400 × 1.02⁷ grows by the GRV-Rentensteuer on the
    // inflated pension (Rentenbeginn 2033 → 87.5 %; tier-3 pin for the taxed gap).
    expect(row.gapWithdrawal).toBeCloseTo(18006.796526070113, 8)
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
