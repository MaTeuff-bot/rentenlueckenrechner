import { getReturnSeriesCategory } from './historicalReturns/sourceOptions'

export type CashPlanningRateState = {
  cashPlanningRate?: number
  cashPlanningRateConfirmed?: boolean
}

export function isConfirmedCashPlanningRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

export function getConfirmedCashPlanningRate(state: CashPlanningRateState | undefined): number | undefined {
  if (!state) return undefined
  if (state.cashPlanningRateConfirmed !== true) return undefined
  if (!isConfirmedCashPlanningRate(state.cashPlanningRate)) return undefined
  return state.cashPlanningRate
}

export function hasCashCategoryBucket(buckets: readonly { returnSeriesId: string }[] | undefined): boolean {
  if (!buckets || buckets.length === 0) return false
  return buckets.some((bucket) => getReturnSeriesCategory(bucket.returnSeriesId) === 'cash')
}

export function cashPlanningRateIssue(
  buckets: readonly { returnSeriesId: string }[] | undefined,
  state: CashPlanningRateState | undefined,
): string | null {
  if (!hasCashCategoryBucket(buckets)) return null
  if (getConfirmedCashPlanningRate(state) !== undefined) return null
  return 'Tagesgeld-Planungszins unter Rechenannahmen festlegen und ausdrücklich bestätigen (konstanter nominaler Satz für alle Jahre/Pfade/Bankeinlagen).'
}
