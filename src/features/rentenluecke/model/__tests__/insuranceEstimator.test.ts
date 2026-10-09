import { describe, expect, it, vi } from 'vitest'
import { calculateContributions } from '../contributions/contributionEngine'
import { indexedContributionThresholds } from '../contributions/rules2026'
import { assessCapitalIncome, calculateVorabpauschale, createEstimatorState,
  simulateEstimatorYear, withdrawProportionally, type EstimatorBucket, type EstimatorState,
  type EstimatorYearInput } from '../capitalIncome/insuranceEstimator'
import { scaledSparerpauschbetrag } from '../tax/capitalIncomeTax'
import { assessCore } from '../tax/pureCore'
import { assessPensionYearTaxValues, createPensionTaxSetup, incomeTax32a2026 } from '../tax/incomeTax'
import { marginalTargetsForAdditionalWealth } from '../capitalIncome/allocationEvent'

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

describe('drift without annual trades (no target restoration)', () => {
  it('leaves small rebalancing gains untaxed below the scaled allowance (hand-computed)', () => {
    // Fund 1,000 (cost 500) + bank 1,000, no VP history, basis 0 → VP 0.
    // Fund +100% → 2,000; bank 0% → 1,000; total 3,000. Drift performs no
    // trades, so no gains are realized: movement and sale gains are both 0.
    // Tax base 0 < 1,000 → tax 0, no funding sale.
    const s = initial([fund(1000), bank(1000)], 500)
    const r = simulateEstimatorYear(s, year(s, {
      projectedBasisRate: 0,
      spendingLessOtherIncome: 0,
      withdrawalTax: { openingLossCarryforward: 0, allowanceAvailable: scaledSparerpauschbetrag(1) },
      buckets: [
        { id: 'fund', totalReturnRate: 1, contribution: 0 },
        { id: 'bank', totalReturnRate: 0, contribution: 0 },
      ],
    }), noInsurance)
    expect(r.status).toBe('converged')
    expect(r.movement.adjustedFundSaleGain).toBeCloseTo(0, 9)
    expect(r.movement.fundSales).toBeCloseTo(0, 9)
    expect(r.movement.fundPurchases).toBeCloseTo(0, 9)
    expect(r.sale.adjustedFundSaleGain).toBeCloseTo(0, 9)
    expect(r.withdrawalTax!.taxableWithdrawal).toBeCloseTo(0, 9)
    expect(r.withdrawalTax!.sparerpauschbetragApplied).toBeCloseTo(0, 9)
    expect(r.withdrawalTax!.capitalIncomeTax).toBe(0)
    expect(r.paidWithdrawal).toBe(0)
    expect(r.closingState!.buckets.find(b => b.id === 'fund')!.value).toBeCloseTo(2_000, 9)
    expect(r.closingState!.buckets.find(b => b.id === 'bank')!.value).toBeCloseTo(1_000, 9)
    expect(r.closingState!.fundAcquisitionCost).toBeCloseTo(500, 9)
    expect(r.closingCapital).toBeCloseTo(3_000, 9)
    expect(r.closingCapital).toBeCloseTo(r.openingCapital + r.investmentReturn + r.contribution - r.paidWithdrawal, 9)
  })

  it('taxes only interest and funding-sale gains with a scaled allowance (drift, hand-computed)', () => {
    // Fund 60,000 (cost 30,000) + bank 40,000; fund +50%, bank +2%; drift.
    // No movement gains exist; the only assessable income is the once-credited
    // gross bank interest (bank +2% on 40,000 = 800, unexempted).
    // Tax identity (same assessCore path): taxable = (sale + 0 + VP) × 0.7.
    // 800 < 1,050 allowance → tax 0, no funding sale.
    const s = initial([fund(60000), bank(40000)], 30000)
    const allowance = scaledSparerpauschbetrag(1.05)
    expect(allowance).toBeCloseTo(1_050, 9)
    const r = simulateEstimatorYear(s, year(s, {
      projectedBasisRate: 0,
      spendingLessOtherIncome: 0,
      withdrawalTax: { openingLossCarryforward: 0, allowanceAvailable: allowance },
      buckets: [
        { id: 'fund', totalReturnRate: 0.5, contribution: 0 },
        { id: 'bank', totalReturnRate: 0.02, contribution: 0 },
      ],
    }), noInsurance)
    expect(r.status).toBe('converged')
    expect(r.movement.adjustedFundSaleGain).toBeCloseTo(0, 9)
    expect(r.withdrawalTax!.capitalIncomeTax).toBe(0)
    // Same-path check: engine tax equals hand-applied assessCore on the realized
    // gains plus the once-credited gross bank interest (bank +2% on 40,000 = 800,
    // unexempted, in the single shared assessment).
    expect(r.bankInterest).toBeCloseTo(800, 9)
    const expected = assessCore(
      r.sale.adjustedFundSaleGain + r.movement.adjustedFundSaleGain,
      r.receivedVorabpauschale, 0, allowance, true, r.bankInterest)
    expect(r.withdrawalTax!.taxableWithdrawal).toBeCloseTo(expected.taxableWithdrawal, 9)
    expect(r.withdrawalTax!.capitalIncomeTax).toBeCloseTo(expected.capitalIncomeTax, 9)
    expect(r.paidWithdrawal).toBe(0)
    expect(r.requiredWithdrawal).toBe(0)
    expect(r.closingCapital).toBeCloseTo(
      r.openingCapital + r.investmentReturn + r.contribution - r.paidWithdrawal, 9)
  })

  it('offsets an opening loss before the scaled allowance without any trades (drift)', () => {
    // Drift realizes nothing, so the 800 interest meets the 4,000 opening loss
    // first: taxable base 0, tax 0, closing loss 3,200 carried forward once.
    const s = { ...initial([fund(60000), bank(40000)], 30000), simulatedLossCarryforward: 4_000 }
    const allowance = scaledSparerpauschbetrag(1.05)
    const r = simulateEstimatorYear(s, year(s, {
      projectedBasisRate: 0,
      spendingLessOtherIncome: 0,
      withdrawalTax: { openingLossCarryforward: 4_000, allowanceAvailable: allowance },
      buckets: [
        { id: 'fund', totalReturnRate: 0.5, contribution: 0 },
        { id: 'bank', totalReturnRate: 0.02, contribution: 0 },
      ],
    }), noInsurance)
    expect(r.status).toBe('converged')
    expect(r.movement.adjustedFundSaleGain).toBeCloseTo(0, 9)
    expect(r.bankInterest).toBeCloseTo(800, 9)
    const expected = assessCore(
      r.sale.adjustedFundSaleGain + r.movement.adjustedFundSaleGain,
      r.receivedVorabpauschale, 4_000, allowance, true, r.bankInterest)
    expect(r.withdrawalTax!.taxableBase).toBeCloseTo(expected.taxableBase, 9)
    expect(r.withdrawalTax!.capitalIncomeTax).toBeCloseTo(expected.capitalIncomeTax, 9)
    expect(r.withdrawalTax!.capitalIncomeTax).toBe(0)
    expect(r.withdrawalTax!.closingLossCarryforward).toBeCloseTo(3_200, 9)
    expect(r.closingState!.simulatedLossCarryforward).toBeCloseTo(3_200, 9)
  })
})

