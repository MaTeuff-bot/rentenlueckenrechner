import type { AssetClassKey, PortfolioComponent, StochasticPercentileRow } from '../stochasticReturns'
import type { RentenlueckeInput, SimulationResult } from '../types'

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

export type ReturnSeriesOption = HistoricalReturnSeries | SyntheticReturnSeries

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
  id: 'fixed-manual'
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

export type HistoricalBootstrapScenarioResult = SimulationResult & { metadata: HistoricalBootstrapMetadata }

export type HistoricalBootstrapSeedInput = {
  input: RentenlueckeInput
  settings: HistoricalBootstrapSettings
}
