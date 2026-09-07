import type { RentenlueckeInput, RetirementIncomeStream } from './types'

type AggregateRetirementIncomeInput = Pick<
  RentenlueckeInput,
  'monthlyRetirementIncomeToday' | 'retirementAge'
>

export type AnnualRetirementIncome = {
  gross: number
  deductions: number
  net: number
}

export function calculateRetirementIncomeForYear(
  streams: readonly RetirementIncomeStream[],
  ageStart: number,
  inflationFactor: number,
): AnnualRetirementIncome {
  return streams.reduce<AnnualRetirementIncome>(
    (total, stream) => {
      const isActive = stream.startAge <= ageStart && (stream.endAge === null || ageStart < stream.endAge)
      if (!isActive) return total

      const gross = stream.amountMonthlyToday * 12 * inflationFactor
      const deductionRate = stream.deductionMode === 'effectiveHaircut' ? stream.effectiveDeductionRate : 0
      const deductions = stream.amountBasis === 'gross' ? gross * deductionRate : 0

      total.gross += gross
      total.deductions += deductions
      total.net += stream.amountBasis === 'net' ? gross : gross - deductions
      return total
    },
    { gross: 0, deductions: 0, net: 0 },
  )
}

export function createDefaultRetirementIncomeStreams(
  input: AggregateRetirementIncomeInput,
): RetirementIncomeStream[] {
  return [
    {
      id: 'statutory-pension',
      name: 'Gesetzliche Rente',
      amountMonthlyToday: input.monthlyRetirementIncomeToday,
      startAge: input.retirementAge,
      endAge: null,
      amountBasis: 'gross',
      deductionMode: 'effectiveHaircut',
      effectiveDeductionRate: 0,
    },
  ]
}

export function migrateAggregateRetirementIncomeToStream<T extends AggregateRetirementIncomeInput>(
  input: T & { retirementIncomeStreams?: RetirementIncomeStream[] },
): T & { retirementIncomeStreams: RetirementIncomeStream[] } {
  return {
    ...input,
    retirementIncomeStreams:
      input.retirementIncomeStreams ?? createDefaultRetirementIncomeStreams(input),
  }
}
