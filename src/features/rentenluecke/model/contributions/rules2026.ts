/** Verified 2026 snapshot; provenance and support contract: docs/gkv-pv-rules-2026.md. */
export const contributionRules2026 = Object.freeze({
  id: 'gkv-pv-2026-reviewed-2026-09-09',
  verifiedOn: '2026-09-09',
  baseYear: 2026,
  kvGeneralRate: 0.146,
  kvReducedRate: 0.14,
  pvBaseRate: 0.036,
  pvChildlessSurcharge: 0.006,
  pvDiscountPerChild: 0.0025,
  monthlyCeiling: 5812.5,
  monthlyVoluntaryMinimum: 1318.33,
  monthlyOccupationalThreshold: 197.75,
})

export interface ContributionThresholds {
  monthlyCeiling: number
  monthlyVoluntaryMinimum: number
  monthlyOccupationalThreshold: number
}

/** Caller supplies the simulation path's cumulative inflation factor, including 1 in base year. */
export function indexedContributionThresholds(factor: number): ContributionThresholds {
  if (!Number.isFinite(factor) || factor <= 0 || factor > Number.MAX_SAFE_INTEGER / contributionRules2026.monthlyCeiling) {
    throw new RangeError('Inflation factor must produce positive, finite, safely representable thresholds')
  }
  return {
    monthlyCeiling: contributionRules2026.monthlyCeiling * factor,
    monthlyVoluntaryMinimum: contributionRules2026.monthlyVoluntaryMinimum * factor,
    monthlyOccupationalThreshold: contributionRules2026.monthlyOccupationalThreshold * factor,
  }
}
