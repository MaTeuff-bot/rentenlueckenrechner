import { describe, expect, it } from 'vitest'
import { calculateContributions, type AutomaticContributionInput } from '../contributions/contributionEngine'
import { indexedContributionThresholds } from '../contributions/rules2026'

const base: AutomaticContributionInput = {
  mode: 'automatic', personId: 'person-1', phaseId: 'retirement', calendarYear: 2026,
  phase: 'pension', status: 'kvdr', scope: { kind: 'standard-domestic-no-employment' },
  thresholds: indexedContributionThresholds(1), insurerAdditionalRate: 0.029,
  insuredBirthYear: 1960, family: { isParent: true, childBirthYears: [] },
  statutoryPensions: [{ id: 'drv', grossMonthly: 2000 }],
  occupationalPensions: [{ id: 'bav', grossMonthly: 500 }],
  cashflowBeforeInsuranceMonthly: 2500,
}
function auto(patch: Partial<AutomaticContributionInput> = {}) {
  const result = calculateContributions({ ...base, ...patch })
  expect(result.status).toBe('automatic')
  if (result.status !== 'automatic') throw new Error(JSON.stringify(result))
  return result
}
const voluntary: Partial<AutomaticContributionInput> = {
  status: 'voluntary', capitalAssessmentMonthly: 0, rentalAssessmentMonthly: 0, drvSubsidy: 'confirmed',
}

