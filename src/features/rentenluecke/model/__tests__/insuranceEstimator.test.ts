import { describe, expect, it, vi } from 'vitest'
import { calculateContributions } from '../contributions/contributionEngine'
import { indexedContributionThresholds } from '../contributions/rules2026'
import { assessCapitalIncome, calculateVorabpauschale, createEstimatorState,
  simulateEstimatorYear, withdrawProportionally, type EstimatorBucket, type EstimatorState,
  type EstimatorYearInput } from '../capitalIncome/insuranceEstimator'

const fund = (value: number, id = 'fund'): EstimatorBucket => ({ id, value, eligibility: 'accumulating-equity-fund' })
const bank = (value: number, id = 'bank'): EstimatorBucket => ({ id, value, eligibility: 'ordinary-bank-deposit' })
const initial = (buckets = [fund(1000), bank(1000)], cost = 500) => createEstimatorState({
  buckets, fundAcquisitionCost: cost,
  scope: 'single-person-domestic-private-post-2017-no-special-events',
  lossHistory: 'confirmed-none-and-no-external-offsets',
})
const year = (s: EstimatorState, overrides: Partial<EstimatorYearInput> = {}): EstimatorYearInput => ({
  projectedBasisRate: 0.02, spendingLessOtherIncome: 0,
  buckets: s.buckets.map(b => ({ id: b.id, totalReturnRate: 0, contribution: 0 })), ...overrides,
})
const noInsurance = () => ({ kv: 0, pv: 0 })

describe('coverage and required explicit inputs', () => {
  it('starts VP history at zero without replacing acquisition costs', () => {
    expect(initial()).toMatchObject({ fundAcquisitionCost: 500, assessedVorabpauschalen: 0,
      pendingVorabpauschale: 0, simulatedLossCarryforward: 0 })
  })
  it.each(['distributing-fund', 'equity', 'bond', 'cash', undefined])('rejects classification %s even at zero value', eligibility => {
    expect(() => initial([{ ...fund(0), eligibility } as EstimatorBucket])).toThrow()
  })
  it('accepts explicit bank classification regardless of identifier/proxy-like name', () => {
    expect(initial([bank(100, 'equity-index')], 0).buckets[0].eligibility).toBe('ordinary-bank-deposit')
  })
  it.each(['legacy', undefined])('rejects unconfirmed scope %s', scope => {
    expect(() => createEstimatorState({ buckets: [fund(1)], fundAcquisitionCost: 1,
      scope, lossHistory: 'confirmed-none-and-no-external-offsets' } as Parameters<typeof createEstimatorState>[0])).toThrow()
  })
  it('requires explicit absence of external/opening losses', () => {
    expect(() => createEstimatorState({ buckets: [], fundAcquisitionCost: 0,
      scope: 'single-person-domestic-private-post-2017-no-special-events' } as unknown as Parameters<typeof createEstimatorState>[0])).toThrow()
  })
  it.each([NaN, Infinity, -1, Number.MAX_SAFE_INTEGER + 1])('rejects invalid money %s', value => {
    expect(() => initial([fund(value)])).toThrow()
  })
  it('rejects duplicate IDs, orphan fund balances, missing rates and mismatched year buckets', () => {
    expect(() => initial([fund(1), fund(2)])).toThrow()
    expect(() => initial([bank(1)], 1)).toThrow()
    const s = initial()
    expect(() => simulateEstimatorYear(s, { ...year(s), projectedBasisRate: undefined } as unknown as EstimatorYearInput, noInsurance)).toThrow()
    for (const buckets of [[], [{ id: 'other', totalReturnRate: 0, contribution: 0 }],
      [year(s).buckets[0], year(s).buckets[0]]]) {
      expect(() => simulateEstimatorYear(s, year(s, { buckets }), noInsurance)).toThrow()
    }
  })
})

