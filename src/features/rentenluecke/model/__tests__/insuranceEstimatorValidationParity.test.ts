import { describe, expect, it, vi } from 'vitest'
import { assessCapitalIncome, createEstimatorState, simulateEstimatorYear, withdrawProportionally } from '../capitalIncome/insuranceEstimator'

const independentFund = (value: number, id = 'eq-independent') => ({ id, value, eligibility: 'accumulating-equity-fund' as const })
const independentBank = (value: number, id = 'cash-independent') => ({ id, value, eligibility: 'ordinary-bank-deposit' as const })
const independentInitial = () => createEstimatorState({
  buckets: [independentFund(2375), independentBank(4810)],
  fundAcquisitionCost: 1120,
  scope: 'single-person-domestic-private-post-2017-no-special-events',
  lossHistory: 'confirmed-none-and-no-external-offsets',
})
const independentYear = (state: ReturnType<typeof independentInitial>, overrides = {}) => ({
  projectedBasisRate: 0.023,
  spendingLessOtherIncome: 617,
  buckets: state.buckets.map(b => ({ id: b.id, totalReturnRate: 0.04, contribution: 113 })),
  ...overrides,
})
const noInsurance = () => ({ kv: 0, pv: 0 })

describe('validation parity for validated fast path', () => {
  it('keeps public withdraw validation for external invalid state and requested', () => {
    const state = independentInitial()
    expect(() => withdrawProportionally({ ...state, buckets: [{ ...state.buckets[0], value: -1 }] }, 10)).toThrow()
    expect(() => withdrawProportionally(state, -1)).toThrow()
    expect(() => withdrawProportionally(state, Number.NaN)).toThrow()
  })

  it('keeps public assessment validation for external invalid inputs', () => {
    expect(() => assessCapitalIncome({ bankInterest: -1, receivedVorabpauschale: 0, adjustedFundSaleGain: 0, openingSimulatedLoss: 0 })).toThrow()
    expect(() => assessCapitalIncome({ bankInterest: 0, receivedVorabpauschale: 0, adjustedFundSaleGain: Number.MAX_SAFE_INTEGER + 1, openingSimulatedLoss: 0 })).toThrow()
  })

  it('does not mutate immutable opening state across public and yearly paths', () => {
    const state = independentInitial()
    const snapshot = structuredClone(state)
    const yearInput = independentYear(state)
    withdrawProportionally(state, 500)
    assessCapitalIncome({ bankInterest: 100, receivedVorabpauschale: 10, adjustedFundSaleGain: 50, openingSimulatedLoss: 0 })
    simulateEstimatorYear(state, yearInput, noInsurance)
    expect(state).toEqual(snapshot)
  })

  it('retains callback burden validation as public untrusted boundary', () => {
    const state = independentInitial()
    for (const burden of [{ kv: Number.NaN, pv: 0 }, { kv: -1, pv: 0 }, { kv: Number.MAX_SAFE_INTEGER + 1, pv: 0 }]) {
      expect(() => simulateEstimatorYear(state, independentYear(state), () => burden)).toThrow()
    }
  })

  it('retains additional requirement guard', () => {
    const state = independentInitial()
    expect(() => simulateEstimatorYear(state, independentYear(state), noInsurance, {
      additionalRequirementForTrial: () => Number.NaN,
    })).toThrow()
    expect(() => simulateEstimatorYear(state, independentYear(state), noInsurance, {
      additionalRequirementForTrial: () => -5,
    })).toThrow()
  })

  it('retains aggregate and overflow diagnostics', () => {
    const max = Number.MAX_SAFE_INTEGER
    expect(() => createEstimatorState({
      buckets: [{ id: 'a', value: max, eligibility: 'ordinary-bank-deposit' }, { id: 'b', value: 1, eligibility: 'ordinary-bank-deposit' }],
      fundAcquisitionCost: 0,
      scope: 'single-person-domestic-private-post-2017-no-special-events',
      lossHistory: 'confirmed-none-and-no-external-offsets',
    })).toThrow()
    expect(() => assessCapitalIncome({ bankInterest: max, receivedVorabpauschale: 0, adjustedFundSaleGain: 10, openingSimulatedLoss: 0 })).toThrow()
  })

  it('keeps deterministic yearly math on independent fixtures', () => {
    const state = independentInitial()
    const yearInput = independentYear(state)
    const callback = vi.fn((annualAssessment: number) => ({ kv: annualAssessment * 0.11, pv: annualAssessment * 0.02 }))
    const first = simulateEstimatorYear(state, yearInput, callback)
    const second = simulateEstimatorYear(state, yearInput, callback)
    expect(second).toEqual(first)
    expect(first.closingCapital).toBeCloseTo(first.openingCapital + first.investmentReturn + first.contribution - first.paidWithdrawal, 6)
  })
})
