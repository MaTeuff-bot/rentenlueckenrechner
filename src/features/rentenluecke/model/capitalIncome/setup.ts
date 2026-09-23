import { insurancePhaseRanges, phaseManualReasons, phaseStreams } from '../retirementInsurance'
import type { RentenlueckeInput } from '../types'
import { portfolioEstimatorReadiness } from './portfolioEstimator'

export function capitalMode(phase: { capitalMode?: 'automatic' | 'manual'; capitalMonthlyToday?: number }) {
  // Existing explicit estimates remain manual. New unanswered phases start automatic.
  return phase.capitalMode ?? (phase.capitalMonthlyToday !== undefined ? 'manual' : 'automatic')
}
export function needsEstimator(input: RentenlueckeInput) {
  const i = input.retirementInsurance
  if (!i) return false
  return (['bridge', 'pension'] as const).some(key => {
    const p = i[key]
    const active = insurancePhaseRanges(input, i).some(range => range.phase === key)
    return active && !phaseManualReasons(i, key, phaseStreams(input.retirementIncomeStreams ?? [], i, key, input.retirementAge, input.planningAge)).length && (p.status === 'voluntary' || p.status === 'unknown') && capitalMode(p) === 'automatic'
  })
}
export function estimatorSetupIssues(input: RentenlueckeInput): string[] {
  if (!needsEstimator(input)) return []
  return portfolioEstimatorReadiness(
    input.retirementInsurance?.capitalEstimator,
    input.estimatorPortfolio,
    input.currentCapital,
  ).issues
}
