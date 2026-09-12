import { activeIncomeStreams, contributionForYear, type CompleteContribution } from './retirementInsurance'
import type { RentenlueckeInput, RetirementIncomeStream } from './types'
type AggregateRetirementIncomeInput = Pick<RentenlueckeInput, 'monthlyRetirementIncomeToday' | 'retirementAge'>
export type AnnualRetirementIncome = {
  gross: number; deductions: number; otherDeductions: number; kv: number; pv: number; portfolioBase: number; net: number; insurance: CompleteContribution
}
export function calculateRetirementIncomeForYear(input: RentenlueckeInput, age: number, inflation: number, annualCapitalAssessment?: number): AnnualRetirementIncome {
  let gross = 0, otherDeductions = 0
  for (const s of activeIncomeStreams(input.retirementIncomeStreams ?? [], age)) {
    const amount = s.amountMonthlyToday * 12 * inflation
    gross += amount
    if (s.amountBasis === 'gross') otherDeductions += amount * (s.deductionMode === 'effectiveHaircut' ? s.effectiveDeductionRate : 0)
  }
  const insurance = contributionForYear(input, age, inflation, (gross - otherDeductions) / 12, annualCapitalAssessment)
  const kv = insurance.ownKvMonthly * 12, pv = insurance.ownPvMonthly * 12
  const phase = input.retirementInsurance![insurance.phase]
  const portfolioBase = insurance.status === 'automatic' && insurance.effectiveStatus === 'voluntary' ? (annualCapitalAssessment ?? phase.capitalMonthlyToday! * 12 * inflation) : 0
  return { gross, otherDeductions, kv, pv, portfolioBase, deductions: otherDeductions + kv + pv, net: insurance.availableIncomeMonthly * 12, insurance }
}

export function createDefaultRetirementIncomeStreams(
  input: AggregateRetirementIncomeInput,
): RetirementIncomeStream[] {
  return [
    {
      id: 'statutory-pension',
      name: 'Gesetzliche Rente',
      kind: 'gesetzliche-rente',
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

export function normalizeRetirementIncomeStreamKinds(
  streams: readonly RetirementIncomeStream[],
): RetirementIncomeStream[] {
  return streams.map((stream) => ({
    ...stream,
    kind: stream.kind ?? (stream.id === 'statutory-pension' ? 'gesetzliche-rente' : 'other'),
  }))
}
