import { getReturnSeriesCategory } from './historicalReturns/sourceOptions'
import {
  DEFAULT_HISTORICAL_RETURN_SERIES_IDS,
  PLANNING_RATE_SOURCE_ID,
} from './historicalReturns/constants'

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

export type PlanningRateBucketView = {
  holding?: string
  returnSeriesId: string
}

export function adoptPlanningRateForBankBuckets<T extends PlanningRateBucketView>(
  buckets: readonly T[],
  state: CashPlanningRateState | undefined,
): T[] {
  if (getConfirmedCashPlanningRate(state) === undefined) return buckets.map((bucket) => bucket)
  return buckets.map((bucket) =>
    bucket.holding === 'ordinary-bank-deposit' && bucket.returnSeriesId !== PLANNING_RATE_SOURCE_ID
      ? { ...bucket, returnSeriesId: PLANNING_RATE_SOURCE_ID }
      : bucket,
  )
}

export function resolveBucketSourceForHoldingChange(
  currentSource: string,
  currentHolding: string | undefined,
  nextHolding: string | undefined,
  explicitSource: string | undefined,
  confirmedRate: number | undefined,
): string {
  const targetHolding = nextHolding !== undefined ? nextHolding : currentHolding
  if (targetHolding === 'ordinary-bank-deposit') {
    if (confirmedRate !== undefined) return PLANNING_RATE_SOURCE_ID
    return currentSource
  }
  if (
    currentSource === PLANNING_RATE_SOURCE_ID &&
    currentHolding === 'ordinary-bank-deposit' &&
    nextHolding === 'accumulating-equity-fund' &&
    explicitSource === undefined
  ) {
    return DEFAULT_HISTORICAL_RETURN_SERIES_IDS.equity
  }
  if (explicitSource !== undefined) return explicitSource
  return currentSource
}