describe('2026 source-backed contribution projections (docs/gkv-pv-rules-2026.md)', () => {
  it('reconciles worked KVdR example with separate pension participation and no PV subsidy', () => {
    const r = auto()
    expect(r.kvAssessmentMonthly).toBe(2302.25)
    expect(r.pvAssessmentMonthly).toBe(2500)
    expect(r.totalKvContributionMonthly).toBeCloseTo(402.89375, 8)
    expect(r.drvParticipationMonthly).toBeCloseTo(175, 8)
    expect(r.drvSubsidyMonthly).toBe(0)
    expect(r.ownKvMonthly).toBeCloseTo(227.89375, 8)
    expect(r.ownPvMonthly).toBeCloseTo(90, 8)
    expect(r.availableIncomeMonthly).toBeCloseTo(2182.10625, 8)
    expect(r.pvSubsidyMonthly).toBe(0)
  })
  it.each([197.74, 197.75, 197.76])('occupational threshold at %s: strict exceedance and separate KV allowance', amount => {
    const r = auto({ statutoryPensions: [], occupationalPensions: [{ id: 'bav', grossMonthly: amount }] })
    expect(r.kvAssessmentMonthly).toBeCloseTo(Math.max(0, amount - 197.75), 8)
    expect(r.pvAssessmentMonthly).toBe(amount > 197.75 ? amount : 0)
  })
  it('aggregates multiple Betriebsrenten before applying a single allowance/threshold', () => {
    const r = auto({ occupationalPensions: [{ id: 'a', grossMonthly: 100 }, { id: 'b', grossMonthly: 100 }] })
    expect(r.assessment[1].kvAssessmentMonthly).toBe(2.25)
    expect(r.assessment[1].pvAssessmentMonthly).toBe(200)
  })
  it('subtracts allowance BEFORE ceiling, matching GKV guidance A.1.1.12.6', () => {
    const r = auto({ statutoryPensions: [{ id: 'drv', grossMonthly: 5500 }], occupationalPensions: [{ id: 'bav', grossMonthly: 1000 }] })
    expect(r.assessment[1].kvAssessmentMonthly).toBe(312.5)
    expect(r.assessment[1].pvAssessmentMonthly).toBe(312.5)
    const split = auto({ statutoryPensions: [{ id: 'drv', grossMonthly: 5500 }] })
    expect(split.kvAssessmentMonthly).toBe(5802.25)
    expect(split.pvAssessmentMonthly).toBe(5812.5)
  })
  it.each([5812.49, 5812.5, 5812.51, 10000])('caps aggregate pensions and participation/subsidy at %s', grossMonthly => {
    for (const patch of [{}, voluntary]) {
      const r = auto({ ...patch, statutoryPensions: [{ id: 'drv', grossMonthly }], occupationalPensions: [] })
      expect(r.kvAssessmentMonthly).toBe(Math.min(grossMonthly, 5812.5))
      expect(r.drvParticipationMonthly + r.drvSubsidyMonthly).toBeCloseTo(Math.min(grossMonthly, 5812.5) * 0.0875, 8)
    }
  })
  it('voluntary mixed-income example: pension, Betriebsrente, then grouped rental/capital', () => {
    const r = auto({ ...voluntary, statutoryPensions: [{ id: 'drv', grossMonthly: 4000 }],
      occupationalPensions: [{ id: 'bav', grossMonthly: 1000 }], rentalAssessmentMonthly: 600,
      capitalAssessmentMonthly: 600, cashflowBeforeInsuranceMonthly: 5600 })
    expect(r.assessment.map(s => s.kvAssessmentMonthly)).toEqual([4000, 1000, 812.5, 0])
    expect(r.totalKvContributionMonthly).toBeCloseTo(1012.3125, 8)
    expect(r.drvSubsidyMonthly).toBeCloseTo(350, 8)
    expect(r.drvParticipationMonthly).toBe(0)
    expect(r.ownPvMonthly).toBeCloseTo(209.25, 8)
    expect(r.availableIncomeMonthly).toBeCloseTo(4728.4375, 8)
  })
  it.each([0, 197.74, 197.75, 197.76])('voluntary has no Betriebsrente exemption at %s', amount => {
    const r = auto({ ...voluntary, occupationalPensions: [{ id: 'bav', grossMonthly: amount }] })
    expect(r.assessment[1].kvAssessmentMonthly).toBe(amount)
    expect(r.assessment[1].pvAssessmentMonthly).toBe(amount)
  })
  it.each([1318.32, 1318.33, 1318.34])('applies one voluntary minimum at %s', rentalAssessmentMonthly => {
    const r = auto({ ...voluntary, statutoryPensions: [], occupationalPensions: [], rentalAssessmentMonthly })
    expect(r.kvAssessmentMonthly).toBe(Math.max(1318.33, rentalAssessmentMonthly))
    expect(r.pvAssessmentMonthly).toBe(r.kvAssessmentMonthly)
  })
  it('bridge zero-income example has minimum assessment, no cash income, negative available cash', () => {
    const r = auto({ ...voluntary, phase: 'bridge', drvSubsidy: undefined, statutoryPensions: [], occupationalPensions: [], cashflowBeforeInsuranceMonthly: 0 })
    expect(r.ownKvMonthly).toBeCloseTo(222.79777, 8)
    expect(r.ownPvMonthly).toBeCloseTo(47.45988, 8)
    expect(r.availableIncomeMonthly).toBeCloseTo(-270.25765, 8)
    expect(r.drvSubsidyMonthly).toBe(0)
  })
  it('minimum top-up uses reduced rate while a small pension retains general rate and subsidy', () => {
    const r = auto({ ...voluntary, statutoryPensions: [{ id: 'drv', grossMonthly: 500 }], occupationalPensions: [] })
    expect(r.assessment[3].kvAssessmentMonthly).toBeCloseTo(818.33, 8)
    expect(r.ownKvMonthly).toBeCloseTo(182.04777, 8)
  })
  it('requires explicit voluntary subsidy choice, and honours not-received', () => {
    expect(calculateContributions({ ...base, ...voluntary, drvSubsidy: undefined }).status).toBe('incomplete')
    const r = auto({ ...voluntary, drvSubsidy: 'not-received' })
    expect(r.drvSubsidyMonthly).toBe(0)
    expect(r.ownKvMonthly).toBe(r.totalKvContributionMonthly)
  })
  it('excludes KVdR rental/capital without adding assessment to cash, and labels unknown', () => {
    expect(auto({ capitalAssessmentMonthly: 100000, rentalAssessmentMonthly: 100000 }).availableIncomeMonthly).toBe(auto().availableIncomeMonthly)
    const r = auto({ ...voluntary, status: 'unknown' })
    expect(r.effectiveStatus).toBe('voluntary')
    expect(r.explanations.join(' ')).toContain('not a guaranteed worst case')
  })
  it('inflation scales all statutory monetary boundaries without changing rates', () => {
    const r = auto({ thresholds: indexedContributionThresholds(2), statutoryPensions: [{ id: 'drv', grossMonthly: 4000 }], occupationalPensions: [{ id: 'bav', grossMonthly: 1000 }], cashflowBeforeInsuranceMonthly: 5000 })
    expect(r.ownKvMonthly).toBeCloseTo(auto().ownKvMonthly * 2, 8)
    expect(r.ownPvMonthly).toBeCloseTo(auto().ownPvMonthly * 2, 8)
    expect(r.pvRate).toBe(auto().pvRate)
    for (const factor of [0, -1, NaN, Infinity, Number.MAX_VALUE]) expect(() => indexedContributionThresholds(factor)).toThrow()
  })
})

