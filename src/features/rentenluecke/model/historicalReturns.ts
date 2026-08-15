import { simulateScenarioWithReturnPath } from './stochasticReturns'
import type { RentenlueckeInput, SimulationResult } from './types'
import type { PortfolioComponent, PortfolioComponentRole, StochasticPercentileRow } from './stochasticReturns'
import { createSeededRandom } from './stochasticReturns'

export type ReturnModel = 'synthetic' | 'historicalAnnualBootstrap'
export type DatasetRole = 'equity' | 'bond' | 'cash' | 'inflation' | 'other'
export type DatasetGeography = 'DE' | 'EU' | 'Global'
export type DatasetCurrency = 'EUR'
export type ReturnBasis = 'nominal' | 'real'
export type ReturnType = 'price' | 'grossTotal' | 'netTotal' | 'yieldBased' | 'unknown'
export type DatasetConfidence = 'high' | 'medium' | 'low'

export type DatasetSource =
  | {
      kind: 'bundled'
      path: string
      sourceName: string
      sourceUrl?: string
      license: string
    }
  | {
      kind: 'remote'
      sourceName: string
      sourceUrl: string
      adapter: string
      licenseNote: string
    }

export type HistoricalReturnSeries = {
  id: string
  label: string
  description: string
  role: DatasetRole
  suitableFor: DatasetRole[]
  geography: DatasetGeography
  currency: DatasetCurrency
  returnBasis: ReturnBasis
  returnType: ReturnType
  source: DatasetSource
  license: string
  licenseAllowsBundling: boolean
  rawSeries?: Record<number, number>
  normalizedSeries: Record<number, number>
  startYear: number
  endYear: number
  caveats: string[]
  confidence: DatasetConfidence
  transformVersion: string
  checksum?: string
}

export type ManualFixedReturnSeries = {
  id: 'manual-fixed-real'
  kind: 'synthetic'
  label: string
  description: string
  suitableFor: ['cash']
  returnBasis: 'real'
  annualReturn: number
  caveats: string[]
}

export type ReturnSeriesOption = HistoricalReturnSeries | ManualFixedReturnSeries

export type InflationSeries = {
  id: string
  label: string
  description: string
  geography: 'DE' | 'EU'
  currency: DatasetCurrency
  annualInflation: Record<number, number>
  source: DatasetSource
  license: string
  licenseAllowsBundling: boolean
  startYear: number
  endYear: number
  caveats: string[]
  confidence: DatasetConfidence
  transformVersion: string
  checksum?: string
}

export type HistoricalBootstrapSettings = {
  portfolioComponents: PortfolioComponent[]
  inflationSeriesId: string
  manualCashRealReturn: number
  simulations: number
}

export type HistoricalBootstrapMetadata = {
  validYears: number[]
  sampledYears: number[]
  seed: number
}

export type HistoricalBootstrapSimulationSummary = {
  simulations: number
  successProbability: number
  rows: StochasticPercentileRow[]
  metadata: HistoricalBootstrapMetadata
}

export const HISTORICAL_MINIMUM_OBSERVATIONS = 30
export const DEFAULT_HISTORICAL_INFLATION_SERIES_ID = 'fixture-de-eur-inflation-provisional'
export const DEFAULT_HISTORICAL_RETURN_SERIES_IDS = {
  equity: 'fixture-global-equity-eur-provisional',
  bond: 'fixture-eur-bonds-provisional',
  cash: 'fixture-eur-cash-provisional',
} as const

const provisionalSource: DatasetSource = {
  kind: 'bundled',
  path: 'src/features/rentenluecke/model/historicalReturns.ts',
  sourceName: 'Provisional Phase 1 fixture data',
  license: 'App fixture data; not a researched historical dataset',
}

