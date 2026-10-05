import { getReturnSeriesCategory } from './historicalReturns/sourceOptions'
import {
  CASH_MODE_CONSTANT,
  CASH_MODE_HISTORICAL,
  CASH_MODE_REAL,
  CASH_MODES,
  DEFAULT_CASH_MODE,
  DEFAULT_HISTORICAL_RETURN_SERIES_IDS,
  HISTORICAL_DEPOSIT_STRATEGY_SOURCE_ID,
  PLANNING_RATE_SOURCE_ID,
  REAL_ASSUMPTION_SOURCE_ID,
  type CashMode,
} from './historicalReturns/constants'

export type { CashMode }
export { CASH_MODES, DEFAULT_CASH_MODE }

export type CashPlanningRateState = {
  cashMode?: string
  cashPlanningRate?: number
  cashRealRate?: number
  cashPlanningRateConfirmed?: boolean
}

export function isKnownCashMode(value: unknown): value is CashMode {
  return value === CASH_MODE_CONSTANT || value === CASH_MODE_HISTORICAL || value === CASH_MODE_REAL
}

export function getEffectiveCashMode(state: CashPlanningRateState | undefined): CashMode | undefined {
  if (!state) return DEFAULT_CASH_MODE
  if (state.cashMode === undefined) return DEFAULT_CASH_MODE
  if (!isKnownCashMode(state.cashMode)) return undefined
  return state.cashMode
}

export function sourceIdForCashMode(mode: CashMode): string {
  if (mode === CASH_MODE_HISTORICAL) return HISTORICAL_DEPOSIT_STRATEGY_SOURCE_ID
  if (mode === CASH_MODE_REAL) return REAL_ASSUMPTION_SOURCE_ID
  return PLANNING_RATE_SOURCE_ID
}

export function cashModeForSourceId(sourceId: string): CashMode | undefined {
  if (sourceId === PLANNING_RATE_SOURCE_ID) return CASH_MODE_CONSTANT
  if (sourceId === HISTORICAL_DEPOSIT_STRATEGY_SOURCE_ID) return CASH_MODE_HISTORICAL
  if (sourceId === REAL_ASSUMPTION_SOURCE_ID) return CASH_MODE_REAL
  return undefined
}

function isBankSourceId(sourceId: string): boolean {
  return (
    sourceId === PLANNING_RATE_SOURCE_ID ||
    sourceId === HISTORICAL_DEPOSIT_STRATEGY_SOURCE_ID ||
    sourceId === REAL_ASSUMPTION_SOURCE_ID
  )
}

export function isConfirmedCashPlanningRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

export function isConfirmedCashRealRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > -1
}

export function getConfirmedCashPlanningRate(state: CashPlanningRateState | undefined): number | undefined {
  if (!state) return undefined
  if (state.cashPlanningRateConfirmed !== true) return undefined
  if (getEffectiveCashMode(state) !== CASH_MODE_CONSTANT) return undefined
  if (!isConfirmedCashPlanningRate(state.cashPlanningRate)) return undefined
  return state.cashPlanningRate
}

export function getConfirmedCashRealRate(state: CashPlanningRateState | undefined): number | undefined {
  if (!state) return undefined
  if (state.cashPlanningRateConfirmed !== true) return undefined
  if (getEffectiveCashMode(state) !== CASH_MODE_REAL) return undefined
  if (!isConfirmedCashRealRate(state.cashRealRate)) return undefined
  return state.cashRealRate
}

export function hasCashCategoryBucket(buckets: readonly { returnSeriesId: string }[] | undefined): boolean {
  if (!buckets || buckets.length === 0) return false
  return buckets.some((bucket) => getReturnSeriesCategory(bucket.returnSeriesId) === 'cash')
}

function modeRateValid(mode: CashMode, state: CashPlanningRateState): boolean {
  if (mode === CASH_MODE_CONSTANT) return isConfirmedCashPlanningRate(state.cashPlanningRate)
  if (mode === CASH_MODE_REAL) return isConfirmedCashRealRate(state.cashRealRate)
  return true
}

