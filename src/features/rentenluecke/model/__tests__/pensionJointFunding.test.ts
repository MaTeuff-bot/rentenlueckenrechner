import { describe, expect, it } from 'vitest'
import {
  createEstimatorState,
  simulateEstimatorYear,
  type EstimatorBucket,
} from '../capitalIncome/insuranceEstimator'
import { assessCore } from '../tax/pureCore'
import {
  assessPensionYearTaxValues,
  createPensionTaxSetup,
  incomeTax32a2026,
  resolvePensionTaxSetup,
} from '../tax/incomeTax'
import { simulateScenario } from '../simulateScenario'
import { simulateScenarioWithReturnPath } from '../stochasticReturns'
import { applyCoverage } from '../insuranceCoverage'
import { clearHiddenInvalidInsuranceValues } from '../retirementInsurance'
import { timelineBoundary } from '../scenarioTimeline'
import {
  automaticInsurance,
  cashOnlyInput,
  completedCoverage,
  insuredInput,
  pension,
  withFullCostBasis,
  zeroBucketPath,
} from './insuranceFixtures'
import type { RentenlueckeInput } from '../types'
import { PLANNING_RATE_SOURCE_ID, SYNTHETIC_RETURN_SERIES_IDS } from '../historicalReturns'

const fund = (value: number, id = 'fund'): EstimatorBucket => ({ id, value, eligibility: 'accumulating-equity-fund' })
const bank = (value: number, id = 'bank'): EstimatorBucket => ({ id, value, eligibility: 'ordinary-bank-deposit' })
const scope = () => ({
  scope: 'single-person-domestic-private-post-2017-no-special-events' as const,
  lossHistory: 'confirmed-none-and-no-external-offsets' as const,
})

function prepare(input: RentenlueckeInput): RentenlueckeInput {
  const base = { ...input, retirementInsurance: input.retirementInsurance ? applyCoverage(input.retirementInsurance, completedCoverage()) : undefined }
  return clearHiddenInvalidInsuranceValues({
    ...base,
    retirementInsurance: base.retirementInsurance
      ? { ...base.retirementInsurance, pensionAge: timelineBoundary(base.retirementIncomeStreams ?? []) }
      : undefined,
  })
}

function kvdrJointInput(): RentenlueckeInput {
  return prepare(withFullCostBasis(cashOnlyInput({
    currentAge: 66, retirementAge: 67, planningAge: 69,
    currentCapital: 100_000, monthlyContributionToday: 0,
    monthlyDesiredSpendingToday: 2_000,
    annualInflationRate: 0, annualReturnBeforeRetirement: 0, annualReturnInRetirement: 0,
    retirementInsurance: {
      pensionAge: 67, referenceYear: 2026, insurerAdditionalRate: 0.029,
      isParent: false, childrenConfirmed: true, childBirthYears: [],
      bridge: { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 },
      pension: { status: 'kvdr', circumstances: 'standard' },
    },
    retirementIncomeStreams: [
      { ...pension(), name: 'Gesetzliche Rente', support: 'standard' },
    ],
  })))
}

function voluntaryJointInput(): RentenlueckeInput {
  return prepare(withFullCostBasis(cashOnlyInput({
    currentAge: 67, retirementAge: 67, planningAge: 70,
    currentCapital: 200_000, monthlyContributionToday: 0,
    monthlyDesiredSpendingToday: 2_000,
    annualInflationRate: 0, annualReturnInRetirement: 0,
    retirementInsurance: {
      pensionAge: 67, referenceYear: 2026, insurerAdditionalRate: 0.029,
      isParent: false, childrenConfirmed: true, childBirthYears: [],
      bridge: { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 },
      pension: { status: 'voluntary', circumstances: 'standard', drvSubsidy: 'not-received' },
    },
    retirementIncomeStreams: [
      { ...pension({ amountMonthlyToday: 1_500 }), name: 'GV Rente' },
    ],
  })))
}

