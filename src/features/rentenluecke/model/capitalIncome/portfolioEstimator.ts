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
  if (list.length && total === 0) issues.push('Automatische Kapitalbasis benötigt eine positive Ausgangsallokation; Portfoliowerte angeben oder ausdrücklich eine manuelle Kapitalertragsschätzung wählen.')
  if (list.length && currentCapital !== undefined && Number.isFinite(currentCapital) && Math.abs(total - currentCapital) > 0.01) issues.push('Portfoliowerte und Ausgangskapital müssen übereinstimmen.')
  if (!list.length || list.some(b => !b.holding || b.holding === 'unsupported')) issues.push('Automatische Kapitalbasis: alle tatsächlichen Anlagen klassifizieren; nicht unterstützte Anlagen entfernen/ersetzen oder ausdrücklich eine manuelle Kapitalertragsschätzung wählen. Das Portfolio bleibt dabei erhalten.')
  const needsFundCost = list.some(b => b.holding === 'accumulating-equity-fund')
  if (needsFundCost && !isValidFundCost(settings?.fundAcquisitionCost)) issues.push('Anschaffungskosten des gesamten Fondspools in Euro angeben (auch 0 ausdrücklich).')
  if (list.some(b => b.holding === 'ordinary-bank-deposit' && (getReturnSeriesCategory(b.returnSeriesId) !== 'cash' || getReturnSeriesOptions().find(s => s.id === b.returnSeriesId)?.costTreatment === 'netOfFundCosts'))) issues.push('Bankeinlagen benötigen eine Brutto-Zinsquelle (Cash-Proxy), keine Fonds- oder Kursrendite. Quelle ersetzen oder manuelle Kapitalbasis wählen.')
  if (!settings?.scopeConfirmed) issues.push('Unterstützten persönlichen Anlageumfang bestätigen.')
  if (!settings?.lossScopeConfirmed) issues.push('Keine bisherigen Kapitalverluste oder externen Verlustverrechnungen bestätigen; andernfalls manuelle Kapitalbasis wählen.')
  if (settings !== undefined && settings.projectedBasisRate !== undefined && !isValidBasisRate(settings.projectedBasisRate)) issues.push('Projizierten Basiszins prüfen (nominal, konstant); ungültigen Wert korrigieren oder manuelle Kapitalbasis wählen.')
  return { ready: issues.length === 0, issues, needsFundCost }
}

export function engineCapitalEstimatorFromPortfolio(
  settings: PortfolioEstimatorSettings | undefined,
  needsAutomatic: boolean,
): PortfolioEstimatorSettings | undefined {
  if (!needsAutomatic) return undefined
  return settings
}

export function extractPortfolioSettingsFromLegacyInsurance(insurance: { capitalEstimator?: PortfolioEstimatorSettings } | undefined): PortfolioEstimatorSettings | undefined {
  return insurance?.capitalEstimator
}
