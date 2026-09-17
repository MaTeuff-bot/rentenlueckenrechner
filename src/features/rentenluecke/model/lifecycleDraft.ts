import type { LifecycleBucketKind, Milestone } from './lifecycleAllocation/types.js'
import { prefillTargetsFromHoldings } from './lifecycleAllocation/prefill.js'
import { validateLifecycleConfig } from './lifecycleAllocation/targets.js'
import type { LifecycleConfig } from './lifecycleAllocation/types.js'
import type { PortfolioBucket } from './portfolioBuckets.js'
import { calculatePortfolioBucketTotal } from './portfolioBuckets.js'
import { DEFAULT_PROJECTED_BASIS_RATE } from './capitalIncome/schema.js'

export type LifecycleClassification = LifecycleBucketKind
export type LifecycleTaxSettings = {
  allowanceAnnualToday?: number
  churchRate?: 0 | 0.08 | 0.09
  basisRate?: number
  expenseAllowanceAnnualToday?: number
}
export const LIFECYCLE_ALLOWANCE_DEFAULT = 1000
export const LIFECYCLE_CHURCH_DEFAULT = 0 as const
export const LIFECYCLE_BASIS_DEFAULT = DEFAULT_PROJECTED_BASIS_RATE
export const LIFECYCLE_REFERENCE_PRICE = 100
export function createDefaultLifecycleTaxSettings(): LifecycleTaxSettings {
  return {
    allowanceAnnualToday: LIFECYCLE_ALLOWANCE_DEFAULT,
    churchRate: LIFECYCLE_CHURCH_DEFAULT,
    basisRate: LIFECYCLE_BASIS_DEFAULT,
  }
}
export function validateLifecycleTaxSettings(settings: LifecycleTaxSettings): string | null {
  const allowance = settings.allowanceAnnualToday
  if (allowance === undefined || typeof allowance !== 'number' || !Number.isFinite(allowance) || allowance < 0) {
    return 'Sparer-Pauschbetrag heute angeben (auch 0 ausdrücklich).'
  }
  if (settings.churchRate !== 0 && settings.churchRate !== 0.08 && settings.churchRate !== 0.09) {
    return 'Kirchensteuersatz wählen (0 %, 8 % oder 9 %).'
  }
  const basis = settings.basisRate
  if (basis === undefined || typeof basis !== 'number' || !Number.isFinite(basis) || basis < -1 || basis > 1) {
    return 'Basiszins prüfen und ausdrücklich bestätigen (erweitert änderbar).'
  }
  const expense = settings.expenseAllowanceAnnualToday
  if (expense !== undefined && (typeof expense !== 'number' || !Number.isFinite(expense) || expense < 0)) {
    return 'Werbungskosten-Pauschale muss mindestens 0 sein.'
  }
  return null
}
export function classificationIssues(
  portfolioBuckets: PortfolioBucket[],
  classification: Record<string, LifecycleClassification | undefined>,
): string[] {
  const issues: string[] = []
  for (const bucket of portfolioBuckets) {
    const kind = classification[bucket.id]
    if (kind !== 'equityFund' && kind !== 'bondFund' && kind !== 'deposit') {
      issues.push(`Anlage ${bucket.name}: Steuerklasse ausdrücklich wählen (Aktienfonds, Rentenfonds oder Einlage).`)
    }
  }
  return issues
}
export function basisIssues(
  portfolioBuckets: PortfolioBucket[],
  classification: Record<string, LifecycleClassification | undefined>,
  acquisitionCost: Record<string, number | undefined>,
): string[] {
  const issues: string[] = []
  for (const bucket of portfolioBuckets) {
    const kind = classification[bucket.id]
    if (kind !== 'equityFund' && kind !== 'bondFund') continue
    const cost = acquisitionCost[bucket.id]
    if (cost === undefined || typeof cost !== 'number' || !Number.isFinite(cost) || cost < 0) {
      issues.push(`Anlage ${bucket.name}: Anschaffungskosten ausdrücklich angeben (auch 0).`)
    }
  }
  return issues
}
export function taxCashIssues(
  portfolioBuckets: PortfolioBucket[],
  classification: Record<string, LifecycleClassification | undefined>,
  taxCashId: string | undefined,
): string[] {
  if (!taxCashId) return ['Steuer-Cash-Konto wählen.']
  const bucket = portfolioBuckets.find((b) => b.id === taxCashId)
  if (!bucket) return ['Steuer-Cash-Konto ist unbekannt.']
  if (classification[taxCashId] !== 'deposit') return ['Steuer-Cash-Konto muss eine Einlage sein.']
  return []
}
export function buildLifecycleBuckets(
  portfolioBuckets: PortfolioBucket[],
  classification: Record<string, LifecycleClassification | undefined>,
): { id: string; name: string; kind: LifecycleClassification; priority: number }[] {
  return portfolioBuckets.map((bucket, index) => {
    const kind = classification[bucket.id]
    if (kind !== 'equityFund' && kind !== 'bondFund' && kind !== 'deposit') {
      throw new Error(`Anlage ${bucket.name.trim() || bucket.id}: Steuerklasse ausdrücklich wählen (Aktienfonds, Rentenfonds oder Einlage).`)
    }
    return { id: bucket.id, name: bucket.name.trim() || `Anlage ${index + 1}`, kind, priority: index + 1 }
  })
}
export function holdingsValuesToday(portfolioBuckets: PortfolioBucket[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const bucket of portfolioBuckets) out[bucket.id] = Math.max(0, bucket.value)
  return out
}
export function kindsRecord(
  portfolioBuckets: PortfolioBucket[],
  classification: Record<string, LifecycleClassification | undefined>,
): Record<string, LifecycleBucketKind> {
  const out: Record<string, LifecycleBucketKind> = {}
  for (const bucket of portfolioBuckets) {
    const kind = classification[bucket.id]
    if (kind) out[bucket.id] = kind
  }
  return out
}
export function createInitialLifecycleMilestones(
  currentAge: number,
  retirementAge: number,
  portfolioBuckets: PortfolioBucket[],
  classification: Record<string, LifecycleClassification | undefined>,
): { milestones: Milestone[]; transitions: LifecycleConfig['transitions'] } {
  const values = holdingsValuesToday(portfolioBuckets)
  const kinds = kindsRecord(portfolioBuckets, classification)
  const total = calculatePortfolioBucketTotal(portfolioBuckets)
  const targetsFor = (label: string): Milestone['targets'] => {
    if (total > 0) {
      try {
        return prefillTargetsFromHoldings(values, kinds)
      } catch {
        throw new Error(`Prefill ${label} needs positive total wealth`)
      }
    }
    const targets: Milestone['targets'] = {}
    for (const bucket of portfolioBuckets) targets[bucket.id] = { role: 'percent', share: 0 }
    return targets
  }
  const accumulates = { name: 'Ansparen', startAge: currentAge, targets: targetsFor('Ansparen') }
  const retired = { name: 'Ruhestand', startAge: retirementAge, targets: targetsFor('Ruhestand') }
  return {
    milestones: [accumulates, retired],
    transitions: [{ fromMilestone: 'Ansparen', toMilestone: 'Ruhestand', startAge: retirementAge, durationYears: 0 }],
  }
}
export function rePrefillLifecycleMilestones(
  milestones: Milestone[],
  portfolioBuckets: PortfolioBucket[],
  classification: Record<string, LifecycleClassification | undefined>,
): Milestone[] {
  const values = holdingsValuesToday(portfolioBuckets)
  const kinds = kindsRecord(portfolioBuckets, classification)
  const fresh = prefillTargetsFromHoldings(values, kinds)
  return milestones.map((milestone, index) => (index === 0 ? { ...milestone, targets: { ...fresh } } : milestone))
}
export function syncLifecycleMaps(
  portfolioBuckets: PortfolioBucket[],
  classification: Record<string, LifecycleClassification | undefined>,
  acquisitionCost: Record<string, number | undefined>,
): { classification: Record<string, LifecycleClassification | undefined>; acquisitionCost: Record<string, number | undefined> } {
  const nextClassification: Record<string, LifecycleClassification | undefined> = {}
  const nextCost: Record<string, number | undefined> = {}
  for (const bucket of portfolioBuckets) {
    nextClassification[bucket.id] = classification[bucket.id]
    nextCost[bucket.id] = acquisitionCost[bucket.id]
  }
  return { classification: nextClassification, acquisitionCost: nextCost }
}
export function validateLifecycleMilestones(
  milestones: Milestone[] | undefined,
  transitions: LifecycleConfig['transitions'] | undefined,
  buckets: { id: string; name: string; kind: LifecycleClassification; priority: number }[],
  taxCashId: string | undefined,
): string | null {
  if (!milestones || !transitions || !taxCashId) return 'Meilensteine, Übergänge und Cash-Konto vervollständigen.'
  const config: LifecycleConfig = {
    buckets: buckets.map((b) => ({ id: b.id, name: b.name, kind: b.kind, priority: b.priority })),
    milestones,
    transitions,
    taxCashId,
  }
  return validateLifecycleConfig(config)
}
