import type { RentenlueckeInput } from '../types'
import { portfolioEstimatorReadiness } from './portfolioEstimator'

export function capitalMode(phase: { capitalMode?: 'automatic' | 'manual'; capitalMonthlyToday?: number }) {
  return phase.capitalMode ?? (phase.capitalMonthlyToday !== undefined ? 'manual' : 'automatic')
}

export function needsDetailedPortfolio(_input: RentenlueckeInput): boolean {
  void _input
  return true
}

export function needsEstimator(input: RentenlueckeInput): boolean {
  return needsDetailedPortfolio(input)
}

export function estimatorSetupIssues(input: RentenlueckeInput): string[] {
  return portfolioEstimatorReadiness(
    input.retirementInsurance?.capitalEstimator,
    input.estimatorPortfolio,
    input.currentCapital,
  ).issues
}