describe('Vorabpauschale §18 boundaries', () => {
  it.each([
    [1000, 1100, 0.02, 14], [1000, 1005, 0.02, 5], [1000, 1014, 0.02, 14],
    [1000, 1000, 0.02, 0], [1000, 900, 0.02, 0], [1000, 0, 0.02, 0],
    [1000, 1100, 0, 0], [1000, 1100, -0.01, 0], [0, 100, 0.02, 0],
  ])('start=%s end=%s basis=%s -> %s', (startValue, endValue, projectedBasisRate, expected) => {
    expect(calculateVorabpauschale({ startValue, endValue, projectedBasisRate, acquisitionMonth: 1 })).toBeCloseTo(expected, 10)
  })
  it.each(Array.from({ length: 12 }, (_, i) => i + 1))('prorates acquisition month %s', acquisitionMonth => {
    expect(calculateVorabpauschale({ startValue: 1200, endValue: 1300, projectedBasisRate: 0.1, acquisitionMonth }))
      .toBeCloseTo(84 * (13 - acquisitionMonth) / 12)
  })
  it.each([0, 13, 1.5, NaN])('rejects month %s', acquisitionMonth => {
    expect(() => calculateVorabpauschale({ startValue: 1, endValue: 2, projectedBasisRate: 0.1, acquisitionMonth })).toThrow()
  })
})

describe('pooled proportional sale accounting', () => {
  it.each([0, 200, 2000, 2500])('reconciles withdrawal %s', requested => {
    const s = { ...initial(), assessedVorabpauschalen: 100 }
    const snapshot = structuredClone(s)
    const r = withdrawProportionally(s, requested)
    const fraction = Math.min(1, requested / 2000)
    expect(r.fundProceeds).toBeCloseTo(1000 * fraction)
    expect(r.bankPrincipalWithdrawn).toBeCloseTo(1000 * fraction)
    expect(r.adjustedFundSaleGain).toBeCloseTo(400 * fraction)
    expect(r.state.fundAcquisitionCost).toBeCloseTo(500 * (1 - fraction))
    expect(r.state.assessedVorabpauschalen).toBeCloseTo(100 * (1 - fraction))
    expect(r.shortfall).toBe(Math.max(0, requested - 2000))
    expect(s).toEqual(snapshot)
  })
  it('permits loss-making sales and zero acquisition cost', () => {
    expect(withdrawProportionally(initial([fund(100)], 200), 50).adjustedFundSaleGain).toBe(-50)
    expect(withdrawProportionally(initial([fund(100)], 0), 50).adjustedFundSaleGain).toBe(50)
  })
  it('does not realize a worthless fund by withdrawing bank principal', () => {
    const r = withdrawProportionally(initial([fund(0), bank(100)], 100), 100)
    expect(r.adjustedFundSaleGain).toBe(0)
    expect(r.state.fundAcquisitionCost).toBe(100)
  })
  it('handles empty/depleted portfolios', () => {
    expect(withdrawProportionally(initial([], 0), 10)).toMatchObject({ paid: 0, shortfall: 10, adjustedFundSaleGain: 0 })
  })
  it('sequential proportional sales equal one combined sale', () => {
    const s = { ...initial(), assessedVorabpauschalen: 100 }
    const a = withdrawProportionally(s, 200)
    const b = withdrawProportionally(a.state, 500)
    const combined = withdrawProportionally(s, 700)
    expect(b.state.fundAcquisitionCost).toBeCloseTo(combined.state.fundAcquisitionCost)
    expect(a.adjustedFundSaleGain + b.adjustedFundSaleGain).toBeCloseTo(combined.adjustedFundSaleGain)
  })
})

const assess = (overrides: Partial<Parameters<typeof assessCapitalIncome>[0]> = {}) => assessCapitalIncome({
  bankInterest: 0, receivedVorabpauschale: 0, adjustedFundSaleGain: 0, openingSimulatedLoss: 0, ...overrides,
})
describe('partial exemption, expenses and bounded capital-only losses', () => {
  it.each([50, 51, 52])('expense boundary %s', bankInterest => {
    expect(assess({ bankInterest }).annualAssessment).toBe(Math.max(0, bankInterest - 51))
  })
  it('applies full VP adjustment before exemption on positive and negative gains', () => {
    expect(assess({ receivedVorabpauschale: 100, adjustedFundSaleGain: 400, bankInterest: 100 }).annualAssessment).toBe(399)
    expect(assess({ adjustedFundSaleGain: -100, bankInterest: 100 }).annualAssessment).toBe(0)
    expect(assess({ adjustedFundSaleGain: -100 }).closingSimulatedLoss).toBe(70)
  })
  it('carries excess investment losses forward, consumes once and never carries unused expenses', () => {
    const loss = assess({ adjustedFundSaleGain: -1000, bankInterest: 100 })
    expect(loss.closingSimulatedLoss).toBe(600)
    expect(assess({ bankInterest: 800, openingSimulatedLoss: loss.closingSimulatedLoss }))
      .toMatchObject({ annualAssessment: 149, closingSimulatedLoss: 0 })
    expect(assess({ bankInterest: 0 }).closingSimulatedLoss).toBe(0)
  })
  it.each([0, 50, 51, 100])('uses higher demonstrated expense %s', provenDeductibleAnnualExpenses => {
    expect(assess({ bankInterest: 200, provenDeductibleAnnualExpenses }).annualAssessment).toBe(200 - Math.max(51, provenDeductibleAnnualExpenses))
  })
  it('does not subtract the tax saver allowance', () => {
    expect(assess({ bankInterest: 1000 }).annualAssessment).toBe(949)
  })
})

