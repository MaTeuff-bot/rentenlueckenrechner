import { describe, expect, it } from 'vitest'
import {
  basisIssues,
  buildLifecycleBuckets,
  classificationIssues,
  createInitialLifecycleMilestones,
  rePrefillLifecycleMilestones,
  taxCashIssues,
  validateLifecycleTaxSettings,
} from './lifecycleDraft.js'
import type { PortfolioBucket } from './portfolioBuckets.js'

function buckets(): PortfolioBucket[] {
  return [
    { id: 'cash', name: 'Cash', value: 20000, returnSeriesId: 'synthetic-cash-assumption-v1', annualCostRate: 0 },
    { id: 'equity', name: 'Equity', value: 40000, returnSeriesId: 'synthetic-equity-assumption-v1', annualCostRate: 0.002 },
  ]
}
describe('lifecycle draft', () => {
  it('requires explicit classification, never inferred', () => {
    expect(classificationIssues(buckets(), {})).toHaveLength(2)
    expect(classificationIssues(buckets(), { cash: 'deposit', equity: 'equityFund' })).toHaveLength(0)
  })
  it('requires explicit fund basis including zero', () => {
    const classification = { cash: 'deposit' as const, equity: 'equityFund' as const }
    expect(basisIssues(buckets(), classification, {})).toHaveLength(1)
    expect(basisIssues(buckets(), classification, { equity: 0 })).toHaveLength(0)
    expect(basisIssues(buckets(), classification, { equity: NaN })).toHaveLength(1)
  })
  it('requires deposit cash account', () => {
    const classification = { cash: 'deposit' as const, equity: 'equityFund' as const }
    expect(taxCashIssues(buckets(), classification, undefined)).toHaveLength(1)
    expect(taxCashIssues(buckets(), classification, 'equity')).toHaveLength(1)
    expect(taxCashIssues(buckets(), classification, 'cash')).toHaveLength(0)
  })
  it('validates tax settings with explicit zero distinct from missing', () => {
    expect(validateLifecycleTaxSettings({})).not.toBeNull()
    expect(validateLifecycleTaxSettings({ allowanceAnnualToday: 0, churchRate: 0, basisRate: 0.032 })).toBeNull()
    expect(validateLifecycleTaxSettings({ allowanceAnnualToday: NaN, churchRate: 0, basisRate: 0.032 })).not.toBeNull()
  })
  it('initial percentages come only from holdings and preserve edits until re-prefill', () => {
    const classification = { cash: 'deposit' as const, equity: 'equityFund' as const }
    const { milestones, transitions } = createInitialLifecycleMilestones(40, 67, buckets(), classification)
    expect(milestones).toHaveLength(2)
    expect(transitions).toHaveLength(1)
    expect(transitions[0]).toMatchObject({ fromMilestone: 'Ansparen', toMilestone: 'Ruhestand', startAge: 67, durationYears: 0 })
    const first = milestones[0]
    if (!first) throw new Error('missing milestone')
    expect(first.targets['cash']).toMatchObject({ role: 'percent', share: 1 / 3 })
    const edited = milestones.map((m) => ({ ...m, targets: { ...m.targets, cash: { role: 'fixedReserve' as const, amountToday: 5000 } } }))
    const refilled = rePrefillLifecycleMilestones(edited, buckets(), classification)
    expect(refilled[0]?.targets['cash']).toMatchObject({ role: 'percent' })
    expect(refilled[1]?.targets['cash']).toMatchObject({ role: 'fixedReserve', amountToday: 5000 })
  })
  it('zero wealth needs explicit allocation and future zero buckets are supported', () => {
    const zeroBuckets: PortfolioBucket[] = [
      { id: 'cash', name: 'Cash', value: 0, returnSeriesId: 'synthetic-cash-assumption-v1' },
      { id: 'future', name: 'Future', value: 0, returnSeriesId: 'synthetic-equity-assumption-v1' },
    ]
    const classification = { cash: 'deposit' as const, future: 'equityFund' as const }
    const created = createInitialLifecycleMilestones(30, 67, zeroBuckets, classification)
    expect(created.milestones[0]?.targets['cash']).toMatchObject({ role: 'percent', share: 0 })
    expect(() => rePrefillLifecycleMilestones(created.milestones, zeroBuckets, classification)).toThrow(/positive total wealth/)
    const built = buildLifecycleBuckets(zeroBuckets, classification)
    expect(built).toHaveLength(2)
  })
})
