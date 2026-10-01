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
    bridge: { status: 'voluntary', circumstances: 'standard' }, ...patch }
}
export function insuredInput(patch: Partial<RentenlueckeInput> = {}): RentenlueckeInput {
  const defaultEstimator = { fundAcquisitionCost: 60000, projectedBasisRate: 0.032, scopeConfirmed: true, lossScopeConfirmed: true } as const
  const defaultPortfolio = [
      { id: 'fund', name: 'Fonds', value: 60000, holding: 'accumulating-equity-fund' as const, returnSeriesId: 'synthetic-equity-assumption-v1' },
      { id: 'bank', name: 'Bank', value: 40000, holding: 'ordinary-bank-deposit' as const, returnSeriesId: 'synthetic-cash-assumption-v1' },
    ]
  const base: RentenlueckeInput = { ...DEFAULT_INPUT, currentAge: 67, retirementAge: 67, planningAge: 70, currentCapital: 100_000,
    annualInflationRate: 0, annualReturnBeforeRetirement: 0, annualReturnInRetirement: 0,
    monthlyDesiredSpendingToday: 2000, retirementIncomeStreams: [pension()], retirementInsurance: automaticInsurance({
      capitalEstimator: { ...defaultEstimator },
    }), estimatorPortfolio: defaultPortfolio.map(b => ({ ...b })), ...patch }
  if (base.retirementInsurance && !(base.retirementInsurance as { capitalEstimator?: unknown }).capitalEstimator) {
    base.retirementInsurance = { ...base.retirementInsurance, capitalEstimator: { ...defaultEstimator } } as RentenlueckeInput['retirementInsurance']
  }
  if (!base.estimatorPortfolio) {
    base.estimatorPortfolio = defaultPortfolio.map(b => ({ ...b }))
  }
  if (patch.estimatorPortfolio === undefined && patch.currentCapital !== undefined && Number.isFinite(patch.currentCapital as number)) {
    const total = 100_000
    const scale = (patch.currentCapital as number) / total
    if (Number.isFinite(scale)) {
      base.estimatorPortfolio = base.estimatorPortfolio!.map(b => ({ ...b, value: (b as { value: number }).value * scale }))
      base.currentCapital = (base.estimatorPortfolio as { value: number }[]).reduce((s, b) => s + b.value, 0)
      if (base.retirementInsurance?.capitalEstimator?.fundAcquisitionCost !== undefined) {
        base.retirementInsurance = { ...base.retirementInsurance, capitalEstimator: { ...base.retirementInsurance.capitalEstimator, fundAcquisitionCost: 60000 * scale } }
      }
    }
  }
  // Keep currentCapital consistent with portfolio total when portfolio defaulted.
  if (patch.estimatorPortfolio === undefined && patch.currentCapital === undefined && base.estimatorPortfolio) {
    base.currentCapital = (base.estimatorPortfolio as { value: number }[]).reduce((s, b) => s + b.value, 0)
  }
  return base
}
// Explicit zero own contributions isolate unrelated cashflow/return tests. These
// are test assumptions, never defaults or inferred answers in the product.
// Mandatory detailed portfolio is included so forecasts block only on genuinely
// missing setup, never on a scalar fallback.
export function cashOnlyInput(patch: Partial<RentenlueckeInput> = {}): RentenlueckeInput {
  const input = { ...DEFAULT_INPUT, ...patch }
  const streams = input.retirementIncomeStreams ?? createDefaultRetirementIncomeStreams(input)
  const insurance = input.retirementInsurance ?? {
    ...createDefaultRetirementInsurance(earliestPensionAge(streams) ?? input.retirementAge), referenceYear: 2026,
    bridge: { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 },
    pension: { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 },
  }
  const bucketValue = typeof input.currentCapital === 'number' && Number.isFinite(input.currentCapital) ? input.currentCapital : 10000
  const estimatorPortfolio = input.estimatorPortfolio ?? [
    { id: 'fund', name: 'Fonds', value: bucketValue, holding: 'accumulating-equity-fund' as const, returnSeriesId: 'synthetic-equity-assumption-v1' },
  ]
  const total = estimatorPortfolio.reduce((s, b) => s + (b as { value: number }).value, 0)
  const withCapital = { ...input, currentCapital: total, retirementIncomeStreams: streams, retirementInsurance: insurance, estimatorPortfolio } as RentenlueckeInput
  if (withCapital.retirementInsurance && !(withCapital.retirementInsurance as { capitalEstimator?: unknown }).capitalEstimator) {
    const needsCost = estimatorPortfolio.some(b => (b as { holding?: string }).holding === 'accumulating-equity-fund')
    withCapital.retirementInsurance = { ...withCapital.retirementInsurance, capitalEstimator: { fundAcquisitionCost: needsCost ? 0 : undefined, projectedBasisRate: 0.032, scopeConfirmed: true, lossScopeConfirmed: true } } as RentenlueckeInput['retirementInsurance']
  }
  return withCapital
}

