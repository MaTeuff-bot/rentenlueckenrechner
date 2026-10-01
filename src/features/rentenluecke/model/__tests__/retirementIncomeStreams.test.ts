import { describe, expect, it } from 'vitest'
import { cashOnlyInput, withFullCostBasis, zeroBucketPath } from './insuranceFixtures'
import { simulateScenarioWithReturnPath } from '../stochasticReturns'
import {
  calculateRetirementIncomeForYear,
  createDefaultRetirementIncomeStreams,
  migrateAggregateRetirementIncomeToStream,
} from '../retirementIncomeStreams'
import type { RentenlueckeInput, RetirementIncomeStream } from '../types'

function stream(overrides: Partial<RetirementIncomeStream> = {}): RetirementIncomeStream {
  return {
    id: 'pension',
    name: 'Pension',
    amountMonthlyToday: 2_000,
    startAge: 67,
    endAge: null,
    amountBasis: 'gross',
    deductionMode: 'effectiveHaircut',
    effectiveDeductionRate: 0,
    ...overrides,
  }
}

function input(overrides: Partial<RentenlueckeInput> = {}): RentenlueckeInput {
  // Full cost basis plus explicitly modeled zero returns keep the historical
  // 0 %-return hand numbers honest: no gains, interest or Vorabpauschale arise,
  // so no Kapitalertragsteuer is assessed on the mandatory detailed ledger.
  return withFullCostBasis(cashOnlyInput({
    currentAge: 67,
    retirementAge: 67,
    planningAge: 70,
    currentCapital: 100_000,
    monthlyDesiredSpendingToday: 2_000,
    monthlyRetirementIncomeToday: 2_000,
    annualInflationRate: 0,
    annualReturnBeforeRetirement: 0,
    annualReturnInRetirement: 0,
    ...overrides,
  }))
}

function zeroPathResult(scenarioInput: RentenlueckeInput) {
  return simulateScenarioWithReturnPath(scenarioInput, [], undefined,
    zeroBucketPath(scenarioInput, scenarioInput.planningAge - scenarioInput.currentAge))
}

describe('retirement income streams', () => {
  it('creates and migrates the legacy aggregate as a zero-haircut gross pension', () => {
    const legacyInput = input({ retirementIncomeStreams: undefined })
    const expected = createDefaultRetirementIncomeStreams(legacyInput)

    expect(expected).toEqual([
      expect.objectContaining({
        id: 'statutory-pension',
        kind: 'gesetzliche-rente',
        support: 'standard',
        amountMonthlyToday: 2_000,
        startAge: 67,
        amountBasis: 'gross',
        effectiveDeductionRate: 0,
      }),
    ])
    expect(migrateAggregateRetirementIncomeToStream(legacyInput).retirementIncomeStreams).toEqual(expected)
  })

  it('preserves legacy simulation results when streams are omitted or use the default zero haircut', () => {
    const legacyInput = input({ monthlyDesiredSpendingToday: 3_000 })
    const legacy = zeroPathResult(legacyInput)
    const withDefaultStream = zeroPathResult({
      ...legacyInput,
      retirementIncomeStreams: createDefaultRetirementIncomeStreams(legacyInput),
    })

    expect(withDefaultStream.summary).toEqual(legacy.summary)
    expect(withDefaultStream.rows).toEqual(legacy.rows)
  })

  it('deducts a gross-stream haircut and increases gap withdrawals', () => {
    const result = zeroPathResult(
      input({ retirementIncomeStreams: [stream({ effectiveDeductionRate: 0.1 })] }),
    )
    const [row] = result.retirementRows

    expect(row.retirementIncomeGross).toBe(24_000)
    expect(row.retirementIncomeDeductions).toBe(2_400)
    expect(row.retirementIncomeNet).toBe(21_600)
    expect(row.retirementIncome).toBe(row.retirementIncomeNet)
    expect(row.gapWithdrawal).toBe(2_400)
    // 3 × 2,400 at modeled zero returns with no capital tax, within the ledger
    // search's €1 stop epsilon.
    const required = result.summary.requiredCapitalAtRetirement
    expect(required).toBeGreaterThanOrEqual(7_200)
    expect(required).toBeLessThanOrEqual(7_201)
  })

  it('ignores haircut settings for a net stream', () => {
    const income = calculateRetirementIncomeForYear(
      input({ retirementIncomeStreams: [stream({ amountBasis: 'net', effectiveDeductionRate: 0.5 })] }),
      67,
      1.1,
    )

    expect(income.gross).toBeCloseTo(26_400)
    expect(income.deductions).toBe(0)
    expect(income.net).toBeCloseTo(26_400)
  })

  it('includes a stream from startAge and excludes it at endAge', () => {
    const result = zeroPathResult(
      input({
        planningAge: 71,
        retirementIncomeStreams: [stream({ startAge: 68, endAge: 70 })],
      }),
    )

    expect(result.retirementRows.map((row) => row.retirementIncomeNet)).toEqual([0, 24_000, 24_000, 0])
    expect(result.retirementRows.map((row) => row.gapWithdrawal)).toEqual([24_000, 0, 0, 24_000])
  })

  it('reports consumed surplus without adding it to portfolio capital', () => {
    const result = zeroPathResult(
      input({
        planningAge: 68,
        retirementIncomeStreams: [stream({ amountMonthlyToday: 3_000 })],
      }),
    )
    const [row] = result.retirementRows

    expect(row.surplusIncome).toBe(12_000)
    expect(row.gapWithdrawal).toBe(0)
    expect(row.closingCapital).toBe(row.openingCapital)
  })

  it('uses net rather than gross stream income in required-capital search', () => {
    // Zero-start blocks every forecast; both searches open with a positive
    // allocation on the mandatory detailed ledger at modeled zero returns.
    const gross = zeroPathResult(
      input({
        retirementIncomeStreams: [stream({ effectiveDeductionRate: 0.25 })],
      }),
    )
    const net = zeroPathResult(
      input({
        retirementIncomeStreams: [stream({ amountBasis: 'net', effectiveDeductionRate: 0.25 })],
      }),
    )

    // 3 × 6,000 gap at modeled zero returns with no capital tax, within the
    // ledger search's €1 stop epsilon; the net stream leaves no gap at all.
    const required = gross.summary.requiredCapitalAtRetirement
    expect(required).toBeGreaterThanOrEqual(18_000)
    expect(required).toBeLessThanOrEqual(18_001)
    expect(net.summary.requiredCapitalAtRetirement).toBe(0)
  })
})