describe('annual PV family convention', () => {
  it.each([[0, 0.036], [1, 0.036], [2, 0.0335], [3, 0.031], [4, 0.0285], [5, 0.026], [6, 0.026]])('%s recognised children yields %s', (count, rate) => {
    expect(auto({ family: { isParent: true, childBirthYears: Array(count).fill(2010) } }).pvRate).toBeCloseTo(rate, 10)
  })
  it('ages a child out at Jan 1 of turning-25 year, but never removes parenthood', () => {
    const family = { isParent: true, childBirthYears: [2002, 2002] }
    expect(auto({ family }).childrenUnder25).toBe(2)
    expect(auto({ family, calendarYear: 2027 }).childrenUnder25).toBe(0)
    expect(auto({ family, calendarYear: 2027 }).pvRate).toBe(0.036)
  })
  it.each([[2004, 0.036], [2003, 0.042], [2002, 0.042], [1939, 0.036], [1940, 0.042]])('insured birth %s controls childless surcharge', (insuredBirthYear, rate) => {
    expect(auto({ insuredBirthYear, family: { isParent: false, childBirthYears: [] } }).pvRate).toBeCloseTo(rate, 10)
  })
  it('parents under 23 receive multi-child discounts too', () => {
    expect(auto({ insuredBirthYear: 2005, family: { isParent: true, childBirthYears: [2025, 2025] } }).pvRate).toBeCloseTo(0.0335, 10)
  })
})