export const HISTORICAL_RETURN_SERIES: HistoricalReturnSeries[] = [
  {
    id: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.equity,
    label: 'Provisorisch: Aktien Welt/EUR',
    description: 'Small Phase 1 fixture series for end-to-end historical bootstrap wiring.',
    role: 'equity',
    suitableFor: ['equity'],
    geography: 'Global',
    currency: 'EUR',
    returnBasis: 'real',
    returnType: 'unknown',
    source: provisionalSource,
    license: provisionalSource.license,
    licenseAllowsBundling: true,
    normalizedSeries: {
      2015: 0.08,
      2016: 0.04,
      2017: 0.13,
      2018: -0.11,
      2019: 0.21,
      2020: 0.06,
      2021: 0.16,
      2022: -0.17,
      2023: 0.12,
      2024: 0.09,
    },
    startYear: 2015,
    endYear: 2024,
    caveats: ['Provisional fixture data, not researched historical market data.', 'Replace in Phase 2.'],
    confidence: 'low',
    transformVersion: 'phase1-fixture-v1',
    checksum: 'phase1-equity-fixture-v1',
  },
  {
    id: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.bond,
    label: 'Provisorisch: EUR-Anleihen',
    description: 'Small Phase 1 fixture series for end-to-end historical bootstrap wiring.',
    role: 'bond',
    suitableFor: ['bond'],
    geography: 'EU',
    currency: 'EUR',
    returnBasis: 'real',
    returnType: 'unknown',
    source: provisionalSource,
    license: provisionalSource.license,
    licenseAllowsBundling: true,
    normalizedSeries: {
      2015: 0.02,
      2016: 0.03,
      2017: 0.01,
      2018: -0.01,
      2019: 0.05,
      2020: 0.04,
      2021: -0.02,
      2022: -0.12,
      2023: 0.03,
      2024: 0.02,
    },
    startYear: 2015,
    endYear: 2024,
    caveats: ['Provisional fixture data, not researched historical market data.', 'Replace in Phase 2.'],
    confidence: 'low',
    transformVersion: 'phase1-fixture-v1',
    checksum: 'phase1-bond-fixture-v1',
  },
  {
    id: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.cash,
    label: 'Provisorisch: EUR-Cash',
    description: 'Small Phase 1 fixture series for end-to-end historical bootstrap wiring.',
    role: 'cash',
    suitableFor: ['cash'],
    geography: 'EU',
    currency: 'EUR',
    returnBasis: 'real',
    returnType: 'yieldBased',
    source: provisionalSource,
    license: provisionalSource.license,
    licenseAllowsBundling: true,
    normalizedSeries: {
      2015: -0.01,
      2016: -0.01,
      2017: -0.01,
      2018: -0.02,
      2019: -0.02,
      2020: -0.01,
      2021: -0.03,
      2022: -0.07,
      2023: 0.0,
      2024: 0.01,
    },
    startYear: 2015,
    endYear: 2024,
    caveats: ['Provisional fixture data, not researched historical market data.', 'Replace in Phase 2.'],
    confidence: 'low',
    transformVersion: 'phase1-fixture-v1',
    checksum: 'phase1-cash-fixture-v1',
  },
]

export const HISTORICAL_INFLATION_SERIES: InflationSeries[] = [
  {
    id: DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
    label: 'Provisorisch: Deutschland/EUR Inflation',
    description: 'Small Phase 1 fixture inflation series used read-only by historical bootstrap mode.',
    geography: 'DE',
    currency: 'EUR',
    annualInflation: {
      2015: 0.003,
      2016: 0.005,
      2017: 0.015,
      2018: 0.018,
      2019: 0.014,
      2020: 0.005,
      2021: 0.031,
      2022: 0.069,
      2023: 0.059,
      2024: 0.022,
    },
    source: provisionalSource,
    license: provisionalSource.license,
    licenseAllowsBundling: true,
    startYear: 2015,
    endYear: 2024,
    caveats: ['Provisional fixture data, not researched historical inflation data.', 'Replace in Phase 2.'],
    confidence: 'low',
    transformVersion: 'phase1-fixture-v1',
    checksum: 'phase1-inflation-fixture-v1',
  },
]

export function createManualFixedRealReturnSeries(annualReturn: number): ManualFixedReturnSeries {
  return {
    id: 'manual-fixed-real',
    kind: 'synthetic',
    label: 'Manuell: fester Realzins',
    description: 'Constant real Cash return. Does not restrict the usable historical years.',
    suitableFor: ['cash'],
    returnBasis: 'real',
    annualReturn,
    caveats: ['Manual synthetic return. It is synchronized with sampled inflation but has no historical year coverage.'],
  }
}

export function findHistoricalReturnSeries(id: string): HistoricalReturnSeries | undefined {
  return HISTORICAL_RETURN_SERIES.find((series) => series.id === id)
}

