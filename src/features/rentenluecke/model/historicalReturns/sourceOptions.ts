import type { PortfolioComponent, PortfolioComponentRole } from '../stochasticReturns'
import { FIXED_INFLATION_SOURCE_ID } from './constants'
import {
  findHistoricalReturnSeries,
  findSyntheticReturnSeries,
  HISTORICAL_RETURN_SERIES,
  isSyntheticReturnSeriesId,
  SYNTHETIC_RETURN_SERIES,
} from './returnSeriesRegistry'
import {
  createFixedInflationSource,
  findInflationSeries,
  findInflationSourceOption,
  HISTORICAL_INFLATION_SERIES,
  isFixedInflationSource,
} from './inflationSeriesRegistry'
import type { InflationSourceOption, ReturnSeriesOption } from './types'

export type ReturnSeriesCategory = 'equity' | 'bond' | 'cash'

const RETURN_SERIES_CATEGORIES: ReturnSeriesCategory[] = ['equity', 'bond', 'cash']

export function getReturnSeriesOptions(): ReturnSeriesOption[] {
  return [...HISTORICAL_RETURN_SERIES, ...SYNTHETIC_RETURN_SERIES].filter(
    (series) => getReturnSeriesCategory(series.id) !== undefined,
  )
}

export function getReturnSeriesCategory(id: string): ReturnSeriesCategory | undefined {
  const series = findHistoricalReturnSeries(id) ?? findSyntheticReturnSeries(id)
  if (!series) return undefined

  const categories = RETURN_SERIES_CATEGORIES.filter((category) => series.suitableFor.includes(category))
  if (categories.length !== 1) return undefined
  const category = categories[0]
  if (!('kind' in series) && series.role !== category) return undefined
  return category
}

export function getInflationSourceOptions(annualInflationRate: number): InflationSourceOption[] {
  return [createFixedInflationSource(annualInflationRate), ...HISTORICAL_INFLATION_SERIES]
}

export function getReturnSeriesOptionsForRole(
  role: PortfolioComponentRole,
): ReturnSeriesOption[] {
  const datasetRole = role === 'bond' ? 'bond' : role === 'cash' ? 'cash' : role === 'equity' ? 'equity' : 'other'
  const options: ReturnSeriesOption[] = HISTORICAL_RETURN_SERIES.filter((series) =>
    series.suitableFor.includes(datasetRole),
  )
  const syntheticSeries = SYNTHETIC_RETURN_SERIES.find((series) => series.suitableFor.includes(datasetRole))
  if (syntheticSeries) {
    options.push(syntheticSeries)
  }

  return options
}

export function getValidHistoricalYears(
  components: PortfolioComponent[],
  inflationSource: InflationSourceOption,
): number[] {
  const requiredYearSets = components
    .map((component) => {
      if (!component.returnSeriesId || isSyntheticReturnSeriesId(component.returnSeriesId)) {
        return null
      }

      const series = findHistoricalReturnSeries(component.returnSeriesId)
      return series ? yearsWithFiniteValues(series.normalizedSeries) : new Set<number>()
    })
    .filter((set): set is Set<number> => set !== null)

  if (!isFixedInflationSource(inflationSource)) {
    requiredYearSets.push(yearsWithFiniteValues(inflationSource.annualInflation))
  }

  if (requiredYearSets.length === 0) {
    return []
  }

  const [firstSet, ...remainingSets] = requiredYearSets
  return [...firstSet].filter((year) => remainingSets.every((set) => set.has(year))).sort((a, b) => a - b)
}

export function getHistoricalDatasetVersion(id?: string): string {
  if (!id) {
    return 'missing'
  }

  const syntheticSeries = findSyntheticReturnSeries(id)
  if (syntheticSeries) {
    return stableStringify({
      version: syntheticSeries.sourceDatasetVersion,
      id: syntheticSeries.id,
      expectedAnnualReturn: syntheticSeries.expectedAnnualReturn,
      annualVolatility: syntheticSeries.annualVolatility,
    })
  }

  const series = findHistoricalReturnSeries(id)
  return series ? `${series.transformVersion}:${series.checksum ?? ''}` : id
}

export function getInflationSourceVersion(id: string, annualInflationRate = 0): string {
  if (id === FIXED_INFLATION_SOURCE_ID) {
    return stableStringify({ id, annualInflationRate })
  }

  const series = findInflationSeries(id)
  return series ? `${series.transformVersion}:${series.checksum ?? ''}` : id
}

export function getRequiredInflationSource(id: string, annualInflationRate: number): InflationSourceOption {
  const inflationSource = findInflationSourceOption(id, annualInflationRate)
  if (!inflationSource) {
    throw new Error(`Unknown inflation source: ${id}`)
  }

  return inflationSource
}

function yearsWithFiniteValues(series: Record<number, number>): Set<number> {
  return new Set(
    Object.entries(series)
      .filter(([, value]) => Number.isFinite(value))
      .map(([year]) => Number(year)),
  )
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }

  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(',')}}`
  }

  return JSON.stringify(value)
}
