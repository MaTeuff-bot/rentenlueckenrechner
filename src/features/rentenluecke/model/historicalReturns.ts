export {
  DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
  DEFAULT_HISTORICAL_RETURN_SERIES_IDS,
  FIXED_INFLATION_SOURCE_ID,
  HISTORICAL_MINIMUM_OBSERVATIONS,
  SYNTHETIC_RETURN_ASSUMPTIONS_VERSION,
  SYNTHETIC_RETURN_SERIES_IDS,
} from './historicalReturns/constants'
export {
  HISTORICAL_RETURN_SERIES,
  SYNTHETIC_RETURN_SERIES,
  createManualFixedRealReturnSeries,
  findHistoricalReturnSeries,
  findSyntheticReturnSeries,
} from './historicalReturns/returnSeriesRegistry'
export {
  HISTORICAL_INFLATION_SERIES,
  createFixedInflationSource,
  findInflationSeries,
  findInflationSourceOption,
  isFixedInflationSource,
} from './historicalReturns/inflationSeriesRegistry'
export {
  getHistoricalDatasetVersion,
  getInflationSourceOptions,
  getInflationSourceVersion,
  getReturnSeriesOptionsForRole,
  getValidHistoricalYears,
} from './historicalReturns/sourceOptions'
export {
  generateHistoricalReturnPath,
  sampleHistoricalYearsWithReplacement,
} from './historicalReturns/bootstrapSampling'
export { calculateExpectedAnnualReturnForSelection } from './historicalReturns/expectedReturns'
export { createHistoricalBootstrapSeed } from './historicalReturns/seed'
export {
  runHistoricalBootstrapSimulation,
  simulateHistoricalBootstrapReferenceScenario,
  simulateHistoricalBootstrapScenario,
} from './historicalReturns/bootstrapSimulation'
export type {
  DatasetConfidence,
  DatasetCountryCoverage,
  DatasetCurrency,
  DatasetGeography,
  DatasetRole,
  DatasetSource,
  FixedInflationSource,
  HistoricalBootstrapMetadata,
  HistoricalBootstrapSettings,
  HistoricalBootstrapSimulationSummary,
  HistoricalReturnSeries,
  InflationSeries,
  InflationSourceOption,
  ManualFixedReturnSeries,
  ReturnBasis,
  ReturnSeriesOption,
  ReturnType,
  SyntheticReturnSeries,
} from './historicalReturns/types'