export function findInflationSeries(id: string): InflationSeries | undefined {
  return HISTORICAL_INFLATION_SERIES.find((series) => series.id === id)
}

export function getReturnSeriesOptionsForRole(
  role: PortfolioComponentRole,
  manualCashRealReturn: number,
): ReturnSeriesOption[] {
  const datasetRole = role === 'bond' ? 'bond' : role === 'cash' ? 'cash' : role === 'equity' ? 'equity' : 'other'
  const options: ReturnSeriesOption[] = HISTORICAL_RETURN_SERIES.filter((series) =>
    series.suitableFor.includes(datasetRole),
  )

  if (role === 'cash') {
    options.push(createManualFixedRealReturnSeries(manualCashRealReturn))
  }

  return options
}

export function getValidHistoricalYears(
  components: PortfolioComponent[],
  inflationSeries: InflationSeries,
): number[] {
  const requiredYearSets = components
    .map((component) => {
      if (!component.returnSeriesId || component.returnSeriesId === 'manual-fixed-real') {
        return null
      }

      const series = findHistoricalReturnSeries(component.returnSeriesId)
      return series ? yearsWithFiniteValues(series.normalizedSeries) : new Set<number>()
    })
    .filter((set): set is Set<number> => set !== null)

  requiredYearSets.push(yearsWithFiniteValues(inflationSeries.annualInflation))

  if (requiredYearSets.length === 0) {
    return []
  }

  const [firstSet, ...remainingSets] = requiredYearSets
  return [...firstSet].filter((year) => remainingSets.every((set) => set.has(year))).sort((a, b) => a - b)
}

export function sampleHistoricalYearsWithReplacement(years: number[], count: number, seed: number): number[] {
  if (years.length === 0 && count > 0) {
    throw new Error('Historical bootstrap needs at least one valid sample year.')
  }

  const rng = createSeededRandom(seed)
  return Array.from({ length: count }, () => years[Math.floor(rng() * years.length)])
}

export function generateHistoricalReturnPath(
  components: PortfolioComponent[],
  inflationSeries: InflationSeries,
  sampledYears: number[],
  manualCashRealReturn: number,
): number[] {
  return sampledYears.map((year) => {
    const inflation = inflationSeries.annualInflation[year]

    return components.reduce((portfolioReturn, component) => {
      if (component.weight === 0) {
        return portfolioReturn
      }

      const annualReturn = resolveComponentNominalReturn(component, year, inflation, manualCashRealReturn)
      return portfolioReturn + component.weight * annualReturn
    }, 0)
  })
}

export function createHistoricalBootstrapSeed(input: RentenlueckeInput, settings: HistoricalBootstrapSettings): number {
  return hashString(
    stableStringify({
      input,
      inflationSeriesId: settings.inflationSeriesId,
      manualCashRealReturn: settings.manualCashRealReturn,
      simulations: settings.simulations,
      portfolioComponents: settings.portfolioComponents.map((component) => ({
        id: component.id,
        role: component.role,
        weight: component.weight,
        returnSeriesId: component.returnSeriesId,
        datasetVersion: getDatasetVersion(component.returnSeriesId),
      })),
      inflationVersion: getInflationVersion(settings.inflationSeriesId),
    }),
  )
}

export function simulateHistoricalBootstrapScenario(
  input: RentenlueckeInput,
  settings: HistoricalBootstrapSettings,
): SimulationResult & { metadata: HistoricalBootstrapMetadata } {
  const inflationSeries = getRequiredInflationSeries(settings.inflationSeriesId)
  const validYears = getValidHistoricalYears(settings.portfolioComponents, inflationSeries)
  const baseline = simulateScenarioWithReturnPath(input, [])
  const seed = createHistoricalBootstrapSeed(input, { ...settings, simulations: 1 })
  const sampledYears = sampleHistoricalYearsWithReplacement(validYears, baseline.rows.length, seed)
  const returnPath = generateHistoricalReturnPath(
    settings.portfolioComponents,
    inflationSeries,
    sampledYears,
    settings.manualCashRealReturn,
  )

  return {
    ...simulateScenarioWithReturnPath(input, returnPath),
    metadata: { validYears, sampledYears, seed },
  }
}

