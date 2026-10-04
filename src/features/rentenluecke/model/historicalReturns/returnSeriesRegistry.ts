import { ASSET_CLASS_ASSUMPTIONS } from '../stochasticAssumptions'
import type { AssetClassAssumption } from '../stochasticReturns'
import { HISTORICAL_PRODUCTION_RETURN_SERIES } from '../returnData/historicalProductionData'
import { BUNDLED_ETF_HISTORICAL_RETURN_SERIES } from '../returnData/bundledEtfHistoricalReturnData'
import {
  PLANNING_RATE_SOURCE_ID,
  PLANNING_RATE_SOURCE_VERSION,
  SYNTHETIC_RETURN_ASSUMPTIONS_VERSION,
  SYNTHETIC_RETURN_SERIES_IDS,
} from './constants'
import type { HistoricalReturnSeries, PlanningRateReturnSeries, SyntheticReturnSeries } from './types'

export const HISTORICAL_RETURN_SERIES: HistoricalReturnSeries[] = [
  ...HISTORICAL_PRODUCTION_RETURN_SERIES,
  ...BUNDLED_ETF_HISTORICAL_RETURN_SERIES,
]

export const SYNTHETIC_RETURN_SERIES: SyntheticReturnSeries[] = ASSET_CLASS_ASSUMPTIONS.map((assumption) =>
  createSyntheticReturnSeries(assumption),
)

export function findHistoricalReturnSeries(id: string): HistoricalReturnSeries | undefined {
  return HISTORICAL_RETURN_SERIES.find((series) => series.id === id)
}

export function findSyntheticReturnSeries(id: string): SyntheticReturnSeries | undefined {
  return SYNTHETIC_RETURN_SERIES.find((series) => series.id === id)
}

export function isSyntheticReturnSeriesId(id: string): boolean {
  return Boolean(findSyntheticReturnSeries(id))
}

export const PLANNING_RATE_RETURN_SERIES: PlanningRateReturnSeries = {
  id: PLANNING_RATE_SOURCE_ID,
  kind: 'planningRate',
  sourceKind: 'planningRate',
  costTreatment: 'deductBucketAnnualCost',
  label: 'Tagesgeld-Planungszins (konstant, nominal)',
  description:
    'Konstanter nominaler Tagesgeld-Planungszins aus den Rechenannahmen für alle Jahre, Pfade und Bankeinlagen. Kein Marktproxy, keine Zinsunsicherheit in den Bändern.',
  suitableFor: ['cash'],
  returnBasis: 'nominal',
  annualVolatility: 0,
  sourceDatasetVersion: PLANNING_RATE_SOURCE_VERSION,
  caveats: [
    'Konstanter Planungszins aus den Rechenannahmen; Ergebnisbänder enthalten keine Zinsunsicherheit.',
    'Brutto nominal; Bucket-Kosten werden separat abgezogen.',
  ],
}

export function findPlanningRateReturnSeries(id: string): PlanningRateReturnSeries | undefined {
  return id === PLANNING_RATE_SOURCE_ID ? PLANNING_RATE_RETURN_SERIES : undefined
}

export function isPlanningRateReturnSeriesId(id: string): boolean {
  return id === PLANNING_RATE_SOURCE_ID
}

function createSyntheticReturnSeries(assumption: AssetClassAssumption): SyntheticReturnSeries {
  const role = assumption.key === 'bonds' ? 'bond' : assumption.key === 'fixed' ? 'cash' : 'equity'
  const expectedPercent = formatAssumptionPercent(assumption.expectedAnnualReturn)
  const volatilityPercent = formatAssumptionPercent(assumption.annualVolatility)

  return {
    id: SYNTHETIC_RETURN_SERIES_IDS[role],
    kind: 'synthetic',
    sourceKind: 'synthetic',
    costTreatment: 'deductBucketAnnualCost',
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

function formatAssumptionPercent(value: number): string {
  return `${Math.round(value * 100)} %`
}
