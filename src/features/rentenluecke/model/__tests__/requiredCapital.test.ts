import { describe, expect, it } from 'vitest'
import { cashOnlyInput, withFullCostBasis, zeroBucketPath } from './insuranceFixtures'
const DEFAULT_INPUT = cashOnlyInput()
import { normalizeInput } from '../normalizeInput'
import { calculateRequiredCapitalAtRetirement } from '../requiredCapital'
import { simulateRetirementRows } from '../simulateRetirement'
import { simulateScenario } from '../simulateScenario'
import { simulateScenarioWithReturnPath } from '../stochasticReturns'

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
describe('detailed-ledger required capital', () => {
  function zeroPathResult(scenarioInput: ReturnType<typeof cashOnlyInput>) {
    return simulateScenarioWithReturnPath(scenarioInput, [], undefined,
      zeroBucketPath(scenarioInput, scenarioInput.planningAge - scenarioInput.currentAge))
  }

  it('requires positive capital for positive unsupported gaps (never a blind zero)', () => {
    // No income, no insurance, no capital tax at modeled zero returns with a
    // full cost basis: 3 × 24,000 gap. The search evaluates candidate(0) and
    // finds it depleting, so the result sits at the nominal sum (€1 epsilon).
    const input = withFullCostBasis(cashOnlyInput({ currentAge: 67, retirementAge: 67,
      planningAge: 70, currentCapital: 50_000, monthlyDesiredSpendingToday: 2_000,
      monthlyRetirementIncomeToday: 0, annualInflationRate: 0 }))
    const required = zeroPathResult(input).summary.requiredCapitalAtRetirement
    expect(required).toBeGreaterThan(0)
    expect(required).toBeGreaterThanOrEqual(72_000)
    expect(required).toBeLessThanOrEqual(72_001)
  })

  it('requires nothing when the pension covers spending (candidate(0) survives)', () => {
    // 24,000 GRV gross against 12,000 desired spending: the gap is zero every
    // year, so the evaluated zero trial survives and the search returns 0.
    const input = withFullCostBasis(cashOnlyInput({ currentAge: 67, retirementAge: 67,
      planningAge: 70, currentCapital: 50_000, monthlyDesiredSpendingToday: 1_000,
      monthlyRetirementIncomeToday: 2_000, annualInflationRate: 0 }))
    const result = zeroPathResult(input)
    expect(result.retirementRows.every(row => row.gapWithdrawal === 0)).toBe(true)
    expect(result.summary.requiredCapitalAtRetirement).toBe(0)
    expect(result.summary.survivesUntilPlanningAge).toBe(true)
  })

  it('blocks zero-start searches instead of returning a capital number', () => {
    // An actually zero opening allocation is unsupported input: the guard throws
    // before any candidate search runs, never a blind 0.
    const input = cashOnlyInput({ currentAge: 67, retirementAge: 67, planningAge: 70,
      currentCapital: 0, monthlyDesiredSpendingToday: 2_000,
      monthlyRetirementIncomeToday: 0, annualInflationRate: 0 })
    expect(() => simulateScenario(input)).toThrow(/positive Ausgangsallokation/)
  })
})