describe('one-time allocation event (Arbeitsende settlement)', () => {
  it('realizes the 50/50 remainder trade with pooled cost release (hand-computed)', () => {
    // Same setup as the drift case above, but the event allocates the 3,000 net
    // base 50/50: fund sale 500; cost released 500×(500/2,000) = 125;
    // movement gain 500 − 125 − 0 = 375. Tax base 375 × 0.7 = 262.5 < 1,000
    // → tax 0, no funding sale.
    const s = initial([fund(1000), bank(1000)], 500)
    const r = simulateEstimatorYear(s, year(s, {
      projectedBasisRate: 0,
      spendingLessOtherIncome: 0,
      withdrawalTax: { openingLossCarryforward: 0, allowanceAvailable: scaledSparerpauschbetrag(1) },
      allocationEvent: { fixedTargets: [], remainderWeights: { fund: 0.5, bank: 0.5 }, inflationFactor: 1 },
      buckets: [
        { id: 'fund', totalReturnRate: 1, contribution: 0 },
        { id: 'bank', totalReturnRate: 0, contribution: 0 },
      ],
    }), noInsurance)
    expect(r.status).toBe('converged')
    expect(r.movement.fundSales).toBeCloseTo(500, 9)
    expect(r.movement.adjustedFundSaleGain).toBeCloseTo(375, 9)
    expect(r.sale.adjustedFundSaleGain).toBeCloseTo(0, 9)
    expect(r.withdrawalTax!.taxableWithdrawal).toBeCloseTo(262.5, 9)
    expect(r.withdrawalTax!.sparerpauschbetragApplied).toBeCloseTo(262.5, 9)
    expect(r.withdrawalTax!.capitalIncomeTax).toBe(0)
    expect(r.paidWithdrawal).toBe(0)
    expect(r.eventSurplusDeposit).toBe(0)
    expect(r.roundingExcess).toBe(0)
    expect(r.closingState!.buckets.find(b => b.id === 'fund')!.value).toBeCloseTo(1_500, 9)
    expect(r.closingState!.buckets.find(b => b.id === 'bank')!.value).toBeCloseTo(1_500, 9)
    expect(r.closingState!.fundAcquisitionCost).toBeCloseTo(500 - 125, 9)
    expect(r.closingCapital).toBeCloseTo(3_000, 9)
  })

  it('funds large event gains through the same tax path with a scaled allowance', () => {
    // Fund 60,000 (cost 30,000) + bank 40,000; fund +50%, bank +2%; event 60/40.
    // Post-return 90,000/40,800 (H = 130,800). The converged trial funds the tax
    // itself (paid = tax), so the event base shrinks to B = H - paid and the sale
    // pins are the funding fixed point, verified identity by identity:
    // paid = tax = 1,459.7878; funding sale gain = paid x 60,000/130,800 = 669.6274;
    // event fund sale = 11,520 - paid x (90,000/130,800 - 0.6) = 11,391.4315;
    // cost released = (30,000 - funding release) x sale/post-sale-fund = 3,797.1438;
    // movement gain = 7,594.2877; taxable = (669.6274 + 7,594.2877) x 0.7 + 800
    // bank interest = 6,584.7406; tax = (6,584.7406 - 1,050) x 0.25 x 1.055.
    const s = initial([fund(60000), bank(40000)], 30000)
    const allowance = scaledSparerpauschbetrag(1.05)
    const r = simulateEstimatorYear(s, year(s, {
      projectedBasisRate: 0,
      spendingLessOtherIncome: 0,
      withdrawalTax: { openingLossCarryforward: 0, allowanceAvailable: allowance },
      allocationEvent: { fixedTargets: [], remainderWeights: { fund: 0.6, bank: 0.4 }, inflationFactor: 1 },
      buckets: [
        { id: 'fund', totalReturnRate: 0.5, contribution: 0 },
        { id: 'bank', totalReturnRate: 0.02, contribution: 0 },
      ],
    }), noInsurance)
    expect(r.status).toBe('converged')
    expect(r.movement.fundSales).toBeCloseTo(11_391.431530450369, 6)
    expect(r.movement.costReleased).toBeCloseTo(3_797.143843483456, 6)
    expect(r.movement.adjustedFundSaleGain).toBeCloseTo(7_594.287686966913, 6)
    expect(r.sale.adjustedFundSaleGain).toBeCloseTo(669.6274455710156, 6)
    expect(r.withdrawalTax!.capitalIncomeTax).toBeGreaterThan(0)
    expect(r.bankInterest).toBeCloseTo(800, 9)
    const expected = assessCore(
      r.sale.adjustedFundSaleGain + r.movement.adjustedFundSaleGain,
      r.receivedVorabpauschale, 0, allowance, true, r.bankInterest)
    expect(r.withdrawalTax!.taxableWithdrawal).toBeCloseTo(expected.taxableWithdrawal, 9)
    expect(r.withdrawalTax!.capitalIncomeTax).toBeCloseTo(expected.capitalIncomeTax, 9)
    // Funding: the single paid sale covers the tax (gap and insurance are zero).
    expect(r.paidWithdrawal).toBeCloseTo(r.withdrawalTax!.capitalIncomeTax, 6)
    expect(r.requiredWithdrawal).toBeCloseTo(r.withdrawalTax!.capitalIncomeTax, 6)
    expect(r.closingCapital).toBeCloseTo(
      r.openingCapital + r.investmentReturn + r.contribution - r.paidWithdrawal, 9)
  })

  it('fills fixed priorities sequentially and splits the rest by weight (hand-computed)', () => {
    // Net base 3,000; fixed 2,000 today's euros to bank (priority 1, factor 1),
    // remainder 1,000 by weights fund 0.25 / bank 0.75: fund 250, bank 2,750.
    // Bank moves are principal shifts (no gain); fund sale 2,000−250 = 1,750
    // releases cost 500×(1,750/2,000) = 437.5 → gain 1,312.5.
    // Tax base 1,312.5 × 0.7 = 918.75 < 1,000 → tax 0.
    const s = initial([fund(1000), bank(1000)], 500)
    const r = simulateEstimatorYear(s, year(s, {
      projectedBasisRate: 0,
      spendingLessOtherIncome: 0,
      withdrawalTax: { openingLossCarryforward: 0, allowanceAvailable: scaledSparerpauschbetrag(1) },
      allocationEvent: { fixedTargets: [{ bucketId: 'bank', amountToday: 2000 }], remainderWeights: { fund: 0.25, bank: 0.75 }, inflationFactor: 1 },
      buckets: [
        { id: 'fund', totalReturnRate: 1, contribution: 0 },
        { id: 'bank', totalReturnRate: 0, contribution: 0 },
      ],
    }), noInsurance)
    expect(r.status).toBe('converged')
    expect(r.movement.adjustedFundSaleGain).toBeCloseTo(1_312.5, 9)
    expect(r.withdrawalTax!.capitalIncomeTax).toBe(0)
    expect(r.closingState!.buckets.find(b => b.id === 'fund')!.value).toBeCloseTo(250, 9)
    expect(r.closingState!.buckets.find(b => b.id === 'bank')!.value).toBeCloseTo(2_750, 9)
    expect(r.closingCapital).toBeCloseTo(3_000, 9)
  })

  it('rejects an actual impossible purchase at zero NAV but resolves zero targets', () => {
    // Collapsed fund (return −1, value 0): allocating a positive remainder to it
    // is an impossible purchase and throws truthfully. A zero remainder share
    // resolves zero targets without throwing.
    const s = initial([fund(1000), bank(1000)], 500)
    const buckets = [
      { id: 'fund', totalReturnRate: -1, contribution: 0 },
      { id: 'bank', totalReturnRate: 0, contribution: 0 },
    ]
    expect(() => simulateEstimatorYear(s, year(s, {
      projectedBasisRate: 0,
      spendingLessOtherIncome: 0,
      allocationEvent: { fixedTargets: [], remainderWeights: { fund: 0.5, bank: 0.5 }, inflationFactor: 1 },
      buckets,
    }), noInsurance)).toThrow(/zero NAV/)
    const zeroShare = simulateEstimatorYear(s, year(s, {
      projectedBasisRate: 0,
      spendingLessOtherIncome: 0,
      allocationEvent: { fixedTargets: [], remainderWeights: { fund: 0, bank: 1 }, inflationFactor: 1 },
      buckets,
    }), noInsurance)
    expect(zeroShare.status).toBe('converged')
    expect(zeroShare.closingState!.buckets.find(b => b.id === 'fund')!.value).toBe(0)
    expect(zeroShare.closingState!.buckets.find(b => b.id === 'bank')!.value).toBeCloseTo(1_000, 9)
  })
})

