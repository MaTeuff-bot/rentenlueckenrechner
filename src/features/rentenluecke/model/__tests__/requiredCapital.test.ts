import { describe, expect, it } from 'vitest'
import { DEFAULT_INPUT } from '../defaults'
import { normalizeInput } from '../normalizeInput'
import { calculateRequiredCapitalAtRetirement } from '../requiredCapital'
import { simulateRetirementRows } from '../simulateRetirement'

describe('required capital binary search', () => {
  it('returns capital that survives while a materially lower value fails', () => {
    const scenario = normalizeInput({
      ...DEFAULT_INPUT,
      currentAge: 60,
      retirementAge: 67,
      planningAge: 90,
      monthlyDesiredSpendingToday: 3_000,
      monthlyRetirementIncomeToday: 1_800,
      annualInflationRate: 0.02,
      annualReturnInRetirement: 0.03,
    })

    const requiredCapital = calculateRequiredCapitalAtRetirement(scenario)
    const survivingRows = simulateRetirementRows(scenario, requiredCapital)
    const failingRows = simulateRetirementRows(scenario, Math.max(0, requiredCapital - 100))

    expect(survivingRows.every((row) => !row.depleted)).toBe(true)
    expect(failingRows.some((row) => row.depleted)).toBe(true)
  })
})
