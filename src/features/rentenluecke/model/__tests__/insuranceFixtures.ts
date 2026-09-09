import { DEFAULT_INPUT } from '../defaults'
import { createDefaultRetirementIncomeStreams } from '../retirementIncomeStreams'
import { createDefaultRetirementInsurance, earliestPensionAge, type RetirementInsurance } from '../retirementInsurance'
import type { RentenlueckeInput, RetirementIncomeStream } from '../types'

export function pension(patch: Partial<RetirementIncomeStream> = {}): RetirementIncomeStream {
  return { id: 'pension', name: 'Pension', kind: 'gesetzliche-rente', amountMonthlyToday: 2000,
    startAge: 67, endAge: null, amountBasis: 'gross', deductionMode: 'effectiveHaircut', effectiveDeductionRate: 0,
    support: 'standard', ...patch }
}
export function automaticInsurance(patch: Partial<RetirementInsurance> = {}): RetirementInsurance {
  return { ...createDefaultRetirementInsurance(67), referenceYear: 2026, insurerAdditionalRate: 0.029,
    isParent: true, childrenConfirmed: true,
    pension: { status: 'kvdr', circumstances: 'standard' },
    bridge: { status: 'voluntary', circumstances: 'standard', capitalMonthlyToday: 0 }, ...patch }
}
export function insuredInput(patch: Partial<RentenlueckeInput> = {}): RentenlueckeInput {
  return { ...DEFAULT_INPUT, currentAge: 67, retirementAge: 67, planningAge: 70, currentCapital: 100_000,
    annualInflationRate: 0, annualReturnBeforeRetirement: 0, annualReturnInRetirement: 0,
    monthlyDesiredSpendingToday: 2000, retirementIncomeStreams: [pension()], retirementInsurance: automaticInsurance(), ...patch }
}
// Explicit zero own contributions isolate unrelated cashflow/return tests. These
// are test assumptions, never defaults or inferred answers in the product.
export function cashOnlyInput(patch: Partial<RentenlueckeInput> = {}): RentenlueckeInput {
  const input = { ...DEFAULT_INPUT, ...patch }
  const streams = input.retirementIncomeStreams ?? createDefaultRetirementIncomeStreams(input)
  return { ...input, retirementIncomeStreams: streams, retirementInsurance: input.retirementInsurance ?? {
    ...createDefaultRetirementInsurance(earliestPensionAge(streams) ?? input.retirementAge), referenceYear: 2026,
    bridge: { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 },
    pension: { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 },
  } }
}