function estimatorGainsInput(): RentenlueckeInput {
  return prepare(insuredInput({
    currentAge: 66, retirementAge: 67, planningAge: 70,
    currentCapital: 100_000, monthlyContributionToday: 0,
    monthlyDesiredSpendingToday: 2_500,
    annualInflationRate: 0, annualReturnInRetirement: 0,
    estimatorPortfolio: [
      { id: 'fund', name: 'Fonds', value: 60_000, holding: 'accumulating-equity-fund',
        returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.equity },
      { id: 'bank', name: 'Bank', value: 40_000, holding: 'ordinary-bank-deposit',
        returnSeriesId: PLANNING_RATE_SOURCE_ID },
    ],
    retirementInsurance: automaticInsurance({
      pension: { status: 'voluntary', circumstances: 'standard', capitalMode: 'automatic', drvSubsidy: 'not-received' },
      capitalEstimator: { fundAcquisitionCost: 30_000, projectedBasisRate: 0.032, scopeConfirmed: true, lossScopeConfirmed: true },
    }),
  }))
}

describe('pension-tax tariff discontinuity (statutory bound)', () => {
  it('floors 12355 to 0 and 12356 to 1 (hand-derived y-formula)', () => {
    // y(12355) = 0.0007 -> (914.51*0.0007+1400)*0.0007 = 0.98.. -> 0.
    // y(12356) = 0.0008 -> (914.51*0.0008+1400)*0.0008 = 1.12.. -> 1.
    expect(incomeTax32a2026(12355)).toBe(0)
    expect(incomeTax32a2026(12356)).toBe(1)
  })
  it('steps at most 1 EUR today per floor step across all branches', () => {
    expect(incomeTax32a2026(17799)).toBe(1034)
    expect(incomeTax32a2026(17800)).toBe(1035)
    expect(incomeTax32a2026(69879) - incomeTax32a2026(69878)).toBeLessThanOrEqual(1)
    expect(incomeTax32a2026(277826) - incomeTax32a2026(277825)).toBeLessThanOrEqual(1)
    let max = 0
    for (let x = 0; x < 300000; x += 1) max = Math.max(max, incomeTax32a2026(x + 1) - incomeTax32a2026(x))
    expect(max).toBeLessThanOrEqual(1)
  })
  it('drops the pension tax by exactly factor at the 12355/12356 edge (factor 1)', () => {
    // startYear 2027 -> 84.5 %; first-year 24000 -> freibetrag 3720; base 20280.
    const setup = createPensionTaxSetup({ scope: 'grv-single-domestic-post-2023-no-other-income', startYear: 2027, firstYearGrvGross: 24000 })
    expect(assessPensionYearTaxValues(setup, 24000, 7822, 0, 1).pensionIncomeTax).toBe(1)
    expect(assessPensionYearTaxValues(setup, 24000, 7823, 0, 1).pensionIncomeTax).toBe(0)
  })
  it('drops the pension tax by exactly factor at the edge (factor 1.1)', () => {
    // grv 26400, freibetrag 3720 -> base 22680; WERB 112.2.
    // ded 8975.20 -> zveNom 13592.6 -> today 12356.90.. -> floor 12356 -> tax today 1 -> nominal 1.1.
    // ded 8976.70 -> zveNom 13591.1 -> today 12355.54.. -> floor 12355 -> tax 0.
    // Margins 0.9/0.55 keep the floors clear of float error; the step is still factor*1.
    const setup = createPensionTaxSetup({ scope: 'grv-single-domestic-post-2023-no-other-income', startYear: 2027, firstYearGrvGross: 24000 })
    expect(assessPensionYearTaxValues(setup, 26400, 8975.20, 0, 1.1).pensionIncomeTax).toBeCloseTo(1.1, 10)
    expect(assessPensionYearTaxValues(setup, 26400, 8976.70, 0, 1.1).pensionIncomeTax).toBe(0)
  })
})

