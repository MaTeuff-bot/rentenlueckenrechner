import {
  ASSET_CLASS_ASSUMPTIONS,
  sampleNormal,
  simulateScenarioWithReturnPath,
  type AssetClassAssumption,
  type AssetClassKey,
} from './stochasticReturns'
import { simulateScenario } from './simulateScenario'
import type { RentenlueckeInput, SimulationResult } from './types'
import type { PortfolioComponent, PortfolioComponentRole, StochasticPercentileRow } from './stochasticReturns'
import { createSeededRandom } from './stochasticReturns'
import {
  HISTORICAL_PRODUCTION_INFLATION_SERIES,
  HISTORICAL_PRODUCTION_RETURN_SERIES,
} from './returnData/historicalProductionData'

export type DatasetRole = 'equity' | 'bond' | 'cash' | 'inflation' | 'other'
export type DatasetGeography = 'DE' | 'EU' | 'Global'
export type DatasetCurrency = 'EUR'
export type ReturnBasis = 'nominal' | 'real'
export type ReturnType = 'price' | 'grossTotal' | 'netTotal' | 'yieldBased' | 'unknown'
export type DatasetConfidence = 'high' | 'medium' | 'low'

export type DatasetCountryCoverage = {
  includedCountries: readonly string[]
  excludedCountries: readonly string[]
  minCountriesPerYear: number
  maxCountriesPerYear: number
  byRole?: Readonly<Record<string, { min: number; max: number }>>
}

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
  commercialUseAllowed: boolean
  derivedData: boolean
  sourceDatasetVersion: string
  sourceChecksum: string
  transformDescription: string
  generatedAt?: string
  countryCoverage?: DatasetCountryCoverage
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

export type SyntheticReturnSeries = {
  id: string
  kind: 'synthetic'
  label: string
  description: string
  suitableFor: DatasetRole[]
  returnBasis: 'nominal'
  assumptionKey: AssetClassKey
  expectedAnnualReturn: number
  annualVolatility: number
  sourceDatasetVersion: string
  caveats: string[]
}

export type ReturnSeriesOption = HistoricalReturnSeries | ManualFixedReturnSeries | SyntheticReturnSeries

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
  commercialUseAllowed: boolean
  derivedData: boolean
  sourceDatasetVersion: string
  sourceChecksum: string
  transformDescription: string
  generatedAt?: string
  startYear: number
  endYear: number
  caveats: string[]
  confidence: DatasetConfidence
  transformVersion: string
  checksum?: string
}

export type FixedInflationSource = {
  id: typeof FIXED_INFLATION_SOURCE_ID
  kind: 'fixed'
  label: string
  description: string
  annualInflationRate: number
  caveats: string[]
}

export type InflationSourceOption = FixedInflationSource | InflationSeries