export function runHistoricalBootstrapSimulation(
  input: RentenlueckeInput,
  settings: HistoricalBootstrapSettings,
): HistoricalBootstrapSimulationSummary {
  const inflationSeries = getRequiredInflationSeries(settings.inflationSeriesId)
  const deterministicResult = simulateHistoricalBootstrapScenario(input, settings)
  const validYears = deterministicResult.metadata.validYears
  const years = deterministicResult.rows.length
  const seed = createHistoricalBootstrapSeed(input, settings)
  const rng = createSeededRandom(seed)
  const pathResults = Array.from({ length: settings.simulations }, () => {
    const pathSeed = Math.floor(rng() * 4_294_967_296)
    const sampledYears = sampleHistoricalYearsWithReplacement(validYears, years, pathSeed)
    const returnPath = generateHistoricalReturnPath(
      settings.portfolioComponents,
      inflationSeries,
      sampledYears,
      settings.manualCashRealReturn,
    )

    return simulateScenarioWithReturnPath(input, returnPath)
  })
  const successfulPaths = pathResults.filter((result) => result.summary.survivesUntilPlanningAge).length
  const rows = deterministicResult.rows.map((deterministicRow, rowIndex) => {
    const capitalValues = pathResults.map((result) => result.rows[rowIndex]?.closingCapitalToday ?? 0).sort((a, b) => a - b)
    const depletedCount = capitalValues.filter((value) => value <= 0).length

    return {
      ageStart: deterministicRow.ageStart,
      ageEnd: deterministicRow.ageEnd,
      deterministicCapitalToday: deterministicRow.closingCapitalToday,
      p10CapitalToday: percentile(capitalValues, 0.1),
      p50CapitalToday: percentile(capitalValues, 0.5),
      p90CapitalToday: percentile(capitalValues, 0.9),
      depletionProbability: depletedCount / settings.simulations,
    }
  })

  return {
    simulations: settings.simulations,
    successProbability: successfulPaths / settings.simulations,
    rows,
    metadata: { validYears, sampledYears: deterministicResult.metadata.sampledYears, seed },
  }
}

function getRequiredInflationSeries(id: string): InflationSeries {
  const inflationSeries = findInflationSeries(id)
  if (!inflationSeries) {
    throw new Error(`Unknown inflation series: ${id}`)
  }

  return inflationSeries
}

function resolveComponentNominalReturn(
  component: PortfolioComponent,
  year: number,
  inflation: number,
  manualCashRealReturn: number,
): number {
  if (component.returnSeriesId === 'manual-fixed-real') {
    return realToNominalReturn(manualCashRealReturn, inflation)
  }

  const series = component.returnSeriesId ? findHistoricalReturnSeries(component.returnSeriesId) : undefined
  if (!series) {
    throw new Error(`Unknown return series for ${component.label}: ${component.returnSeriesId ?? 'missing'}`)
  }

  const annualReturn = series.normalizedSeries[year]
  if (!Number.isFinite(annualReturn)) {
    throw new Error(`Missing ${series.label} return for ${year}`)
  }

  return series.returnBasis === 'real' ? realToNominalReturn(annualReturn, inflation) : annualReturn
}

function realToNominalReturn(realReturn: number, inflation: number): number {
  return (1 + realReturn) * (1 + inflation) - 1
}

function yearsWithFiniteValues(series: Record<number, number>): Set<number> {
  return new Set(
    Object.entries(series)
      .filter(([, value]) => Number.isFinite(value))
      .map(([year]) => Number(year)),
  )
}

function getDatasetVersion(id?: string): string {
  if (!id) {
    return 'missing'
  }

  if (id === 'manual-fixed-real') {
    return id
  }

  const series = findHistoricalReturnSeries(id)
  return series ? `${series.transformVersion}:${series.checksum ?? ''}` : id
}

function getInflationVersion(id: string): string {
  const series = findInflationSeries(id)
  return series ? `${series.transformVersion}:${series.checksum ?? ''}` : id
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

function hashString(value: string): number {
  let hash = 2_166_136_261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }

  return hash >>> 0
}

function percentile(sortedValues: number[], percentileValue: number): number {
  if (sortedValues.length === 0) {
    return 0
  }

  const index = Math.round((sortedValues.length - 1) * percentileValue)
  return sortedValues[index]
}
