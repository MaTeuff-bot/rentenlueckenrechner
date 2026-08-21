import type { AssetAllocation, PortfolioComponent } from './stochasticReturns'

export type PortfolioBucketRole = 'equity' | 'bond' | 'cash'

export type PortfolioBucket = {
  id: string
  name: string
  value: number
  role: PortfolioBucketRole
}

type ReturnSeriesIds = Partial<Record<PortfolioBucketRole, string>>

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
    if (bucket.value > 0) allocation[ROLE_CONFIG[bucket.role].allocationKey] += bucket.value / total
  }
  return allocation
}

export function validatePortfolioBuckets(buckets: PortfolioBucket[]): string | null {
  for (const bucket of buckets) {
    if (!Number.isFinite(bucket.value) || bucket.value < 0) {
      return 'Alle Portfolio-Werte müssen gültige, nicht negative Zahlen sein.'
    }
    if (!(bucket.role in ROLE_CONFIG)) return 'Jeder Portfolio-Baustein muss eine gültige Rolle haben.'
  }
  if (calculatePortfolioBucketTotal(buckets) <= 0) return 'Der Gesamtwert des Portfolios muss größer als 0 sein.'
  return null
}

export function createPortfolioComponentsFromBuckets(
  buckets: PortfolioBucket[],
  returnSeriesIds: ReturnSeriesIds,
): PortfolioComponent[] {
  const total = calculatePortfolioBucketTotal(buckets)
  if (total <= 0) return []

  return buckets.flatMap((bucket) => {
    if (bucket.value <= 0) return []
    const config = ROLE_CONFIG[bucket.role]
    return [{
      id: bucket.id,
      label: bucket.name.trim() || config.defaultLabel,
      role: bucket.role,
      weight: bucket.value / total,
      returnSeriesId: returnSeriesIds[bucket.role],
    }]
  })
}

export function createDefaultPortfolioBuckets(
  currentCapital: number,
  allocation: AssetAllocation,
): PortfolioBucket[] {
  const roles: PortfolioBucketRole[] = ['equity', 'bond', 'cash']
  const allocationTotal = allocation.equity + allocation.bonds + allocation.fixed
  if (allocationTotal <= 0) return []
  const normalizationFactor = Math.abs(allocationTotal - 1) < 1e-12 ? 1 : allocationTotal

  return roles.flatMap((role) => {
    const config = ROLE_CONFIG[role]
    const weight = allocation[config.allocationKey] / normalizationFactor
    return weight === 0
      ? []
      : [{ id: config.defaultId, name: config.defaultLabel, value: currentCapital * weight, role }]
  })
}
