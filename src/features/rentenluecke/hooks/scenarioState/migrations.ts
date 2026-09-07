import {
  DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
  FIXED_INFLATION_SOURCE_ID,
  findInflationSeries,
} from '../../model/historicalReturns'
import { createDefaultHistoricalState } from './defaults'
import type { PersistedHistoricalState, ScenarioState } from './types'
import { createDefaultRetirementIncomeStreams } from '../../model/retirementIncomeStreams'
import type { RentenlueckeInput, RetirementIncomeStream } from '../../model/types'

const PROVISIONAL_INFLATION_SERIES_ID_MIGRATIONS = {
  'fixture-de-eur-inflation-provisional': DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
} as const

export function normalizeHistoricalState(historical: PersistedHistoricalState | undefined): ScenarioState['historical'] {
  if (!historical) return createDefaultHistoricalState()
  return {
    inflationSourceId: normalizeInflationSourceId(
      historical.inflationSourceId ?? historical.inflationSeriesId ?? DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
    ),
  }
}

export function migrateV10RetirementIncome(input: RentenlueckeInput): RetirementIncomeStream[] {
  return createDefaultRetirementIncomeStreams(input)
}

function migrateProvisionalInflationSeriesId(id: string): string {
  return PROVISIONAL_INFLATION_SERIES_ID_MIGRATIONS[id as keyof typeof PROVISIONAL_INFLATION_SERIES_ID_MIGRATIONS] ?? id
}

export function normalizeInflationSourceId(id: string): string {
  const migratedId = migrateProvisionalInflationSeriesId(id)
  return migratedId === FIXED_INFLATION_SOURCE_ID || findInflationSeries(migratedId)
    ? migratedId
    : DEFAULT_HISTORICAL_INFLATION_SERIES_ID
}