describe('completeness, support boundaries and manual replacement', () => {
  it.each(['insurerAdditionalRate', 'family', 'statutoryPensions', 'occupationalPensions', 'scope', 'phase', 'status', 'cashflowBeforeInsuranceMonthly'])('missing %s does not produce a total', field => {
    expect(calculateContributions({ ...base, [field]: undefined }).status).toBe('incomplete')
  })
  it.each(['capitalAssessmentMonthly', 'rentalAssessmentMonthly'])('missing %s differs from confirmed zero', field => {
    expect(calculateContributions({ ...base, ...voluntary, [field]: undefined }).status).toBe('incomplete')
    expect(auto({ ...voluntary, [field]: 0 }).status).toBe('automatic')
  })
  it.each([NaN, Infinity, Number.MAX_VALUE, -1, null, '0'])('rejects invalid gross pension %s', grossMonthly => {
    expect(calculateContributions({ ...base, statutoryPensions: [{ id: 'drv', grossMonthly }] }).status).toBe('invalid')
  })
  it('rejects duplicate IDs, contradictory family, future birth, and inconsistent thresholds', () => {
    for (const patch of [
      { occupationalPensions: [{ id: 'drv', grossMonthly: 1 }] },
      { family: { isParent: false, childBirthYears: [2020] } },
      { family: { isParent: true, childBirthYears: [2027] } },
      { insuredBirthYear: 2027 },
      { thresholds: { ...base.thresholds, monthlyVoluntaryMinimum: 6000 } },
    ]) expect(calculateContributions({ ...base, ...patch }).status).toBe('invalid')
  })
  it.each([
    ['insurerAdditionalRate', 'PKV'],
    ['family', 'Unresolved child recognition'],
  ])('unsupported scope does not require %s', (field, reason) => {
    expect(calculateContributions({ ...base, [field]: undefined,
      scope: { kind: 'unsupported', reasons: [reason] },
    })).toEqual({ status: 'manual-required', reasons: [reason] })
  })
  it('routes a minimal valid unsupported declaration without automatic inputs', () => {
    expect(calculateContributions({ mode: 'automatic',
      scope: { kind: 'unsupported', reasons: ['PKV'] },
    })).toEqual({ status: 'manual-required', reasons: ['PKV'] })
  })
  it.each([[], [''], ['   '], [42], [null], 'PKV', null, ['PKV', '']])('rejects malformed unsupported reasons %j', reasons => {
    for (const fields of [{}, base]) {
      const r = calculateContributions({ ...fields, mode: 'automatic', scope: { kind: 'unsupported', reasons } })
      expect(r).toMatchObject({ status: 'invalid', issues: expect.arrayContaining([
        expect.objectContaining({ field: expect.stringMatching(/^scope\.reasons/) }),
      ]) })
    }
  })
  it('requires reasons in an unsupported declaration', () => {
    expect(calculateContributions({ mode: 'automatic', scope: { kind: 'unsupported' } }))
      .toMatchObject({ status: 'incomplete', issues: [expect.objectContaining({ field: 'scope.reasons' })] })
  })
  it('rejects unknown fields in the unsupported scope declaration', () => {
    expect(calculateContributions({ mode: 'automatic', scope: { kind: 'unsupported', reasons: ['PKV'], typo: true } }).status).toBe('invalid')
  })
  it('unsupported scope and nonstandard bridge require whole-phase manual totals', () => {
    expect(calculateContributions({ ...base, scope: { kind: 'unsupported', reasons: ['Unmodelled employment participation'] } }).status).toBe('manual-required')
    expect(calculateContributions({ ...base, phase: 'bridge' }).status).toBe('manual-required')
  })
  it('manual output replaces everything and never adds automatic subsidy or assessment', () => {
    const manual = { mode: 'manual', personId: 'p', phaseId: 'bridge', phase: 'bridge', calendarYear: 2026,
      cashflowBeforeInsuranceMonthly: 100, reason: 'PKV whole phase, after subsidy', kvMonthly: 150, pvMonthly: 20 }
    const r = calculateContributions(manual)
    expect(r).toMatchObject({ status: 'manual', automaticCoverage: false, assessment: null, ownKvMonthly: 150, ownPvMonthly: 20, availableIncomeMonthly: -70 })
    expect(r).not.toHaveProperty('drvSubsidyMonthly')
    for (const reasons of [['PKV'], []]) {
      expect(calculateContributions({ ...manual, scope: { kind: 'unsupported', reasons } }).status).toBe('invalid')
      expect(calculateContributions({ mode: 'manual', scope: { kind: 'unsupported', reasons } }).status).not.toBe('manual-required')
    }
    expect(calculateContributions({ ...manual, pvMonthly: undefined }).status).toBe('incomplete')
    expect(calculateContributions({ ...manual, kvMonthly: 0, pvMonthly: 0 })).toMatchObject({ status: 'manual', availableIncomeMonthly: 100 })
    expect(calculateContributions({ ...manual, statutoryPensions: base.statutoryPensions }).status).toBe('invalid')
  })
  it('is deterministic, does not mutate caller data, and reconciles every assessment row', () => {
    const input = structuredClone({ ...base, ...voluntary })
    const before = structuredClone(input)
    const r = auto(voluntary)
    expect(calculateContributions(input)).toEqual(calculateContributions(input))
    expect(input).toEqual(before)
    expect(r.assessment.reduce((s, row) => s + row.kvContributionMonthly, 0)).toBe(r.totalKvContributionMonthly)
    expect(r.availableIncomeMonthly + r.ownKvMonthly + r.ownPvMonthly).toBeCloseTo(r.cashflowBeforeInsuranceMonthly, 8)
  })
})