describe('signed event-year solve (surplus inside the trial, never post-hoc)', () => {
  // Hand-derived regression: fund 60,000 (cost 0, full embedded gain) + bank
  // 40,000, zero returns, other income 36,000, spending 0, target 50/50.
  // Signed need N = -36,000, so the trial converges at y = -36,000 with the
  // genuine surplus as the trial deposit: base B = 100,000 + 36,000 = 136,000,
  // targets 68,000/68,000 — the fund grows 60,000 -> 68,000 (purchase only).
  // The rejected post-hoc route solved T(100,000) = 50,000/50,000 first (fund
  // sale 10,000, taxed embedded gain), then bought back 18,000: same 68,000
  // landing split but a phantom taxed sale plus an overtaxed surplus.
  const surplusEvent = {
    projectedBasisRate: 0.02,
    spendingLessOtherIncome: -36000,
    withdrawalTax: { openingLossCarryforward: 0, allowanceAvailable: scaledSparerpauschbetrag(1) },
    allocationEvent: { fixedTargets: [], remainderWeights: { fund: 0.5, bank: 0.5 }, inflationFactor: 1 },
    buckets: [
      { id: 'fund', totalReturnRate: 0, contribution: 0 },
      { id: 'bank', totalReturnRate: 0, contribution: 0 },
    ],
  }
  it('funds the surplus through T(H + S) with no phantom fund sale', () => {
    const s = initial([fund(60000), bank(40000)], 0)
    const r = simulateEstimatorYear(s, year(s, surplusEvent), noInsurance)
    expect(r.status).toBe('converged')
    expect(r.genuineNeed).toBeCloseTo(-36000, 9)
    expect(r.trialDeposit).toBeCloseTo(36000, 9)
    expect(r.eventSurplusDeposit).toBeCloseTo(36000, 9)
    expect(r.roundingExcess).toBe(0)
    expect(r.paidWithdrawal).toBe(0)
    expect(r.requiredWithdrawal).toBe(0)
    // No sale anywhere: neither the funding leg nor the event leg sells fund.
    expect(r.sale.fundProceeds).toBe(0)
    expect(r.movement.fundSales).toBe(0)
    expect(r.movement.fundPurchases).toBeCloseTo(8000, 9)
    // Embedded gain stays unrealized, so the shared assessment taxes nothing.
    expect(r.withdrawalTax!.capitalIncomeTax).toBe(0)
    expect(r.closingState!.buckets.find(b => b.id === 'fund')!.value).toBeCloseTo(68000, 9)
    expect(r.closingState!.buckets.find(b => b.id === 'bank')!.value).toBeCloseTo(68000, 9)
    expect(r.closingCapital).toBeCloseTo(136000, 9)
    expect(r.closingState!.fundAcquisitionCost).toBeCloseTo(8000, 9)
    // December purchases earn no current-year return and accrue no VP without gains.
    expect(r.pendingVorabpauschale).toBe(0)
    // Cash conservation: closing = opening + return + contribution - paid + S + E.
    expect(r.closingCapital).toBeCloseTo(
      r.openingCapital + r.investmentReturn + r.contribution - r.paidWithdrawal + r.trialDeposit + r.roundingExcess, 9)
  })
  it('carries VP, opening loss, KV/PV and pension extras exactly once', () => {
    // Variant with fund +5%: H = 103,000, base 139,000 -> 69,500/69,500, still
    // purchase-only (post-sale fund 63,000 < 69,500). The January holding VP and
    // the December purchase VP accrue once each for next year.
    const s = initial([fund(60000), bank(40000)], 0)
    const r = simulateEstimatorYear(s, year(s, {
      ...surplusEvent,
      buckets: [
        { id: 'fund', totalReturnRate: 0.05, contribution: 0 },
        { id: 'bank', totalReturnRate: 0, contribution: 0 },
      ],
    }), noInsurance)
    expect(r.status).toBe('converged')
    expect(r.movement.fundSales).toBe(0)
    expect(r.withdrawalTax!.capitalIncomeTax).toBe(0)
    expect(r.closingState!.buckets.find(b => b.id === 'fund')!.value).toBeCloseTo(69500, 6)
    expect(r.closingState!.buckets.find(b => b.id === 'bank')!.value).toBeCloseTo(69500, 6)
    const holdingVp = calculateVorabpauschale({ startValue: 60000, endValue: 63000, projectedBasisRate: 0.02, acquisitionMonth: 1 })
    const purchaseVp = calculateVorabpauschale({ startValue: 6500 / 1.05, endValue: 6500, projectedBasisRate: 0.02, acquisitionMonth: 12 })
    expect(r.pendingVorabpauschale).toBeCloseTo(holdingVp + purchaseVp, 9)
    expect(r.closingState!.fundAcquisitionCost).toBeCloseTo(6500, 9)
    // Opening loss with no realized gains is carried through untouched (never
    // consumed twice, never dropped). The loss lives on the estimator state for
    // the assessment carryforward; the withdrawal-tax input mirrors the ledger's
    // single-source wiring into the shared capital-tax core.
    const lossState = { ...initial([fund(60000), bank(40000)], 0), simulatedLossCarryforward: 5000 }
    const loss = simulateEstimatorYear(lossState, year(lossState, {
      ...surplusEvent,
      withdrawalTax: { openingLossCarryforward: 5000, allowanceAvailable: scaledSparerpauschbetrag(1) },
    }), noInsurance)
    expect(loss.status).toBe('converged')
    expect(loss.assessment.closingSimulatedLoss).toBe(5000)
    expect(loss.closingCapital).toBeCloseTo(136000, 9)
    // KV/PV enter the signed need once: N = -36,000 + 1,800 = -34,200.
    const kvpv = simulateEstimatorYear(s, year(s, surplusEvent), () => ({ kv: 1200, pv: 600 }))
    expect(kvpv.status).toBe('converged')
    expect(kvpv.genuineNeed).toBeCloseTo(-34200, 9)
    expect(kvpv.trialDeposit).toBeCloseTo(34200, 9)
    expect(kvpv.movement.fundSales).toBe(0)
    expect(kvpv.closingState!.buckets.find(b => b.id === 'fund')!.value).toBeCloseTo(67100, 6)
    expect(kvpv.closingState!.buckets.find(b => b.id === 'bank')!.value).toBeCloseTo(67100, 6)
    // Pension extra enters once: N = -36,000 + 800 = -35,200.
    const pension = simulateEstimatorYear(s, year(s, surplusEvent), noInsurance,
      { additionalRequirementForTrial: () => 800 })
    expect(pension.status).toBe('converged')
    expect(pension.genuineNeed).toBeCloseTo(-35200, 9)
    expect(pension.trialDeposit).toBeCloseTo(35200, 9)
    expect(pension.closingState!.buckets.find(b => b.id === 'fund')!.value).toBeCloseTo(67600, 6)
  })
  it('funds an income surplus larger than holdings (no -H clamp)', () => {
    // Income 150,000 against H = 100,000: low = -150,000 (not clamped to
    // -100,000), base 250,000 -> 125,000/125,000 with no fund sale and no tax.
    const s = initial([fund(60000), bank(40000)], 0)
    const r = simulateEstimatorYear(s, year(s, { ...surplusEvent, spendingLessOtherIncome: -150000 }), noInsurance)
    expect(r.status).toBe('converged')
    expect(r.trialDeposit).toBeCloseTo(150000, 9)
    expect(r.movement.fundSales).toBe(0)
    expect(r.withdrawalTax!.capitalIncomeTax).toBe(0)
    expect(r.closingState!.buckets.find(b => b.id === 'fund')!.value).toBeCloseTo(125000, 9)
    expect(r.closingState!.buckets.find(b => b.id === 'bank')!.value).toBeCloseTo(125000, 9)
    expect(r.closingCapital).toBeCloseTo(250000, 9)
  })
  it('solves a positive signed need with one shared tax, loss and allowance', () => {
    // Spending 20,000, cost 0, loss 5,000, allowance 1,000, 50/50 from 60/40:
    // total fund sales = 0.5y + 10,000, so the root funds spending plus its own
    // tax. The committed tax must equal a single assessCore over the combined
    // funding + event gains with one loss offset and one allowance.
    const s = initial([fund(60000), bank(40000)], 0)
    const r = simulateEstimatorYear(s, year(s, {
      ...surplusEvent,
      spendingLessOtherIncome: 20000,
      withdrawalTax: { openingLossCarryforward: 5000, allowanceAvailable: scaledSparerpauschbetrag(1) },
    }), noInsurance)
    expect(r.status).toBe('converged')
    expect(Math.abs(r.residual)).toBeLessThanOrEqual(0.000001)
    expect(r.paidWithdrawal).toBeGreaterThan(20000)
    expect(r.genuineNeed).toBeCloseTo(20000 + r.withdrawalTax!.capitalIncomeTax, 6)
    const expected = assessCore(
      r.sale.adjustedFundSaleGain + r.movement.adjustedFundSaleGain,
      r.receivedVorabpauschale, 5000, scaledSparerpauschbetrag(1), true, r.bankInterest)
    expect(r.withdrawalTax!.capitalIncomeTax).toBeCloseTo(expected.capitalIncomeTax, 9)
    // Joint funding identity: every sold fund euro is either the funding leg
    // (60% of paid) or the event rebalancing leg (10,000 - 10% of paid).
    expect(r.sale.fundProceeds + r.movement.fundSales).toBeCloseTo(0.5 * r.paidWithdrawal + 10000, 6)
    // 50/50 landing split of the settled base plus the (here zero) rounding:
    // closing halves match because contributions are zero.
    expect(r.closingState!.buckets.find(b => b.id === 'fund')!.value).toBeCloseTo(r.closingCapital / 2, 6)
    expect(r.closingState!.buckets.find(b => b.id === 'bank')!.value).toBeCloseTo(r.closingCapital / 2, 6)
    expect(r.closingCapital).toBeCloseTo(100000 - r.paidWithdrawal + r.roundingExcess, 6)
  })
})