describe('annual ledger and solver', () => {
  it('preserves supplied returns, adds contributions at end, never adds interest twice', () => {
    const s = initial()
    const r = simulateEstimatorYear(s, year(s, { buckets: [
      { id: 'fund', totalReturnRate: 0.1, contribution: 100 },
      { id: 'bank', totalReturnRate: 0.02, contribution: 50 },
    ] }), noInsurance)
    expect(r).toMatchObject({ status: 'converged', investmentReturn: 120, bankInterest: 20,
      contribution: 150, closingCapital: 2270, receivedVorabpauschale: 0 })
    expect(r.closingState?.fundAcquisitionCost).toBe(600)
    expect(r.pendingVorabpauschale).toBeCloseTo(14 + (100 / 1.1) * 0.014 / 12)
  })
  it('caps VP per fund before summing, not against net pool appreciation', () => {
    const s = initial([fund(1000, 'up'), fund(1000, 'down')], 2000)
    const r = simulateEstimatorYear(s, year(s, { buckets: [
      { id: 'up', totalReturnRate: 0.1, contribution: 0 },
      { id: 'down', totalReturnRate: -0.1, contribution: 0 },
    ] }), noInsurance)
    expect(r.investmentReturn).toBe(0)
    expect(r.pendingVorabpauschale).toBeCloseTo(14)
  })
  it('receives last-year VP before sales, counts full receipt, releases only sold balance', () => {
    const s = initial([fund(1000)], 500)
    const a = simulateEstimatorYear(s, year(s, { buckets: [{ id: 'fund', totalReturnRate: 0.1, contribution: 0 }] }), noInsurance)
    const next = a.closingState!
    const b = simulateEstimatorYear(next, year(next, { spendingLessOtherIncome: 550 }), noInsurance)
    expect(b.receivedVorabpauschale).toBeCloseTo(14)
    expect(b.sale.adjustmentReleased).toBeCloseTo(7)
    expect(b.sale.adjustedFundSaleGain).toBeCloseTo(293)
    expect(b.closingState?.assessedVorabpauschalen).toBeCloseTo(7)
    expect(b.assessment.fundIncomeAfterExemption).toBeCloseTo((14 + 293) * 0.7)
    expect(b.pendingVorabpauschale).toBe(0)
  })
  it('only retained year-end units generate next receipt; full liquidation does not', () => {
    const s = initial([fund(1000)], 500)
    for (const withdrawal of [550, 1100]) {
      const r = simulateEstimatorYear(s, year(s, { spendingLessOtherIncome: withdrawal,
        buckets: [{ id: 'fund', totalReturnRate: 0.1, contribution: 0 }] }), noInsurance)
      expect(r.pendingVorabpauschale).toBeCloseTo(withdrawal === 550 ? 7 : 0)
    }
  })
  it('includes insurance-funding gains in a solved withdrawal', () => {
    const s = initial([fund(10000)], 0)
    const r = simulateEstimatorYear(s, year(s, { spendingLessOtherIncome: 1000 }), basis => ({ kv: basis * 0.2, pv: 0 }))
    // w = 1000 + .2 * (.7w - 51)
    expect(r.status).toBe('converged')
    expect(r.paidWithdrawal).toBeCloseTo(989.8 / 0.86, 5)
    expect(r.insurance.kv).toBeCloseTo(r.paidWithdrawal - 1000, 5)
    expect(r.closingCapital + r.paidWithdrawal).toBeCloseTo(10000)
  })
  it('supports shared ceiling/minimum style piecewise burden and income surplus', () => {
    const s = initial([fund(10000)], 0)
    const burden = (basis: number) => ({ kv: Math.min(500, Math.max(100, basis * 0.2)), pv: 20 })
    for (const spending of [-200, 0, 1000, 8000]) {
      const r = simulateEstimatorYear(s, year(s, { spendingLessOtherIncome: spending }), burden)
      expect(r.status).toBe('converged')
      expect(r.paidWithdrawal).toBeCloseTo(Math.max(0, spending + r.insurance.kv + r.insurance.pv), 5)
    }
  })
  it.each([0, 100, 110])('exposes shortfall at available bank capital %s', value => {
    const s = initial([bank(value)], 0)
    const r = simulateEstimatorYear(s, year(s, { spendingLessOtherIncome: 100 }), () => ({ kv: 10, pv: 0 }))
    expect(r.status).toBe(value < 110 ? 'shortfall' : 'converged')
    expect(r.unfundedWithdrawal).toBe(110 - value)
    expect(r.closingCapital).toBe(0)
  })
  it('does not fund earlier obligations with later contributions', () => {
    const s = initial([bank(0)], 0)
    const r = simulateEstimatorYear(s, year(s, { spendingLessOtherIncome: 100,
      buckets: [{ id: 'bank', totalReturnRate: 0, contribution: 200 }] }), noInsurance)
    expect(r).toMatchObject({ status: 'shortfall', unfundedWithdrawal: 100, closingCapital: 200 })
  })
  it('returns no committable state after iteration exhaustion or discontinuity', () => {
    const s = initial([fund(1000)], 0)
    const r = simulateEstimatorYear(s, year(s, { spendingLessOtherIncome: 123, maxIterations: 1 }), noInsurance)
    expect(r).toMatchObject({ status: 'nonconverged', closingState: null, iterations: 1 })
    const discontinuous = simulateEstimatorYear(s, year(s), basis => ({ kv: basis < 299 ? 600 : 400, pv: 0 }))
    expect(discontinuous).toMatchObject({ status: 'nonconverged', closingState: null })
  })
  it('is deterministic and never mutates source or consumes balances on solver trials', () => {
    const s = { ...initial(), pendingVorabpauschale: 100, simulatedLossCarryforward: 20 }
    const snapshot = structuredClone(s)
    const p = year(s, { spendingLessOtherIncome: 400 })
    const run = () => simulateEstimatorYear(s, p, basis => ({ kv: basis * 0.2, pv: basis * 0.03 }))
    expect(run()).toEqual(run())
    expect(s).toEqual(snapshot)
  })
  it('handles total fund price loss without inventing a disposal loss', () => {
    const s = initial([fund(1000)], 1000)
    const r = simulateEstimatorYear(s, year(s, { buckets: [{ id: 'fund', totalReturnRate: -1, contribution: 0 }] }), noInsurance)
    expect(r).toMatchObject({ closingCapital: 0, pendingVorabpauschale: 0 })
    expect(r.closingState?.fundAcquisitionCost).toBe(1000)
    expect(r.assessment.closingSimulatedLoss).toBe(0)
  })
  it('rejects invalid return/solver/callback inputs instead of silently clamping', () => {
    const s = initial()
    for (const totalReturnRate of [-1.01, NaN, Infinity]) {
      expect(() => simulateEstimatorYear(s, year(s, { buckets: year(s).buckets.map(b => ({ ...b, totalReturnRate })) }), noInsurance)).toThrow()
    }
    expect(() => simulateEstimatorYear(s, year(s, { buckets: year(s).buckets.map(b => ({ ...b, totalReturnRate: -0.01 })) }), noInsurance)).toThrow()
    for (const overrides of [{ maxIterations: 0 }, { maxIterations: 257 }, { tolerance: 0 }, { tolerance: NaN }])
      expect(() => simulateEstimatorYear(s, year(s, overrides), noInsurance)).toThrow()
    expect(() => simulateEstimatorYear(s, year(s), () => ({ kv: NaN, pv: 0 }))).toThrow()
    const f = initial([fund(1)], 1)
    expect(() => simulateEstimatorYear(f, year(f, { buckets: [{ id: 'fund', totalReturnRate: -1, contribution: 1 }] }), noInsurance)).toThrow()
  })
  it('reconciles a reproducible grid of mixed paths and withdrawals', () => {
    for (const fundReturn of [-0.9, -0.1, 0, 0.07, 1]) for (const bankReturn of [0, 0.03])
      for (const spending of [0, 100, 1000, 10000]) {
        const s = initial()
        const r = simulateEstimatorYear(s, year(s, { spendingLessOtherIncome: spending, buckets: [
          { id: 'fund', totalReturnRate: fundReturn, contribution: 0 },
          { id: 'bank', totalReturnRate: bankReturn, contribution: 0 },
        ] }), basis => ({ kv: Math.min(200, basis * 0.15), pv: basis * 0.03 }))
        expect(r.status).not.toBe('nonconverged')
        expect(r.closingCapital).toBeCloseTo(r.openingCapital + r.investmentReturn + r.contribution - r.paidWithdrawal, 6)
        expect(r.unfundedWithdrawal).toBeCloseTo(Math.max(0, r.requiredWithdrawal - r.paidWithdrawal), 6)
        expect(r.closingState!.fundAcquisitionCost).toBeGreaterThanOrEqual(0)
      }
  })
})