describe('estimator joint hook (generic, no incomeTax import)', () => {
  it('matches hook-absent results exactly when the hook returns zero (zero-pension parity)', () => {
    const s = createEstimatorState({ buckets: [fund(60000), bank(40000)], fundAcquisitionCost: 30000, ...scope() })
    const input = { projectedBasisRate: 0.032, spendingLessOtherIncome: 20000,
      withdrawalTax: { openingLossCarryforward: 0, allowanceAvailable: 1000 },
      buckets: [
        { id: 'fund', totalReturnRate: 0.05, contribution: 0, targetWeight: 0.6 },
        { id: 'bank', totalReturnRate: 0.02, grossBankReturnRate: 0.02, contribution: 0, targetWeight: 0.4 },
      ] }
    const insurance = (assessment: number) => ({ kv: assessment * 0.1, pv: assessment * 0.02 })
    const absent = simulateEstimatorYear(s, input, insurance)
    const hooked = simulateEstimatorYear(s, input, insurance,
      { additionalRequirementForTrial: () => 0, fundedExcessBound: 1 })
    expect(hooked.status).toBe(absent.status)
    expect(hooked.requiredWithdrawal).toBeCloseTo(absent.requiredWithdrawal, 10)
    expect(hooked.paidWithdrawal).toBeCloseTo(absent.paidWithdrawal, 10)
    expect(hooked.closingCapital).toBeCloseTo(absent.closingCapital, 10)
    expect(hooked.excessRepurchase).toBe(0)
    expect(absent.excessRepurchase).toBe(0)
  })
  it('absorbs the extra requirement in the surplus (required 0, no sale, no repurchase)', () => {
    const s = createEstimatorState({ buckets: [fund(60000), bank(40000)], fundAcquisitionCost: 30000, ...scope() })
    const r = simulateEstimatorYear(s, { projectedBasisRate: 0.032, spendingLessOtherIncome: -50000,
      buckets: [
        { id: 'fund', totalReturnRate: 0.05, contribution: 0, targetWeight: 0.6 },
        { id: 'bank', totalReturnRate: 0.02, grossBankReturnRate: 0.02, contribution: 0, targetWeight: 0.4 },
      ] }, () => ({ kv: 100, pv: 50 }),
      { additionalRequirementForTrial: () => 800, fundedExcessBound: 1 })
    expect(r.status).toBe('converged')
    expect(r.requiredWithdrawal).toBe(0)
    expect(r.paidWithdrawal).toBe(0)
    expect(r.excessRepurchase).toBe(0)
    expect(r.closingCapital).toBeCloseTo(r.openingCapital + r.investmentReturn, 8)
  })
  it('conserves a 1-EUR rounding excess via same-year repurchase at target weights', () => {
    // Fund 60000 (cost 36000) + bank 40000, zero returns, targets 0.6/0.4:
    // gain(w) = 0.24w, assessment = max(0, 0.168w-51), kv = max(0, 0.084w-25.5).
    // kv hits 5000 at w_c = 5025.5/0.084 = 59827.38; the 1-EUR hook step down
    // straddles zero for S in (w_c-5001, w_c-5000), so S = 54826.9 admits no
    // exact root: residual- = -0.52, residual+ = +0.48, excess ~= 0.48.
    const s = createEstimatorState({ buckets: [fund(60000), bank(40000)], fundAcquisitionCost: 36000, ...scope() })
    const buckets = [
      { id: 'fund', totalReturnRate: 0, contribution: 0, targetWeight: 0.6 },
      { id: 'bank', totalReturnRate: 0, grossBankReturnRate: 0, contribution: 0, targetWeight: 0.4 },
    ]
    const insuranceFor = (assessment: number) => ({ kv: Math.max(0, assessment * 0.5), pv: 0 })
    const hook = (insurance: { kv: number }) => (insurance.kv >= 5000 ? 0 : 1)
    const r = simulateEstimatorYear(s, { projectedBasisRate: 0.032, spendingLessOtherIncome: 54826.9, buckets }, insuranceFor,
      { additionalRequirementForTrial: hook, fundedExcessBound: 1 })
    expect(r.status).toBe('converged')
    expect(r.excessRepurchase).toBeGreaterThan(0.3)
    expect(r.excessRepurchase).toBeLessThanOrEqual(1 + 1e-6 + 1e-9)
    expect(r.residual).toBeCloseTo(r.excessRepurchase, 10)
    expect(r.paidWithdrawal).toBeCloseTo(r.requiredWithdrawal + r.excessRepurchase, 8)
    // Conservation: every paid euro is required outflow or repurchased holdings.
    expect(r.closingCapital).toBeCloseTo(r.openingCapital + r.investmentReturn - r.requiredWithdrawal, 6)
    expect(r.closingState!.buckets.reduce((sum, b) => sum + b.value, 0)).toBeCloseTo(r.closingCapital, 10)
    // Fund share (0.6) at target weight adds cost; bank share is plain principal.
    expect(r.closingState!.fundAcquisitionCost).toBeCloseTo(
      r.movement.state.fundAcquisitionCost + r.excessRepurchase * 0.6, 6)
    expect(r.closingState!.buckets.find(b => b.id === 'bank')!.value).toBeCloseTo(
      r.movement.state.buckets.find(b => b.id === 'bank')!.value + r.excessRepurchase * 0.4, 6)
    // Zero returns accrue no VP, so pending is the untouched movement balance.
    expect(r.pendingVorabpauschale).toBeCloseTo(r.movement.state.pendingVorabpauschale, 10)
    // Same-year assessment/insurance/tax are the committed trial values (no feedback).
    expect(r.closingState!.simulatedLossCarryforward).toBe(r.assessment.closingSimulatedLoss)
    expect(r.requiredWithdrawal).toBeCloseTo(
      54826.9 + r.insurance.kv + r.insurance.pv + hook(r.insurance), 6)
  })
  it('bounds the excess by factor 1.1 with the same conservation', () => {
    // Same fixture with a 1.1 step: S = w_c-5001.05 = 54826.33 gives
    // residual- = -0.05, residual+ = +1.05. Bound 1 rejects it (nonconverged,
    // null state); bound 1.1 accepts it with conservation.
    const s = createEstimatorState({ buckets: [fund(60000), bank(40000)], fundAcquisitionCost: 36000, ...scope() })
    const buckets = [
      { id: 'fund', totalReturnRate: 0, contribution: 0, targetWeight: 0.6 },
      { id: 'bank', totalReturnRate: 0, grossBankReturnRate: 0, contribution: 0, targetWeight: 0.4 },
    ]
    const insuranceFor = (assessment: number) => ({ kv: Math.max(0, assessment * 0.5), pv: 0 })
    const hook = (insurance: { kv: number }) => (insurance.kv >= 5000 ? 0 : 1.1)
    const rejected = simulateEstimatorYear(s, { projectedBasisRate: 0.032, spendingLessOtherIncome: 54826.33, buckets }, insuranceFor,
      { additionalRequirementForTrial: hook, fundedExcessBound: 1 })
    expect(rejected.status).toBe('nonconverged')
    expect(rejected.closingState).toBeNull()
    const r = simulateEstimatorYear(s, { projectedBasisRate: 0.032, spendingLessOtherIncome: 54826.33, buckets }, insuranceFor,
      { additionalRequirementForTrial: hook, fundedExcessBound: 1.1 })
    expect(r.status).toBe('converged')
    expect(r.excessRepurchase).toBeGreaterThan(0.9)
    expect(r.excessRepurchase).toBeLessThanOrEqual(1.1 + 1e-6 + 1e-9)
    expect(r.closingCapital).toBeCloseTo(r.openingCapital + r.investmentReturn - r.requiredWithdrawal, 6)
    expect(r.closingState!.fundAcquisitionCost).toBeCloseTo(
      r.movement.state.fundAcquisitionCost + r.excessRepurchase * 0.6, 6)
  })
  it('consumes allowance and loss once from the committed trial', () => {
    const opening = { ...createEstimatorState({ buckets: [fund(10000), bank(10000)], fundAcquisitionCost: 4000, ...scope() }),
      pendingVorabpauschale: 200, simulatedLossCarryforward: 300 }
    const input = { projectedBasisRate: 0.03, spendingLessOtherIncome: 5000,
      withdrawalTax: { openingLossCarryforward: 300, allowanceAvailable: 1000 },
      buckets: [
        { id: 'fund', totalReturnRate: 0.1, contribution: 0 },
        { id: 'bank', totalReturnRate: 0.02, grossBankReturnRate: 0.02, contribution: 0 },
      ] }
    const r = simulateEstimatorYear(opening, input, () => ({ kv: 100, pv: 50 }),
      { additionalRequirementForTrial: () => 250, fundedExcessBound: 5 })
    expect(r.status).toBe('converged')
    expect(r.excessRepurchase).toBe(0)
    const recomputed = assessCore(
      r.sale.adjustedFundSaleGain + r.movement.adjustedFundSaleGain,
      r.receivedVorabpauschale, 300, 1000, true, r.bankInterest)
    expect(r.withdrawalTax!.capitalIncomeTax).toBeCloseTo(recomputed.capitalIncomeTax, 10)
    expect(r.withdrawalTax!.closingLossCarryforward).toBeCloseTo(recomputed.closingLossCarryforward, 10)
    expect(r.withdrawalTax!.sparerpauschbetragApplied + r.withdrawalTax!.closingAllowance).toBeCloseTo(1000, 10)
    expect(r.closingState!.simulatedLossCarryforward).toBe(r.assessment.closingSimulatedLoss)
    expect(r.requiredWithdrawal).toBeCloseTo(5000 + 150 + r.withdrawalTax!.capitalIncomeTax + 250, 6)
  })
  it('keeps manual-style constant insurance exact (no rounding excess)', () => {
    const s = createEstimatorState({ buckets: [fund(50000), bank(50000)], fundAcquisitionCost: 20000, ...scope() })
    const r = simulateEstimatorYear(s, { projectedBasisRate: 0.032, spendingLessOtherIncome: 10000,
      withdrawalTax: { openingLossCarryforward: 0, allowanceAvailable: 1000 },
      buckets: [
        { id: 'fund', totalReturnRate: 0.03, contribution: 0, targetWeight: 0.5 },
        { id: 'bank', totalReturnRate: 0.01, grossBankReturnRate: 0.01, contribution: 0, targetWeight: 0.5 },
      ] }, () => ({ kv: 1800, pv: 240 }),
      { additionalRequirementForTrial: () => 400, fundedExcessBound: 1 })
    expect(r.status).toBe('converged')
    expect(r.excessRepurchase).toBe(0)
    expect(r.requiredWithdrawal).toBeCloseTo(10000 + 2040 + r.withdrawalTax!.capitalIncomeTax + 400, 6)
  })
  it('splits shortfall (valid state) from nonconverged (null state)', () => {
    const poor = createEstimatorState({ buckets: [bank(100)], fundAcquisitionCost: 0, ...scope() })
    const short = simulateEstimatorYear({ ...poor, buckets: [bank(100)] },
      { projectedBasisRate: 0.032, spendingLessOtherIncome: 1000, buckets: [{ id: 'bank', totalReturnRate: 0, contribution: 0 }] },
      () => ({ kv: 10, pv: 0 }))
    expect(short.status).toBe('shortfall')
    expect(short.closingState).not.toBeNull()
    expect(short.unfundedWithdrawal).toBeGreaterThan(0)
    const s = createEstimatorState({ buckets: [fund(1000)], fundAcquisitionCost: 0, ...scope() })
    const jumpy = simulateEstimatorYear(s, { projectedBasisRate: 0.032, spendingLessOtherIncome: 0,
      buckets: [{ id: 'fund', totalReturnRate: 0, contribution: 0 }] },
      basis => ({ kv: basis < 299 ? 600 : 400, pv: 0 }))
    expect(jumpy.status).toBe('nonconverged')
    expect(jumpy.closingState).toBeNull()
  })
})