describe('event-year solver honesty (no high-negative shortfall proof)', () => {
  // Threshold KV burden on the shared assessment: 200,000 once the assessment
  // reaches 30,000. The assessment is post-Teilfreistellung/post-allowance, so
  // the full-sale assessment is 60,000 x 0.7 - 51 = 41,949 (11,949 margin) and
  // the half-sale assessment is 30,000 x 0.7 - 51 = 20,949 (9,051 margin).
  const thresholdInsurance = (assessment: number) => assessment >= 30000 ? { kv: 200000, pv: 0 } : { kv: 0, pv: 0 }
  const honestSetup = (overrides: Partial<EstimatorYearInput> = {}): EstimatorYearInput => {
    const s = initial([fund(60000), bank(40000)], 0)
    return year(s, {
      projectedBasisRate: 0.02,
      spendingLessOtherIncome: 10000,
      withdrawalTax: { openingLossCarryforward: 0, allowanceAvailable: scaledSparerpauschbetrag(1) },
      allocationEvent: { fixedTargets: [], remainderWeights: { fund: 0.6, bank: 0.4 }, inflationFactor: 1 },
      buckets: [
        { id: 'fund', totalReturnRate: 0, contribution: 0 },
        { id: 'bank', totalReturnRate: 0, contribution: 0 },
      ],
      ...overrides,
    })
  }
  it('validates a smaller root in the event year where ordinary logic sees only shortfall', () => {
    const s = initial([fund(60000), bank(40000)], 0)
    const event = simulateEstimatorYear(s, honestSetup(), thresholdInsurance)
    expect(event.status).toBe('converged')
    expect(Math.abs(event.residual)).toBeLessThanOrEqual(0.000001)
    // The validated root funds ~10k spending plus its own small sale tax with a
    // far smaller sale than full holdings — despite the negative high trial.
    expect(event.paidWithdrawal).toBeGreaterThan(0)
    expect(event.paidWithdrawal).toBeLessThan(50000)
    expect(event.closingCapital).toBeCloseTo(100000 - event.paidWithdrawal + event.roundingExcess, 6)
    expect(event.closingState!.buckets.find(b => b.id === 'fund')!.value)
      .toBeCloseTo(0.6 * (100000 - event.paidWithdrawal + event.roundingExcess), 4)
    // Same callback without the event: low trial already needs 10k, the full
    // sale trips the 200k burden, high residual deeply negative -> shortfall
    // with a committable full-sale state and preserved unpaid liabilities.
    const plain = simulateEstimatorYear(s, honestSetup({ allocationEvent: undefined }), thresholdInsurance)
    expect(plain.status).toBe('shortfall')
    expect(plain.closingState).not.toBeNull()
    expect(plain.paidWithdrawal).toBeCloseTo(100000, 9)
    expect(plain.unfundedWithdrawal).toBeGreaterThan(0)
  })
  it('reports demonstrable shortfall only when the gap alone exceeds holdings', () => {
    // Spending 120,000 against H = 100,000: even with zero charges the need
    // exceeds holdings, so shortfall with preserved unpaid liabilities.
    const s = initial([fund(60000), bank(40000)], 0)
    const r = simulateEstimatorYear(s, honestSetup({ spendingLessOtherIncome: 120000 }), thresholdInsurance)
    expect(r.status).toBe('shortfall')
    expect(r.closingState).not.toBeNull()
    expect(r.paidWithdrawal).toBeCloseTo(100000, 9)
    expect(r.unfundedWithdrawal).toBeGreaterThan(0)
  })
  it('reports nonconvergence (not insolvency) when no root validates without proof', () => {
    // A constant 200,000 extra makes every trial unfundable, but the
    // lower-bound proof (10,000 gap vs 100,000 holdings) cannot show it, so the
    // honest outcome is the nonconverged diagnostic with no committable state.
    const s = initial([fund(60000), bank(40000)], 0)
    const r = simulateEstimatorYear(s, honestSetup(), noInsurance,
      { additionalRequirementForTrial: () => 200000 })
    expect(r.status).toBe('nonconverged')
    expect(r.closingState).toBeNull()
  })
})