export type HistoricalBootstrapSettings = {
  portfolioComponents: PortfolioComponent[]
  inflationSourceId: string
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
export const FIXED_INFLATION_SOURCE_ID = 'fixed-manual'
export const DEFAULT_HISTORICAL_INFLATION_SERIES_ID = 'bundesbank-destatis-germany-cpi-yoy-annual-mean-post1950'
export const DEFAULT_HISTORICAL_RETURN_SERIES_IDS = {
  equity: 'jst-r6-developed-equal-weight-equity-real-post1950',
  bond: 'jst-r6-developed-equal-weight-bonds-real-post1950',
  cash: 'jst-r6-developed-equal-weight-bills-real-post1950',
} as const
export const SYNTHETIC_RETURN_ASSUMPTIONS_VERSION = 'asset-class-assumptions-v1'
export const SYNTHETIC_RETURN_SERIES_IDS = {
  equity: 'synthetic-equity-assumption-v1',
  bond: 'synthetic-bonds-assumption-v1',
  cash: 'synthetic-cash-assumption-v1',
} as const

export const HISTORICAL_RETURN_SERIES: HistoricalReturnSeries[] = [
  ...HISTORICAL_PRODUCTION_RETURN_SERIES,
]

export const HISTORICAL_INFLATION_SERIES: InflationSeries[] = [
  ...HISTORICAL_PRODUCTION_INFLATION_SERIES,
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

export const SYNTHETIC_RETURN_SERIES: SyntheticReturnSeries[] = ASSET_CLASS_ASSUMPTIONS.map((assumption) =>
  createSyntheticReturnSeries(assumption),
)

export function findHistoricalReturnSeries(id: string): HistoricalReturnSeries | undefined {
  return HISTORICAL_RETURN_SERIES.find((series) => series.id === id)
}

export function findSyntheticReturnSeries(id: string): SyntheticReturnSeries | undefined {
  return SYNTHETIC_RETURN_SERIES.find((series) => series.id === id)
}

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

export function getInflationSourceOptions(annualInflationRate: number): InflationSourceOption[] {
  return [createFixedInflationSource(annualInflationRate), ...HISTORICAL_INFLATION_SERIES]
}

export function findInflationSourceOption(
  id: string,
  annualInflationRate: number,
): InflationSourceOption | undefined {
  return id === FIXED_INFLATION_SOURCE_ID ? createFixedInflationSource(annualInflationRate) : findInflationSeries(id)
}

export function getReturnSeriesOptionsForRole(
  role: PortfolioComponentRole,
  manualCashRealReturn: number,
): ReturnSeriesOption[] {
  const datasetRole = role === 'bond' ? 'bond' : role === 'cash' ? 'cash' : role === 'equity' ? 'equity' : 'other'
  const options: ReturnSeriesOption[] = HISTORICAL_RETURN_SERIES.filter((series) =>
    series.suitableFor.includes(datasetRole),
  )
  const syntheticSeries = SYNTHETIC_RETURN_SERIES.find((series) => series.suitableFor.includes(datasetRole))
  if (syntheticSeries) {
    options.push(syntheticSeries)
  }

  if (role === 'cash') {
    options.push(createManualFixedRealReturnSeries(manualCashRealReturn))
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

export function sampleHistoricalYearsWithReplacement(years: number[], count: number, seed: number): number[] {
  if (years.length === 0 && count > 0) {
    throw new Error('Historical bootstrap needs at least one valid sample year.')
  }

  const rng = createSeededRandom(seed)
  return Array.from({ length: count }, () => years[Math.floor(rng() * years.length)])
}

export function generateHistoricalReturnPath(
  components: PortfolioComponent[],
  inflationSource: InflationSourceOption,
  sampledYears: number[],
  manualCashRealReturn: number,
  rng: () => number = createSeededRandom(0),
): number[] {
  return sampledYears.map((year) => {
    const inflation = resolveInflationForSampledYear(inflationSource, year)

    return components.reduce((portfolioReturn, component) => {
      if (component.weight === 0) {
        return portfolioReturn
      }

      const annualReturn = resolveComponentNominalReturn(component, year, inflation, manualCashRealReturn, rng)
      return portfolioReturn + component.weight * annualReturn
    }, 0)
  })
}

export function createHistoricalBootstrapSeed(input: RentenlueckeInput, settings: HistoricalBootstrapSettings): number {
  return hashString(
    stableStringify({
      input,
      inflationSourceId: settings.inflationSourceId,
      manualCashRealReturn: settings.manualCashRealReturn,
      simulations: settings.simulations,
      portfolioComponents: settings.portfolioComponents.map((component) => ({
        id: component.id,
        role: component.role,
        weight: component.weight,
        returnSeriesId: component.returnSeriesId,
        datasetVersion: getHistoricalDatasetVersion(component.returnSeriesId),
      })),
      inflationVersion: getInflationSourceVersion(settings.inflationSourceId, input.annualInflationRate),
    }),
  )
}

export function simulateHistoricalBootstrapScenario(
  input: RentenlueckeInput,
  settings: HistoricalBootstrapSettings,
): SimulationResult & { metadata: HistoricalBootstrapMetadata } {
  const inflationSource = getRequiredInflationSource(settings.inflationSourceId, input.annualInflationRate)
  const validYears = getValidHistoricalYears(settings.portfolioComponents, inflationSource)
  const baseline = simulateScenarioWithReturnPath(input, [])
  const seed = createHistoricalBootstrapSeed(input, { ...settings, simulations: 1 })
  const sampledYears = sampleHistoricalYearsForPath(settings.portfolioComponents, inflationSource, validYears, baseline.rows.length, seed)
  const returnPath = generateHistoricalReturnPath(
    settings.portfolioComponents,
    inflationSource,
    sampledYears,
    settings.manualCashRealReturn,
    createSeededRandom(seed),
  )
  const inflationPath = generateHistoricalInflationPath(inflationSource, sampledYears)

  return {
    ...simulateScenarioWithReturnPath(input, returnPath, inflationPath),
    metadata: { validYears, sampledYears, seed },
  }
}

export function simulateHistoricalBootstrapReferenceScenario(
  input: RentenlueckeInput,
  settings: HistoricalBootstrapSettings,
): SimulationResult & { metadata: HistoricalBootstrapMetadata } {
  const inflationSource = getRequiredInflationSource(settings.inflationSourceId, input.annualInflationRate)
  const baseline = simulateScenario(input)
  const validYears = getValidHistoricalYears(settings.portfolioComponents, inflationSource)
  const seed = createHistoricalBootstrapSeed(input, { ...settings, simulations: 1 })
  const sampledYears = sampleHistoricalYearsForPath(
    settings.portfolioComponents,
    inflationSource,
    validYears,
    baseline.rows.length,
    seed,
  )

  return {
    ...simulateScenarioWithReturnPath(input, [], generateHistoricalInflationPath(inflationSource, sampledYears)),
    metadata: { validYears, sampledYears, seed },
  }
}

export function runHistoricalBootstrapSimulation(
  input: RentenlueckeInput,
  settings: HistoricalBootstrapSettings,
): HistoricalBootstrapSimulationSummary {
  const inflationSource = getRequiredInflationSource(settings.inflationSourceId, input.annualInflationRate)
  const baseline = simulateScenario(input)
  const validYears = getValidHistoricalYears(settings.portfolioComponents, inflationSource)
  const years = baseline.rows.length
  const seed = createHistoricalBootstrapSeed(input, settings)
  const rng = createSeededRandom(seed)
  const referenceSampledYears = sampleHistoricalYearsForPath(
    settings.portfolioComponents,
    inflationSource,
    validYears,
    years,
    createHistoricalBootstrapSeed(input, { ...settings, simulations: 1 }),
  )
  const referenceResult = simulateHistoricalBootstrapReferenceScenario(input, settings)
  const pathResults = Array.from({ length: settings.simulations }, () => {
    const pathSeed = Math.floor(rng() * 4_294_967_296)
    const returnSeed = Math.floor(rng() * 4_294_967_296)
    const sampledYears = sampleHistoricalYearsForPath(settings.portfolioComponents, inflationSource, validYears, years, pathSeed)
    const returnPath = generateHistoricalReturnPath(
      settings.portfolioComponents,
      inflationSource,
      sampledYears,
      settings.manualCashRealReturn,
      createSeededRandom(returnSeed),
    )
    const inflationPath = generateHistoricalInflationPath(inflationSource, sampledYears)

    return simulateScenarioWithReturnPath(input, returnPath, inflationPath)
  })
  const successfulPaths = pathResults.filter((result) => result.summary.survivesUntilPlanningAge).length
  const rows = referenceResult.rows.map((referenceRow, rowIndex) => {
    const capitalValues = pathResults.map((result) => result.rows[rowIndex]?.closingCapitalToday ?? 0).sort((a, b) => a - b)
    const depletedCount = capitalValues.filter((value) => value <= 0).length

    return {
      ageStart: referenceRow.ageStart,
      ageEnd: referenceRow.ageEnd,
      planCapitalToday: referenceRow.closingCapitalToday,
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
    metadata: {
      validYears,
      sampledYears: referenceSampledYears,
      seed,
    },
  }
}

function getRequiredInflationSource(id: string, annualInflationRate: number): InflationSourceOption {
  const inflationSource = findInflationSourceOption(id, annualInflationRate)
  if (!inflationSource) {
    throw new Error(`Unknown inflation source: ${id}`)
  }

  return inflationSource
}

function generateHistoricalInflationPath(inflationSource: InflationSourceOption, sampledYears: number[]): number[] {
  return sampledYears.map((year) => resolveInflationForSampledYear(inflationSource, year))
}

function sampleHistoricalYearsForPath(
  components: PortfolioComponent[],
  inflationSource: InflationSourceOption,
  validYears: number[],
  count: number,
  seed: number,
): number[] {
  if (validYears.length === 0 && !requiresSampledCalendarYear(components, inflationSource)) {
    return Array.from({ length: count }, (_, index) => index)
  }

  return sampleHistoricalYearsWithReplacement(validYears, count, seed)
}

function requiresSampledCalendarYear(components: PortfolioComponent[], inflationSource: InflationSourceOption): boolean {
  return !isFixedInflationSource(inflationSource) || components.some((component) => {
    return Boolean(component.returnSeriesId && !isSyntheticReturnSeriesId(component.returnSeriesId))
  })
}

function resolveInflationForSampledYear(inflationSource: InflationSourceOption, year: number): number {
  if (isFixedInflationSource(inflationSource)) {
    return inflationSource.annualInflationRate
  }

  const inflation = inflationSource.annualInflation[year]
  if (!Number.isFinite(inflation)) {
    throw new Error(`Missing ${inflationSource.label} inflation for ${year}`)
  }

  return inflation
}

function resolveComponentNominalReturn(
  component: PortfolioComponent,
  year: number,
  inflation: number,
  manualCashRealReturn: number,
  rng: () => number,
): number {
  if (component.returnSeriesId === 'manual-fixed-real') {
    return realToNominalReturn(manualCashRealReturn, inflation)
  }

  const syntheticSeries = component.returnSeriesId ? findSyntheticReturnSeries(component.returnSeriesId) : undefined
  if (syntheticSeries) {
    return Math.max(-1, sampleNormal(rng, syntheticSeries.expectedAnnualReturn, syntheticSeries.annualVolatility))
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

function createSyntheticReturnSeries(assumption: AssetClassAssumption): SyntheticReturnSeries {
  const role = assumption.key === 'bonds' ? 'bond' : assumption.key === 'fixed' ? 'cash' : 'equity'
  const expectedPercent = formatAssumptionPercent(assumption.expectedAnnualReturn)
  const volatilityPercent = formatAssumptionPercent(assumption.annualVolatility)

  return {
    id: SYNTHETIC_RETURN_SERIES_IDS[role],
    kind: 'synthetic',
    label: `Synthetisch: ${assumption.label} (${expectedPercent} Erwartung, ${volatilityPercent} Volatilität)`,
    description:
      'Synthetischer Renditepfad aus einer vereinfachten Normalverteilung. Gedacht für What-if-Annahmen oder Anlageklassen ohne gute historische Reihe.',
    suitableFor: [role],
    returnBasis: 'nominal',
    assumptionKey: assumption.key,
    expectedAnnualReturn: assumption.expectedAnnualReturn,
    annualVolatility: assumption.annualVolatility,
    sourceDatasetVersion: SYNTHETIC_RETURN_ASSUMPTIONS_VERSION,
    caveats: ['Synthetic source. It does not restrict the usable historical sample years.'],
  }
}

function isSyntheticReturnSeriesId(id: string): boolean {
  return id === 'manual-fixed-real' || Boolean(findSyntheticReturnSeries(id))
}

export function isFixedInflationSource(source: InflationSourceOption): source is FixedInflationSource {
  return 'kind' in source && source.kind === 'fixed'
}

function formatAssumptionPercent(value: number): string {
  return `${Math.round(value * 100)} %`
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

export function getHistoricalDatasetVersion(id?: string): string {
  if (!id) {
    return 'missing'
  }

  if (id === 'manual-fixed-real') {
    return id
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