describe('pure contribution-engine callback compatibility (no simulator activation)', () => {
  it.each(['voluntary', 'unknown', 'kvdr'] as const)('reconciles %s own burdens and shared ceilings', status => {
    const s = initial([fund(100000)], 0)
    const callback = (annualAssessment: number) => {
      const result = calculateContributions({
        mode: 'automatic', personId: 'one', phaseId: 'pension', calendarYear: 2026,
        phase: 'pension', status, scope: { kind: 'standard-domestic-no-employment' },
        thresholds: indexedContributionThresholds(1), insurerAdditionalRate: 0.029,
        insuredBirthYear: 1960, family: { isParent: true, childBirthYears: [] },
        statutoryPensions: [{ id: 'drv', grossMonthly: 2000 }], occupationalPensions: [],
        cashflowBeforeInsuranceMonthly: 2000, capitalAssessmentMonthly: annualAssessment / 12,
        rentalAssessmentMonthly: 0, drvSubsidy: 'confirmed',
      })
      if (result.status !== 'automatic') throw new Error('Unexpected incomplete contribution fixture')
      expect(result.availableIncomeMonthly).toBeCloseTo(2000 - result.ownKvMonthly - result.ownPvMonthly)
      return { kv: result.ownKvMonthly * 12, pv: result.ownPvMonthly * 12 }
    }
    const r = simulateEstimatorYear(s, year(s, { spendingLessOtherIncome: 20000 }), callback)
    expect(r.status).toBe('converged')
    expect(r.insurance).toEqual(callback(r.assessment.annualAssessment))
    expect(r.paidWithdrawal).toBeCloseTo(20000 + r.insurance.kv + r.insurance.pv, 5)
    if (status === 'kvdr') expect(r.insurance).toEqual(callback(0))
    else expect(r.insurance.kv).toBeGreaterThan(callback(0).kv)
  })
})