describe('ledger joint pension-tax funding', () => {
  it('keeps hand-computed zero-gain pins (gap 3972, pension 864)', () => {
    const input = kvdrJointInput()
    const result = simulateScenarioWithReturnPath(input, [], undefined, zeroBucketPath(input, input.planningAge - input.currentAge))
    for (const row of result.retirementRows) {
      expect(row.pensionTaxBase).toBeCloseTo(20_280, 8)
      expect(row.pensionIncomeTax).toBeCloseTo(864, 8)
      expect(row.retirementIncomeNet).toBeCloseTo(20_028, 8)
      expect(row.gapWithdrawal).toBeCloseTo(3_972, 8)
      expect(row.capitalAssessment!.excessRepurchase ?? 0).toBeCloseTo(0, 8)
    }
  })
  it('funds gap, insurance and both taxes from the single committed sale', () => {
    const result = simulateScenario(estimatorGainsInput(), 0.02)
    for (const row of result.retirementRows) {
      const assessment = row.capitalAssessment!
      const excess = assessment.excessRepurchase ?? 0
      expect(excess).toBeGreaterThanOrEqual(0)
      expect(excess).toBeLessThanOrEqual(row.inflationFactor + 1e-6 + 1e-9)
      expect(row.gapWithdrawal).toBeCloseTo(assessment.requiredWithdrawal, 8)
      expect(assessment.paidWithdrawal).toBeCloseTo(assessment.requiredWithdrawal + excess, 6)
      expect(row.closingCapital).toBeCloseTo(
        row.openingCapital + row.investmentReturn + row.contribution - assessment.paidWithdrawal + excess + (row.surplusReinvested ?? 0), 5)
      expect(row.unfundedWithdrawal).toBeCloseTo(Math.max(0, assessment.requiredWithdrawal - assessment.paidWithdrawal), 8)
      expect(row.retirementIncomeNet).toBeCloseTo(
        row.retirementIncomeGross - row.retirementIncomeOtherDeductions - row.healthInsurance - row.careInsurance - (row.pensionIncomeTax ?? 0), 8)
      expect(row.surplusIncome).toBeCloseTo(Math.max(0, row.retirementIncomeNet - row.desiredSpending - (row.capitalIncomeTax ?? 0)), 8)
      expect(row.surplusReinvested ?? 0).toBeCloseTo(row.surplusIncome, 8)
      if ((assessment.requiredWithdrawal ?? 0) > 0) expect(row.surplusIncome).toBe(0)
      const insurance = assessment.insurance.kv + assessment.insurance.pv
      if (assessment.paidWithdrawal > 0)
        expect((row.netGapWithdrawal ?? 0) + insurance + (row.capitalIncomeTax ?? 0) + (row.pensionIncomeTax ?? 0))
          .toBeCloseTo(assessment.paidWithdrawal, 5)
      expect(row.depleted).toBe(assessment.status === 'shortfall')
    }
    for (const row of result.accumulationRows) {
      expect(row.gapWithdrawal).toBe(0)
      expect(row.pensionIncomeTax).toBeUndefined()
    }
  })
  it('derives the voluntary pension tax from the final KV/PV (capital-base feedback)', () => {
    const input = voluntaryJointInput()
    const result = simulateScenarioWithReturnPath(input, [], undefined, zeroBucketPath(input, input.planningAge - input.currentAge))
    const setup = resolvePensionTaxSetup({
      streams: input.retirementIncomeStreams,
      currentAge: input.currentAge,
      retirementAge: input.retirementAge,
      planningAge: input.planningAge,
      referenceYear: input.retirementInsurance!.referenceYear,
      yearsToRetirement: input.planningAge - input.currentAge > 0 ? 0 : 0,
      inflationFactorAt: () => 1,
    })!
    for (const row of result.retirementRows) {
      const expected = assessPensionYearTaxValues(setup, 18000, row.healthInsurance, row.careInsurance, 1)
      expect(row.pensionIncomeTax).toBeCloseTo(expected.pensionIncomeTax, 8)
      expect(row.gapWithdrawal).toBeCloseTo(row.capitalAssessment!.requiredWithdrawal, 8)
    }
  })
  it('isolates KVdR insurance and pension tax from the capital path', () => {
    const input = kvdrJointInput()
    const years = input.planningAge - input.currentAge
    const zero = simulateScenarioWithReturnPath(input, [], undefined, zeroBucketPath(input, years))
    const gains = simulateScenarioWithReturnPath(input, [], undefined,
      zeroBucketPath(input, years).map(row => row.map(b => ({ ...b, totalReturnRate: 0.05 })) as typeof row))
    for (const [index, row] of zero.retirementRows.entries()) {
      const other = gains.retirementRows[index]
      expect(row.healthInsurance).toBeCloseTo(other.healthInsurance, 8)
      expect(row.careInsurance).toBeCloseTo(other.careInsurance, 8)
      expect(row.pensionIncomeTax).toBeCloseTo(other.pensionIncomeTax ?? 0, 8)
      expect(row.gapWithdrawal - other.gapWithdrawal).toBeCloseTo(
        (row.capitalIncomeTax ?? 0) - (other.capitalIncomeTax ?? 0), 5)
    }
  })
  it('isolates manual totals from the capital assessment', () => {
    const base = kvdrJointInput()
    const manual = prepare({ ...base,
      retirementInsurance: { ...base.retirementInsurance!,
        pension: { manual: true, kvMonthlyToday: 150, pvMonthlyToday: 20 } as never },
    })
    const result = simulateScenarioWithReturnPath(manual, [], undefined, zeroBucketPath(manual, manual.planningAge - manual.currentAge))
    for (const row of result.retirementRows) {
      expect(row.healthInsurance).toBeCloseTo(1800, 8)
      expect(row.careInsurance).toBeCloseTo(240, 8)
      expect(row.gapWithdrawal).toBeCloseTo(row.capitalAssessment!.requiredWithdrawal, 8)
    }
  })
  it('reinvests surplus year-end (no sale for a covered pension tax)', () => {
    const base = estimatorGainsInput()
    const input = prepare({ ...base, currentAge: base.retirementAge, retirementAge: base.retirementAge,
      monthlyDesiredSpendingToday: 100 })
    const result = simulateScenario(input, 0.02)
    for (const row of result.retirementRows) {
      expect(row.surplusIncome).toBeGreaterThan(0)
      expect(row.surplusReinvested).toBeCloseTo(row.surplusIncome, 8)
      expect(row.surplusIncome).toBeCloseTo(Math.max(0, row.retirementIncomeNet - row.desiredSpending - (row.capitalIncomeTax ?? 0)), 8)
      expect(row.gapWithdrawal).toBe(0)
      expect(row.capitalAssessment!.paidWithdrawal).toBe(0)
      expect(row.capitalAssessment!.excessRepurchase ?? 0).toBe(0)
      expect(row.closingCapital).toBeCloseTo(row.openingCapital + row.investmentReturn + (row.surplusReinvested ?? 0), 6)
    }
  })
  it('reports depletion as shortfall with a valid closing state', () => {
    const base = kvdrJointInput()
    const input = prepare({ ...base, currentCapital: 1000,
      estimatorPortfolio: [{ id: 'fund', name: 'Fonds', value: 1000, holding: 'accumulating-equity-fund' as const,
        returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.equity }],
      retirementInsurance: { ...base.retirementInsurance!,
        capitalEstimator: { ...base.retirementInsurance!.capitalEstimator!, fundAcquisitionCost: 1000 } },
    })
    const result = simulateScenarioWithReturnPath(input, [], undefined, zeroBucketPath(input, input.planningAge - input.currentAge))
    const first = result.retirementRows[0]
    expect(first.capitalAssessment!.status).toBe('shortfall')
    expect(first.capitalAssessment!.closingState).not.toBeNull()
    expect(first.unfundedWithdrawal).toBeGreaterThan(0)
    expect(first.depleted).toBe(true)
  })
})