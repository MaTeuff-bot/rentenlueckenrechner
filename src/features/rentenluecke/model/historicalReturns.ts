export {
  CASH_MODES,
  CASH_MODE_CONSTANT,
  CASH_MODE_HISTORICAL,
  CASH_MODE_REAL,
  CASH_PLANNING_RATE_PROPOSAL,
  CASH_REAL_RATE_PROPOSAL,
  DEFAULT_CASH_MODE,
  DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
  DEFAULT_HISTORICAL_RETURN_SERIES_IDS,
  FIXED_INFLATION_SOURCE_ID,
  HISTORICAL_DEPOSIT_STRATEGY_SOURCE_ID,
  HISTORICAL_DEPOSIT_STRATEGY_VERSION,
  HISTORICAL_MINIMUM_OBSERVATIONS,
  PLANNING_RATE_SOURCE_ID,
  PLANNING_RATE_SOURCE_VERSION,
  REAL_ASSUMPTION_SOURCE_ID,
  REAL_ASSUMPTION_SOURCE_VERSION,
  SYNTHETIC_RETURN_ASSUMPTIONS_VERSION,
  SYNTHETIC_RETURN_SERIES_IDS,
} from './historicalReturns/constants'
export type { CashMode } from './historicalReturns/constants'
export {
  HISTORICAL_RETURN_SERIES,
  PLANNING_RATE_RETURN_SERIES,
  REAL_ASSUMPTION_RETURN_SERIES,
  SYNTHETIC_RETURN_SERIES,
  findHistoricalReturnSeries,
  findPlanningRateReturnSeries,
  findSyntheticReturnSeries,
  isConstantPlanningRateReturnSeriesId,
  isPlanningRateReturnSeriesId,
  isRealAssumptionReturnSeriesId,
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
  getReturnSeriesCategory,
  getReturnSeriesOptions,
  getReturnSeriesOptionsForRole,
  getValidHistoricalYears,
} from './historicalReturns/sourceOptions'
export type { ReturnSeriesCategory } from './historicalReturns/sourceOptions'
export {
  CASH_PLANNING_RATE_ERROR,
  CASH_REAL_RATE_ERROR,
  applyDepositZeroFloor,
  generateHistoricalReturnPath,
  realTargetToNominalWithFloor,
  resolveCashPlanningRateOrThrow,
  resolveCashRealRateOrThrow,
  resolveComponentExpectedNominalReturn,
  resolveComponentNominalReturn,
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
  PlanningRateReturnSeries,
  InflationSeries,
  InflationSourceOption,
  ReturnBasis,
  ReturnSourceKind,
  CostTreatment,
  ReturnSeriesOption,
  ReturnType,
  SyntheticReturnSeries,
} from './historicalReturns/types'