describe('indexed expense allowance regression', () => {
  it.each([101, 102, 103])('uses the indexed snapshot at income %s', bankInterest => {
    expect(assess({ bankInterest, expenseAllowance: 51 * 2 })).toMatchObject({
      expenseAllowance: 102, annualAssessment: Math.max(0, bankInterest - 102), closingSimulatedLoss: 0,
    })
  })
  it.each([0, 100, 150])('compares indexed allowance with proven expenses %s', provenDeductibleAnnualExpenses => {
    expect(assess({ bankInterest: 200, expenseAllowance: 102, provenDeductibleAnnualExpenses }))
      .toMatchObject({ expenseAllowance: Math.max(102, provenDeductibleAnnualExpenses),
        annualAssessment: 200 - Math.max(102, provenDeductibleAnnualExpenses) })
  })
  it('accepts explicit zero instead of substituting the default', () => {
    expect(assess({ bankInterest: 51, expenseAllowance: 0 }).annualAssessment).toBe(51)
  })
  it.each([undefined, 0, 102, 250])('forwards annual allowance %s to every callback trial and the ledger', expenseAllowance => {
    const s = initial([bank(1000)], 0)
    const expected = Math.max(0, 200 - (expenseAllowance ?? 51))
    const callback = vi.fn((basis: number) => ({ kv: basis * 0.2, pv: 0 }))
    const r = simulateEstimatorYear(s, year(s, { expenseAllowance, spendingLessOtherIncome: 100,
      buckets: [{ id: 'bank', totalReturnRate: 0.2, contribution: 0 }] }), callback)
    expect(r.status).toBe('converged')
    expect(r.assessment.annualAssessment).toBe(expected)
    expect(r.paidWithdrawal).toBeCloseTo(100 + expected * 0.2, 5)
    expect(callback.mock.calls.length).toBeGreaterThan(2)
    for (const [basis] of callback.mock.calls) expect(basis).toBe(expected)
  })
  it.each([-1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid allowance %s in both APIs', expenseAllowance => {
    expect(() => assess({ expenseAllowance })).toThrow()
    const s = initial()
    const callback = vi.fn(noInsurance)
    expect(() => simulateEstimatorYear(s, year(s, { expenseAllowance }), callback)).toThrow()
    expect(callback).not.toHaveBeenCalled()
  })
})

