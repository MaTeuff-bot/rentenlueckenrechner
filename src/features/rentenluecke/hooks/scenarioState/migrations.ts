import {
  DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
  DEFAULT_HISTORICAL_RETURN_SERIES_IDS,
  FIXED_INFLATION_SOURCE_ID,
  findInflationSeries,
} from '../../model/historicalReturns'
import { createDefaultHistoricalState } from './defaults'
import type { PersistedHistoricalState, ScenarioState } from './types'

const PROVISIONAL_RETURN_SERIES_ID_MIGRATIONS = {
  'fixture-global-equity-eur-provisional': DEFAULT_HISTORICAL_RETURN_SERIES_IDS.equity,
  'fixture-eur-bonds-provisional': DEFAULT_HISTORICAL_RETURN_SERIES_IDS.bond,
  'fixture-eur-cash-provisional': DEFAULT_HISTORICAL_RETURN_SERIES_IDS.cash,
} as const
const PROVISIONAL_INFLATION_SERIES_ID_MIGRATIONS = {
  'fixture-de-eur-inflation-provisional': DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
} as const

export function normalizeHistoricalState(historical: PersistedHistoricalState | undefined): ScenarioState['historical'] {
  if (!historical) return createDefaultHistoricalState()
  return {
    ...historical,
    returnSeriesIds: {
      equity: migrateProvisionalReturnSeriesId('equity', historical.returnSeriesIds.equity),
      bond: migrateProvisionalReturnSeriesId('bond', historical.returnSeriesIds.bond),
      cash: migrateProvisionalReturnSeriesId('cash', historical.returnSeriesIds.cash),
    },
    inflationSourceId: normalizeInflationSourceId(
      historical.inflationSourceId ?? historical.inflationSeriesId ?? DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
    ),
  }
}

function migrateProvisionalReturnSeriesId(role: 'equity' | 'bond' | 'cash', id: string): string {
  return id in PROVISIONAL_RETURN_SERIES_ID_MIGRATIONS ? DEFAULT_HISTORICAL_RETURN_SERIES_IDS[role] : id
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