export function cashPlanningRateIssue(
  buckets: readonly { returnSeriesId: string }[] | undefined,
  state: CashPlanningRateState | undefined,
): string | null {
  if (!hasCashCategoryBucket(buckets)) return null
  const mode = getEffectiveCashMode(state)
  if (mode === undefined) {
    return 'Unbekannte Tagesgeld-Annahme unter Rechenannahmen erneut wählen und ausdrücklich bestätigen (gespeicherter Modus wird nicht stillschweigend umgedeutet).'
  }
  if (state?.cashPlanningRateConfirmed !== true) {
    return mode === CASH_MODE_CONSTANT
      ? 'Tagesgeld-Planungszins unter Rechenannahmen festlegen und ausdrücklich bestätigen (konstanter nominaler Satz für alle Jahre/Pfade/Bankeinlagen).'
      : mode === CASH_MODE_HISTORICAL
        ? 'Historische Tagesgeld-Strategie unter Rechenannahmen ausdrücklich bestätigen (Kontowechsel mit nominaler 0%-Untergrenze; Rohwerte erhalten, Jahr-Paarung bleibt).'
        : 'Realzins-Annahme mit nominaler 0%-Untergrenze unter Rechenannahmen festlegen und ausdrücklich bestätigen.'
  }
  if (!modeRateValid(mode, state!)) {
    return mode === CASH_MODE_REAL
      ? 'Realzins-Annahme fehlt oder ist ungültig (finite Zahl > -100 %); unter Rechenannahmen korrigieren und erneut bestätigen.'
      : 'Tagesgeld-Planungszins fehlt oder ist ungültig; unter Rechenannahmen festlegen und erneut bestätigen.'
  }
  return null
}

export type PlanningRateBucketView = {
  holding?: string
  returnSeriesId: string
}

export function adoptPlanningRateForBankBuckets<T extends PlanningRateBucketView>(
  buckets: readonly T[],
  state: CashPlanningRateState | undefined,
): T[] {
  const mode = getEffectiveCashMode(state)
  if (mode === undefined) return buckets.map((bucket) => bucket)
  if (state?.cashPlanningRateConfirmed !== true) return buckets.map((bucket) => bucket)
  if (!modeRateValid(mode, state!)) return buckets.map((bucket) => bucket)
  const target = sourceIdForCashMode(mode)
  return buckets.map((bucket) =>
    bucket.holding === 'ordinary-bank-deposit' && bucket.returnSeriesId !== target
      ? { ...bucket, returnSeriesId: target }
      : bucket,
  )
}

export function resolveBucketSourceForHoldingChange(
  currentSource: string,
  currentHolding: string | undefined,
  nextHolding: string | undefined,
  explicitSource: string | undefined,
  confirmedRate: number | undefined,
  confirmedMode?: CashMode,
): string {
  const targetHolding = nextHolding !== undefined ? nextHolding : currentHolding
  if (targetHolding === 'ordinary-bank-deposit') {
    if (confirmedRate !== undefined && confirmedMode !== undefined) return sourceIdForCashMode(confirmedMode)
    if (confirmedRate !== undefined) return PLANNING_RATE_SOURCE_ID
    return currentSource
  }
  if (
    isBankSourceId(currentSource) &&
    currentHolding === 'ordinary-bank-deposit' &&
    nextHolding === 'accumulating-equity-fund' &&
    explicitSource === undefined
  ) {
    return DEFAULT_HISTORICAL_RETURN_SERIES_IDS.equity
  }
  if (explicitSource !== undefined) return explicitSource
  return currentSource
}

export function getConfirmedCashMode(state: CashPlanningRateState | undefined): CashMode | undefined {
  if (!state) return undefined
  if (state.cashPlanningRateConfirmed !== true) return undefined
  const mode = getEffectiveCashMode(state)
  if (mode === undefined) return undefined
  if (!modeRateValid(mode, state)) return undefined
  return mode
}
