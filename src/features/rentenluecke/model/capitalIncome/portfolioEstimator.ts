import { DEFAULT_PROJECTED_BASIS_RATE } from './schema'
import { getReturnSeriesCategory, getReturnSeriesOptions } from '../historicalReturns/sourceOptions'

export type PortfolioEstimatorSettings = {
  fundAcquisitionCost?: number
  projectedBasisRate: number
  scopeConfirmed?: boolean
  lossScopeConfirmed?: boolean
}

export type PortfolioEstimatorReadiness = {
  ready: boolean
  issues: string[]
  needsFundCost: boolean
}

export const DEFAULT_PORTFOLIO_ESTIMATOR_SETTINGS: PortfolioEstimatorSettings = {
  projectedBasisRate: DEFAULT_PROJECTED_BASIS_RATE,
}

type EstimatorBucketView = {
  value: number
  holding?: string
  returnSeriesId: string
}

function isValidFundCost(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER
}

function isValidBasisRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -1 && value <= 1
}

export function portfolioEstimatorReadiness(
  settings: PortfolioEstimatorSettings | undefined,
  buckets: readonly EstimatorBucketView[] | undefined,
  currentCapital?: number,
): PortfolioEstimatorReadiness {
  const issues: string[] = []
  const list = (buckets ?? []) as readonly EstimatorBucketView[]
  const total = list.reduce((sum, b) => sum + (typeof b.value === 'number' && Number.isFinite(b.value) ? b.value : 0), 0)
  if (list.length && total === 0) issues.push('Detaillierte Kapitalbasis benötigt eine positive Ausgangsallokation; Portfoliowerte angeben.')
  if (list.length && currentCapital !== undefined && Number.isFinite(currentCapital) && Math.abs(total - currentCapital) > 0.01) issues.push('Portfoliowerte und Ausgangskapital müssen übereinstimmen.')
  if (!list.length || list.some(b => !b.holding || b.holding === 'unsupported')) issues.push('Detaillierte Kapitalbasis: alle tatsächlichen Anlagen klassifizieren; nicht unterstützte Anlagen entfernen/ersetzen.')
  const needsFundCost = list.some(b => b.holding === 'accumulating-equity-fund')
  if (needsFundCost && !isValidFundCost(settings?.fundAcquisitionCost)) issues.push('Anschaffungskosten des gesamten Fondspools in Euro angeben (auch 0 ausdrücklich).')
  if (list.some(b => b.holding === 'ordinary-bank-deposit' && (getReturnSeriesCategory(b.returnSeriesId) !== 'cash' || getReturnSeriesOptions().find(s => s.id === b.returnSeriesId)?.costTreatment === 'netOfFundCosts'))) issues.push('Bankeinlagen benötigen eine Brutto-Zinsquelle (Cash-Proxy), keine Fonds- oder Kursrendite. Quelle ersetzen.')
  if (!settings?.scopeConfirmed) issues.push('Detaillierte Kapitalbasis: unterstützten persönlichen Anlageumfang bestätigen.')
  if (!settings?.lossScopeConfirmed) issues.push('Detaillierte Kapitalbasis: keine bisherigen Kapitalverluste oder externen Verlustverrechnungen bestätigen.')
  if (settings !== undefined && settings.projectedBasisRate !== undefined && !isValidBasisRate(settings.projectedBasisRate)) issues.push('Detaillierte Kapitalbasis: projizierten Basiszins prüfen (nominal, konstant); ungültigen Wert korrigieren.')
  return { ready: issues.length === 0, issues, needsFundCost }
}

export function engineCapitalEstimatorFromPortfolio(
  settings: PortfolioEstimatorSettings | undefined,
  needsDetailed: boolean,
): PortfolioEstimatorSettings | undefined {
  if (!needsDetailed) return undefined
  return settings
}

export function extractPortfolioSettingsFromLegacyInsurance(insurance: { capitalEstimator?: PortfolioEstimatorSettings } | undefined): PortfolioEstimatorSettings | undefined {
  return insurance?.capitalEstimator
}
