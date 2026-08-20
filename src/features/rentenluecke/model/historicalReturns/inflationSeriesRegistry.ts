import { HISTORICAL_PRODUCTION_INFLATION_SERIES } from '../returnData/historicalProductionData'
import { FIXED_INFLATION_SOURCE_ID } from './constants'
import type { FixedInflationSource, InflationSeries, InflationSourceOption } from './types'

export const HISTORICAL_INFLATION_SERIES: InflationSeries[] = [
  ...HISTORICAL_PRODUCTION_INFLATION_SERIES,
]

export function findInflationSeries(id: string): InflationSeries | undefined {
  return HISTORICAL_INFLATION_SERIES.find((series) => series.id === id)
}

export function createFixedInflationSource(annualInflationRate: number): FixedInflationSource {
  return {
    id: FIXED_INFLATION_SOURCE_ID,
    kind: 'fixed',
    label: 'Manuell: feste Inflation',
    description: 'Constant annual inflation assumption from the manual percentage input.',
    annualInflationRate,
    caveats: ['Manual fixed inflation. It does not restrict usable historical return years.'],
  }
}

export function findInflationSourceOption(
  id: string,
  annualInflationRate: number,
): InflationSourceOption | undefined {
  return id === FIXED_INFLATION_SOURCE_ID ? createFixedInflationSource(annualInflationRate) : findInflationSeries(id)
}

export function isFixedInflationSource(source: InflationSourceOption): source is FixedInflationSource {
  return 'kind' in source && source.kind === 'fixed'
}
