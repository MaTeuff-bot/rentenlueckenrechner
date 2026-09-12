import { phaseManualReasons, phaseStreams } from '../retirementInsurance'
import { getReturnSeriesCategory, getReturnSeriesOptions } from '../historicalReturns/sourceOptions'
import type { RentenlueckeInput } from '../types'

export function capitalMode(phase: { capitalMode?: 'automatic' | 'manual'; capitalMonthlyToday?: number }) {
  // Existing explicit estimates remain manual. New unanswered phases start automatic.
  return phase.capitalMode ?? (phase.capitalMonthlyToday !== undefined ? 'manual' : 'automatic')
}
export function needsEstimator(input: RentenlueckeInput) {
  const i = input.retirementInsurance
  if (!i) return false
  return (['bridge', 'pension'] as const).some(key => {
    const p = i[key]
    const active = key === 'bridge' ? input.retirementAge < (i.pensionAge ?? input.retirementAge) : (i.pensionAge ?? input.retirementAge) < input.planningAge
    return active && !phaseManualReasons(i, key, phaseStreams(input.retirementIncomeStreams ?? [], i, key, input.retirementAge, input.planningAge)).length && (p.status === 'voluntary' || p.status === 'unknown') && capitalMode(p) === 'automatic'
  })
}
export function estimatorSetupIssues(input: RentenlueckeInput): string[] {
  if (!needsEstimator(input)) return []
  const issues: string[] = []
  const setup = input.retirementInsurance?.capitalEstimator
  const buckets = input.estimatorPortfolio
  if (buckets?.length && buckets.reduce((sum, b) => sum + b.value, 0) === 0) issues.push('Automatische Kapitalbasis benötigt eine positive Ausgangsallokation; Portfoliowerte angeben oder ausdrücklich eine manuelle Kapitalertragsschätzung wählen.')
  if (buckets && Math.abs(buckets.reduce((sum, b) => sum + b.value, 0) - input.currentCapital) > 0.01) issues.push('Portfoliowerte und Ausgangskapital müssen übereinstimmen.')
  if (!buckets?.length || buckets.some(b => !b.holding || b.holding === 'unsupported')) issues.push('Automatische Kapitalbasis: alle tatsächlichen Anlagen klassifizieren; nicht unterstützte Anlagen entfernen/ersetzen oder ausdrücklich eine manuelle Kapitalertragsschätzung wählen. Das Portfolio bleibt dabei erhalten.')
  if (buckets?.some(b => b.holding === 'accumulating-equity-fund') && setup?.fundAcquisitionCost === undefined) issues.push('Anschaffungskosten des gesamten Fondspools in Euro angeben (auch 0 ausdrücklich).')
  if (buckets?.some(b => b.holding === 'ordinary-bank-deposit' && (getReturnSeriesCategory(b.returnSeriesId) !== 'cash' || getReturnSeriesOptions().find(s => s.id === b.returnSeriesId)?.costTreatment === 'netOfFundCosts'))) issues.push('Bankeinlagen benötigen eine Brutto-Zinsquelle (Cash-Proxy), keine Fonds- oder Kursrendite. Quelle ersetzen oder manuelle Kapitalbasis wählen.')
  if (!setup?.scopeConfirmed) issues.push('Unterstützten persönlichen Anlageumfang bestätigen.')
  if (!setup?.lossScopeConfirmed) issues.push('Keine bisherigen Kapitalverluste oder externen Verlustverrechnungen bestätigen; andernfalls manuelle Kapitalbasis wählen.')
  return issues
}