describe('pension-rounding excess across partially funded fixed priorities', () => {
  // Spending 99,999.50 against H = 100,000 with zero charges by construction
  // (full cost basis, zero returns, zero VP gains, zero interest, zero
  // insurance/extra): the high trial overfunds by exactly 0.50 EUR, inside
  // fundedExcessBound = 2. With a controlled loop budget of 1 the search cannot
  // validate directly, so the production bounded-candidate branch commits the
  // high-side trial and conserves the 0.50 excess as marginal purchases
  // T(0 + E) - T(0): the first fixed priority (bank 30,000, partially funded)
  // absorbs it all. The twin with the full loop budget converges to the exact
  // root instead (E near zero) and lands on the same 0.50 bank repurchase.
  const roundingInput = (maxIterations: number) => {
    const s = initial([fund(60000), bank(40000)], 60000)
    return { state: s, input: year(s, {
      projectedBasisRate: 0.02,
      spendingLessOtherIncome: 99999.5,
      withdrawalTax: { openingLossCarryforward: 0, allowanceAvailable: scaledSparerpauschbetrag(1) },
      allocationEvent: { fixedTargets: [{ bucketId: 'bank', amountToday: 30000 }, { bucketId: 'fund', amountToday: 40000 }],
        remainderWeights: { bank: 1 }, inflationFactor: 1 },
      buckets: [
        { id: 'fund', totalReturnRate: 0, contribution: 0 },
        { id: 'bank', totalReturnRate: 0, contribution: 0 },
      ],
      maxIterations,
    }) }
  }
  it('commits the bounded high-side candidate and routes it to the partial fixed priority', () => {
    const { state, input } = roundingInput(1)
    const r = simulateEstimatorYear(state, input, noInsurance, { fundedExcessBound: 2 })
    expect(r.status).toBe('converged')
    expect(r.iterations).toBe(1)
    expect(r.genuineNeed).toBeCloseTo(99999.5, 9)
    expect(r.paidWithdrawal).toBeCloseTo(100000, 9)
    expect(r.unfundedWithdrawal).toBe(0)
    // The bounded excess is exactly the high-side overfunding.
    expect(r.roundingExcess).toBeCloseTo(0.5, 9)
    expect(r.excessRepurchase).toBeCloseTo(0.5, 9)
    expect(r.trialDeposit).toBe(0)
    // Settled base zero; the marginal T(0.5) - T(0) lands fully on the first
    // (partially funded) fixed priority, matching the pure helper exactly.
    const views = [{ id: 'fund', eligibility: 'accumulating-equity-fund' as const }, { id: 'bank', eligibility: 'ordinary-bank-deposit' as const }]
    const marginals = marginalTargetsForAdditionalWealth({ netWealth: 0, baseWealth: 0,
      additionalWealth: 0.5, inflationFactor: 1, buckets: views,
      fixedTargets: input.allocationEvent!.fixedTargets, remainderWeights: { bank: 1 } })
    expect(marginals.find(m => m.id === 'bank')!.additional).toBeCloseTo(0.5, 9)
    expect(marginals.find(m => m.id === 'fund')!.additional).toBe(0)
    expect(r.closingState!.buckets.find(b => b.id === 'bank')!.value).toBeCloseTo(0.5, 9)
    expect(r.closingState!.buckets.find(b => b.id === 'fund')!.value).toBe(0)
    expect(r.closingCapital).toBeCloseTo(0.5, 9)
    // Purchases only, bank leg: no euro cost, no December VP, loss untouched.
    expect(r.closingState!.fundAcquisitionCost).toBe(0)
    expect(r.pendingVorabpauschale).toBe(0)
    expect(r.assessment.closingSimulatedLoss).toBe(0)
    expect(r.withdrawalTax!.capitalIncomeTax).toBe(0)
  })
  it('reaches the same landing through the exact root with a full loop budget', () => {
    const { state, input } = roundingInput(100)
    const r = simulateEstimatorYear(state, input, noInsurance, { fundedExcessBound: 2 })
    expect(r.status).toBe('converged')
    expect(Math.abs(r.residual)).toBeLessThanOrEqual(0.000001)
    // Directly validated: the excess is dust, the paid sale stops 0.50 short
    // of full holdings, and the settled base itself carries the 0.50.
    expect(r.roundingExcess).toBeLessThanOrEqual(0.000001)
    expect(r.paidWithdrawal).toBeCloseTo(99999.5, 3)
    expect(r.closingState!.buckets.find(b => b.id === 'bank')!.value).toBeCloseTo(0.5, 3)
    expect(r.closingState!.buckets.find(b => b.id === 'fund')!.value).toBe(0)
    expect(r.closingCapital).toBeCloseTo(0.5, 3)
  })
  it('conserves a statutory pension-floor excess on a partially funded fund priority with cost and December VP', () => {
    // Genuine statutory feedback (not a constant 800 or zero-charge plumbing):
    // GRV 24,000 with the 2027 84.5% setup has its 1-EUR floor edge at kv 7822/7824
    // (tax 1 vs 0 at factor 1). Fixed-kv twins converge at assessments 7458.83
    // (kv 7822, tax 1716.97) and 7459.31 (kv 7824, tax 1717.10). The test-double
    // insurance leg steps DOWN across 7459 (7824 below, 7822 above), so totals are
    // 7824+0=7824 below and 7822+1=7823 above: a genuine -1 EUR downward jump in
    // N at the threshold with no exact root. Spending 8000 against H = 103,000
    // (fund 60,000 at +5% plus bank 40,000, zero cost basis) settles at base
    // ~85459.64 below the first fixed priority (fund 86,000), so the fund leg is
    // only partially funded; the bounded floor excess (<= 2 nominal,
    // fundedExcessBound = 2) is conserved as fund marginal purchases with real
    // euro cost and one December VP each.
    const setup = createPensionTaxSetup({ scope: 'grv-single-domestic-post-2023-no-other-income', startYear: 2027, firstYearGrvGross: 24000 })
    expect(assessPensionYearTaxValues(setup, 24000, 7822, 0, 1).pensionIncomeTax).toBe(1)
    expect(assessPensionYearTaxValues(setup, 24000, 7824, 0, 1).pensionIncomeTax).toBe(0)
    expect(incomeTax32a2026(12355)).toBe(0)
    expect(incomeTax32a2026(12356)).toBe(1)
    const s = initial([fund(60000), bank(40000)], 0)
    const pensionFloorExtra = (insurance: { kv: number; pv: number }) =>
      assessPensionYearTaxValues(setup, 24000, insurance.kv, insurance.pv, 1).pensionIncomeTax
    const steppingInsurance = (assessment: number) => (assessment > 7459 ? { kv: 7822, pv: 0 } : { kv: 7824, pv: 0 })
    const input = year(s, {
      projectedBasisRate: 0.02,
      spendingLessOtherIncome: 8000,
      withdrawalTax: { openingLossCarryforward: 0, allowanceAvailable: scaledSparerpauschbetrag(1) },
      allocationEvent: { fixedTargets: [{ bucketId: 'fund', amountToday: 86000 }, { bucketId: 'bank', amountToday: 40000 }],
        remainderWeights: { fund: 1 }, inflationFactor: 1 },
      buckets: [
        { id: 'fund', totalReturnRate: 0.05, contribution: 0 },
        { id: 'bank', totalReturnRate: 0, contribution: 0 },
      ],
    })
    const r = simulateEstimatorYear(s, input, steppingInsurance, { additionalRequirementForTrial: pensionFloorExtra, fundedExcessBound: 2 })
    expect(r.status).toBe('converged')
    expect(r.roundingExcess).toBeGreaterThan(0.000001)
    expect(r.roundingExcess).toBeLessThanOrEqual(2.000001)
    expect(r.excessRepurchase).toBeCloseTo(r.roundingExcess, 9)
    // Partially funded fund priority absorbs the marginal: fund close exceeds the
    // settled base share by the fund marginal, cost and December VP are real.
    const views = [{ id: 'fund', eligibility: 'accumulating-equity-fund' as const }, { id: 'bank', eligibility: 'ordinary-bank-deposit' as const }]
    const base = r.openingCapital + r.investmentReturn - r.paidWithdrawal + r.trialDeposit
    const marginals = marginalTargetsForAdditionalWealth({ netWealth: base, baseWealth: base,
      additionalWealth: r.roundingExcess, inflationFactor: 1, buckets: views,
      fixedTargets: input.allocationEvent!.fixedTargets, remainderWeights: { fund: 1 } })
    const fundMarginal = marginals.find(m => m.id === 'fund')!.additional
    expect(fundMarginal).toBeCloseTo(r.roundingExcess, 6)
    expect(marginals.find(m => m.id === 'bank')!.additional).toBeCloseTo(0, 9)
    if (r.roundingExcess > 0.000001) {
      expect(r.closingState!.fundAcquisitionCost).toBeGreaterThan(0)
      const expectedVP = calculateVorabpauschale({ startValue: fundMarginal / 1.05, endValue: fundMarginal, projectedBasisRate: 0.02, acquisitionMonth: 12 })
      expect(r.pendingVorabpauschale).toBeGreaterThanOrEqual(expectedVP - 1e-9)
      expect(r.closingCapital).toBeCloseTo(base + r.contribution + r.roundingExcess + r.contribution * 0, 6)
    }
    expect(r.closingCapital).toBeCloseTo(r.openingCapital + r.investmentReturn + r.contribution - r.paidWithdrawal + r.trialDeposit + r.roundingExcess, 6)
  })
})
