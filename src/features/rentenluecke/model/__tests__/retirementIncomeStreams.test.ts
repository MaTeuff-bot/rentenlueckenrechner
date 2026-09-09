import { describe, expect, it } from 'vitest'
import { cashOnlyInput } from './insuranceFixtures'
import {
  calculateRetirementIncomeForYear,
  createDefaultRetirementIncomeStreams,
  migrateAggregateRetirementIncomeToStream,
} from '../retirementIncomeStreams'
import { simulateScenario } from '../simulateScenario'
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
  return cashOnlyInput({
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
  })
}

describe('retirement income streams', () => {
  it('creates and migrates the legacy aggregate as a zero-haircut gross pension', () => {
    const legacyInput = input({ retirementIncomeStreams: undefined })
    const expected = createDefaultRetirementIncomeStreams(legacyInput)

    expect(expected).toEqual([
      expect.objectContaining({
        id: 'statutory-pension',
        kind: 'gesetzliche-rente',
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
    const legacy = simulateScenario(legacyInput)
    const withDefaultStream = simulateScenario({
      ...legacyInput,
      retirementIncomeStreams: createDefaultRetirementIncomeStreams(legacyInput),
    })

    expect(withDefaultStream.summary).toEqual(legacy.summary)
    expect(withDefaultStream.rows).toEqual(legacy.rows)
  })

  it('deducts a gross-stream haircut and increases gap withdrawals', () => {
    const result = simulateScenario(
      input({ retirementIncomeStreams: [stream({ effectiveDeductionRate: 0.1 })] }),
    )
    const [row] = result.retirementRows

    expect(row.retirementIncomeGross).toBe(24_000)
    expect(row.retirementIncomeDeductions).toBe(2_400)
    expect(row.retirementIncomeNet).toBe(21_600)
    expect(row.retirementIncome).toBe(row.retirementIncomeNet)
    expect(row.gapWithdrawal).toBe(2_400)
    expect(result.summary.requiredCapitalAtRetirement).toBeCloseTo(7_200, 0)
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
    const result = simulateScenario(
      input({
        planningAge: 71,
        retirementIncomeStreams: [stream({ startAge: 68, endAge: 70 })],
      }),
    )

    expect(result.retirementRows.map((row) => row.retirementIncomeNet)).toEqual([0, 24_000, 24_000, 0])
    expect(result.retirementRows.map((row) => row.gapWithdrawal)).toEqual([24_000, 0, 0, 24_000])
  })

  it('reports consumed surplus without adding it to portfolio capital', () => {
    const result = simulateScenario(
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
    const gross = simulateScenario(
      input({
        currentCapital: 0,
        retirementIncomeStreams: [stream({ effectiveDeductionRate: 0.25 })],
      }),
    )
    const net = simulateScenario(
      input({
        currentCapital: 0,
        retirementIncomeStreams: [stream({ amountBasis: 'net', effectiveDeductionRate: 0.25 })],
      }),
    )

    expect(gross.summary.requiredCapitalAtRetirement).toBeCloseTo(18_000, 0)
    expect(net.summary.requiredCapitalAtRetirement).toBe(0)
  })
})
