import type { AssetAllocation, PortfolioComponent } from './stochasticReturns'
import { DEFAULT_HISTORICAL_RETURN_SERIES_IDS } from './historicalReturns/constants'
import { getReturnSeriesCategory, type ReturnSeriesCategory } from './historicalReturns/sourceOptions'

export type PortfolioBucket = {
  id: string
  name: string
  value: number
  returnSeriesId: string
}

const ROLE_CONFIG = {
  equity: { allocationKey: 'equity', defaultId: 'equity', defaultLabel: 'Aktien' },
  bond: { allocationKey: 'bonds', defaultId: 'bonds', defaultLabel: 'Anleihen' },
  cash: { allocationKey: 'fixed', defaultId: 'fixed', defaultLabel: 'Cash' },
} as const

export function calculatePortfolioBucketTotal(buckets: PortfolioBucket[]): number {
  return buckets.reduce((total, bucket) => total + bucket.value, 0)
}

export function calculateAllocationFromBuckets(buckets: PortfolioBucket[]): AssetAllocation {
  const total = calculatePortfolioBucketTotal(buckets)
  const allocation: AssetAllocation = { equity: 0, bonds: 0, fixed: 0 }
  if (total <= 0) return allocation

  for (const bucket of buckets) {
    const category = getReturnSeriesCategory(bucket.returnSeriesId)
    if (bucket.value > 0 && category) allocation[ROLE_CONFIG[category].allocationKey] += bucket.value / total
  }
  return allocation
}

export function validatePortfolioBuckets(buckets: PortfolioBucket[]): string | null {
  for (const bucket of buckets) {
    if (!Number.isFinite(bucket.value) || bucket.value < 0) {
      return 'Alle Portfolio-Werte müssen gültige, nicht negative Zahlen sein.'
    }
    if (!getReturnSeriesCategory(bucket.returnSeriesId)) return 'Jeder Portfolio-Baustein muss eine gültige Renditequelle haben.'
  }
  if (calculatePortfolioBucketTotal(buckets) <= 0) return 'Der Gesamtwert des Portfolios muss größer als 0 sein.'
  return null
}

export function createPortfolioComponentsFromBuckets(buckets: PortfolioBucket[]): PortfolioComponent[] {
  const total = calculatePortfolioBucketTotal(buckets)
  if (total <= 0) return []

  return buckets.flatMap((bucket) => {
    if (bucket.value <= 0) return []
    const role = getReturnSeriesCategory(bucket.returnSeriesId)
    if (!role) return []
    const config = ROLE_CONFIG[role]
    return [{
      id: bucket.id,
      label: bucket.name.trim() || config.defaultLabel,
      role,
      weight: bucket.value / total,
      returnSeriesId: bucket.returnSeriesId,
    }]
  })
}

export function createDefaultPortfolioBuckets(
  currentCapital: number,
  allocation: AssetAllocation,
): PortfolioBucket[] {
  const categories: ReturnSeriesCategory[] = ['equity', 'bond', 'cash']
  const allocationTotal = allocation.equity + allocation.bonds + allocation.fixed
  if (allocationTotal <= 0) return []
  const normalizationFactor = Math.abs(allocationTotal - 1) < 1e-12 ? 1 : allocationTotal

  return categories.flatMap((category) => {
    const config = ROLE_CONFIG[category]
    const weight = allocation[config.allocationKey] / normalizationFactor
    return weight === 0
      ? []
      : [{ id: config.defaultId, name: config.defaultLabel, value: currentCapital * weight, returnSeriesId: getDefaultReturnSeriesId(category) }]
  })
}

export function scalePortfolioBucketValuesToTotal(
  buckets: PortfolioBucket[],
  currentCapital: number,
): PortfolioBucket[] {
  const total = calculatePortfolioBucketTotal(buckets)
  if (total <= 0) return createDefaultPortfolioBuckets(currentCapital, { equity: 1, bonds: 0, fixed: 0 })
  const scale = currentCapital / total
  return buckets.map((bucket) => ({ ...bucket, value: bucket.value * scale }))
}

export function getDefaultReturnSeriesId(category: ReturnSeriesCategory): string {
  return DEFAULT_HISTORICAL_RETURN_SERIES_IDS[category]
}
