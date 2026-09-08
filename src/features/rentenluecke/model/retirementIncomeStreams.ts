import { getInsuranceTreatment, getStreamInsuranceRates, type RetirementInsurance } from './retirementInsurance'
import type { RentenlueckeInput, RetirementIncomeStream } from './types'

type AggregateRetirementIncomeInput = Pick<
  RentenlueckeInput,
  'monthlyRetirementIncomeToday' | 'retirementAge'
>

export type AnnualRetirementIncome = {
  gross: number
  deductions: number
  combinedDeductions: number
  otherDeductions: number
  kv: number
  pv: number
  portfolioBase: number
  net: number
}

export function calculateRetirementIncomeForYear(
  streams: readonly RetirementIncomeStream[],
  ageStart: number,
  inflationFactor: number,
  insurance?: RetirementInsurance,
): AnnualRetirementIncome {
  const total: AnnualRetirementIncome = {
    gross: 0, deductions: 0, combinedDeductions: 0, otherDeductions: 0, kv: 0, pv: 0, portfolioBase: 0, net: 0,
  }
  for (const stream of streams) {
    if (stream.startAge > ageStart || (stream.endAge !== null && ageStart >= stream.endAge)) continue
    const gross = stream.amountMonthlyToday * 12 * inflationFactor
    total.gross += gross
    if (stream.amountBasis === 'net') {
      total.net += gross
      continue
    }
    let deductions: number

    if (insurance?.enabled && stream.separateDeductions) {
      deductions = gross * stream.separateDeductions.otherRate
      total.otherDeductions += deductions
      if (getInsuranceTreatment(stream, insurance.status) === 'include') {
        const rates = getStreamInsuranceRates(stream, insurance.rates)
        const kv = gross * rates.kv
        const pv = gross * rates.pv
        total.kv += kv
        total.pv += pv
        deductions += kv + pv
      }
    } else {
      // Never reinterpret an unreviewed all-in haircut as OTHER deductions.
      deductions = gross * (stream.deductionMode === 'effectiveHaircut' ? stream.effectiveDeductionRate : 0)
      total.combinedDeductions += deductions
    }
    total.net += gross - deductions
  }
  if (insurance?.enabled) {
    total.portfolioBase = insurance.portfolioBaseMonthlyToday * 12 * inflationFactor
    const kv = total.portfolioBase * insurance.rates.passiveKv
    const pv = total.portfolioBase * insurance.rates.pv
    total.kv += kv
    total.pv += pv
    total.net -= kv + pv
  }
  total.deductions = total.combinedDeductions + total.otherDeductions + total.kv + total.pv
  // Negative spendable cashflow funds costs above income; do not clamp before computing the gap.
  return total
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