export const completedCoverage = () => ({ bridge: { common: { kind: 'none' as const }, bridgeOnly: { kind: 'none' as const } }, pension: { common: { kind: 'none' as const } } })

// Scale opening capital AND the detailed portfolio (values + pooled fund cost)
// proportionally, preserving per-euro cost history like the ledger's
// required-capital candidate(). Spreading currentCapital alone would desync the
// portfolio total and invalidate the probe.
export function withScaledCapital(input: RentenlueckeInput, capital: number): RentenlueckeInput {
  const buckets = (input.estimatorPortfolio ?? []) as { value: number }[]
  const total = buckets.reduce((sum, b) => sum + b.value, 0)
  if (!(total > 0) || !Number.isFinite(capital) || capital < 0) return { ...input, currentCapital: capital }
  const scale = capital / total
  const estimator = input.retirementInsurance?.capitalEstimator
  return { ...input,
    currentCapital: capital,
    estimatorPortfolio: (input.estimatorPortfolio as unknown[]).map((b) => ({ ...(b as object), value: (b as { value: number }).value * scale })) as RentenlueckeInput['estimatorPortfolio'],
    retirementInsurance: estimator
      ? { ...input.retirementInsurance!, capitalEstimator: { ...estimator, fundAcquisitionCost: (estimator.fundAcquisitionCost ?? 0) * scale } }
      : input.retirementInsurance,
  }
}

// Explicit 0 %-per-bucket return path for isolating non-return logic (stream
// boundaries, manual totals, depletion arithmetic) at honestly modeled zero
// returns. Bank legs carry explicit zero gross interest.
export function zeroBucketPath(input: RentenlueckeInput, years: number): { id: string; totalReturnRate: number; grossBankReturnRate?: number }[][] {
  const buckets = (input.estimatorPortfolio ?? []) as { id: string; holding?: string }[]
  return Array.from({ length: years }, () =>
    buckets.map((b) => b.holding === 'ordinary-bank-deposit'
      ? { id: b.id, totalReturnRate: 0, grossBankReturnRate: 0 }
      : { id: b.id, totalReturnRate: 0 }),
  )
}

// Zero-return isolation keeps historical hand numbers honest: a full cost basis
// (no unrealized gains) plus a 0 %-per-bucket path means withdrawals realize no
// gains and no Vorabpauschale accrues (min(start x 0.7 x rate, end - start) = 0),
// so no Kapitalertragsteuer is assessed. Test assumption only, never a default.
export function withFullCostBasis(input: RentenlueckeInput): RentenlueckeInput {
  const fund = (input.estimatorPortfolio ?? [])
    .filter((b) => (b as { holding?: string }).holding === 'accumulating-equity-fund')
    .reduce((sum, b) => sum + (b as { value: number }).value, 0)
  const estimator = input.retirementInsurance?.capitalEstimator
  if (!estimator) return input
  return { ...input,
    retirementInsurance: { ...input.retirementInsurance!, capitalEstimator: { ...estimator, fundAcquisitionCost: fund } },
  }
}