describe('aggregate and intermediate monetary range regression', () => {
  const max = Number.MAX_SAFE_INTEGER
  it('accepts the inclusive aggregate boundary', () => {
    const s = initial([bank(max - 1, 'a'), bank(1, 'b')], 0)
    expect(simulateEstimatorYear(s, year(s), noInsurance).closingCapital).toBe(max)
    expect(withdrawProportionally({ ...initial([fund(1)], max - 2),
      assessedVorabpauschalen: 1, pendingVorabpauschale: 1 }, 0).paid).toBe(0)
  })
  it('rejects aggregate portfolio value even when each bucket is valid', () => {
    expect(() => initial([bank(max, 'a'), bank(1, 'b')], 0)).toThrow()
  })
  it.each([
    { fundAcquisitionCost: max, assessedVorabpauschalen: 1 },
    { fundAcquisitionCost: max - 1, assessedVorabpauschalen: 1, pendingVorabpauschale: 1 },
  ])('rejects combined fund balances at all state entry points: %j', balances => {
    const s = { ...initial([fund(1)], 0), ...balances }
    expect(() => withdrawProportionally(s, 0)).toThrow()
    const callback = vi.fn(noInsurance)
    expect(() => simulateEstimatorYear(s, year(s), callback)).toThrow()
    expect(callback).not.toHaveBeenCalled()
  })
  it.each([max, -max])('rejects VP rate-product overflow before a gain cap or zero floor hides it: %s', projectedBasisRate => {
    expect(() => calculateVorabpauschale({ startValue: 100, endValue: 100,
      projectedBasisRate, acquisitionMonth: 12 })).toThrow()
  })
  it.each([
    { receivedVorabpauschale: max, adjustedFundSaleGain: 1 },
    { bankInterest: max, adjustedFundSaleGain: 10 },
    { adjustedFundSaleGain: -max, openingSimulatedLoss: max },
  ])('rejects assessment intermediate overflow: %j', input => {
    expect(() => assess(input)).toThrow()
  })
  const cases: [string, EstimatorState, Partial<EstimatorYearInput>][] = [
    ['opening portfolio', { ...initial([bank(max)], 0), buckets: [bank(max), bank(1, 'extra')] }, {}],
    ['return product', initial([fund(100)], 0), { buckets: [{ id: 'fund', totalReturnRate: max, contribution: 0 }] }],
    ['basis product', initial([fund(100)], 0), { projectedBasisRate: max }],
    ['negative basis product', initial([fund(100)], 0), { projectedBasisRate: -max }],
    ['returned aggregate', initial([bank(max / 2, 'a'), bank(max / 2, 'b')], 0),
      { buckets: ['a', 'b'].map(id => ({ id, totalReturnRate: 0.1, contribution: 0 })) }],
    ['contribution aggregate', initial([bank(0, 'a'), bank(0, 'b')], 0),
      { buckets: ['a', 'b'].map(id => ({ id, totalReturnRate: 0, contribution: max })) }],
    ['closing envelope despite planned withdrawal', initial([bank(max)], 0),
      { spendingLessOtherIncome: max, buckets: [{ id: 'bank', totalReturnRate: 0, contribution: 1 }] }],
    ['fund cost plus contribution', initial([fund(1)], max),
      { buckets: [{ id: 'fund', totalReturnRate: 0, contribution: 1 }] }],
    ['fund cost plus next pending VP', initial([fund(100)], max),
      { buckets: [{ id: 'fund', totalReturnRate: 0.1, contribution: 0 }] }],
    ['full-sale loss overflow', { ...initial([fund(100)], max), simulatedLossCarryforward: max }, { spendingLessOtherIncome: 1 }],
  ]
  it.each(cases)('rejects %s before invoking callbacks', (_label, s, overrides) => {
    const callback = vi.fn(noInsurance)
    const snapshot = structuredClone(s)
    expect(() => simulateEstimatorYear(s, year(s, overrides), callback)).toThrow()
    expect(callback).not.toHaveBeenCalled()
    expect(s).toEqual(snapshot)
  })
})
