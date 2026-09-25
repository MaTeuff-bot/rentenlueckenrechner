import { describe, expect, it } from 'vitest'
import { assessCore } from './pureCore'
import {
  assessCapitalIncomeTax,
  assessYearTax,
  createTaxState,
  scaledSparerpauschbetrag,
  manualApproximationDisclosure,
  taxDisclosures,
  TAX_ALLOWANCE_MODE,
  TAX_SCOPE_DECLARATION,
} from './capitalIncomeTax'
import {
  assessCapitalIncome,
  createEstimatorState,
  simulateEstimatorYear,
  estimatorDisclosures,
  type EstimatorState,
} from '../capitalIncome/insuranceEstimator'
import { insuredInput, automaticInsurance } from '../__tests__/insuranceFixtures'
import { SYNTHETIC_RETURN_SERIES_IDS } from '../historicalReturns/constants'
import { normalizeInput } from '../normalizeInput'
import { simulateCapitalLedgerPath } from '../capitalIncome/ledger'
import { simulateScenario } from '../simulateScenario'
import { simulateScenarioWithReturnPath } from '../stochasticReturns'
import type { RentenlueckeInput } from '../types'

/**
 * PR1: bank-interest taxation in the detailed capital-income estimator.
 * Statutes: EStG §20(1)7 (bank interest is capital income) / (6) (single loss
 * pot) / (9) (single allowance after losses, no expenses), §32d (25% flat),
 * InvStG §§20/21 (30% fund exemption only, also on fund losses), SolzG §4
 * (5.5% Soli). Total rate on the taxable base: 0.25 × 1.055 = 0.26375.
 * Ordering: fund-only partial exemption FIRST, then bank interest added,
 * then the SINGLE shared loss offset and allowance.
 */

const SCOPE = {
  scope: TAX_SCOPE_DECLARATION,
  allowanceMode: TAX_ALLOWANCE_MODE,
} as const

const bank = (value: number, id = 'bank') => ({ id, value, eligibility: 'ordinary-bank-deposit' as const })
const fund = (value: number, id = 'fund') => ({ id, value, eligibility: 'accumulating-equity-fund' as const })
const noInsurance = () => ({ kv: 0, pv: 0 })

function bankOnlyState(value = 100_000): EstimatorState {
  return createEstimatorState({
    buckets: [bank(value)],
    fundAcquisitionCost: 0,
    scope: 'single-person-domestic-private-post-2017-no-special-events',
    lossHistory: 'confirmed-none-and-no-external-offsets',
  })
}

describe('assessCore: bank interest joins after the fund-only exemption', () => {
  it('taxes bank-only interest above the allowance (hand-computed)', () => {
    // 5,000 → no exemption → −1,000 allowance = 4,000 base.
    // Abgeltung 1,000; Soli 55; total 1,055.
    const result = assessCore(0, 0, 0, 1_000, true, 5_000)
    expect(result.taxableWithdrawal).toBeCloseTo(5_000, 9)
    expect(result.sparerpauschbetragApplied).toBeCloseTo(1_000, 9)
    expect(result.taxableBase).toBeCloseTo(4_000, 9)
    expect(result.capitalIncomeTax).toBeCloseTo(1_055, 9)
    expect(result.closingLossCarryforward).toBe(0)
    expect(result.closingAllowance).toBe(0)
  })

  it('leaves bank-only interest below the allowance untaxed', () => {
    const result = assessCore(0, 0, 0, 1_000, true, 800)
    expect(result.taxableWithdrawal).toBeCloseTo(800, 9)
    expect(result.sparerpauschbetragApplied).toBeCloseTo(800, 9)
    expect(result.taxableBase).toBe(0)
    expect(result.capitalIncomeTax).toBe(0)
    expect(result.closingAllowance).toBeCloseTo(200, 9)
  })

  it('shares one allowance between exempted fund income and unexempted interest', () => {
    // (10,000 + 1,000) × 0.7 = 7,700 fund part + 2,000 bank = 9,700.
    // −1,000 allowance = 8,700 base; tax 8,700 × 0.25 × 1.055 = 2,294.625.
    const result = assessCore(10_000, 1_000, 0, 1_000, true, 2_000)
    expect(result.taxableWithdrawal).toBeCloseTo(9_700, 9)
    expect(result.sparerpauschbetragApplied).toBeCloseTo(1_000, 9)
    expect(result.taxableBase).toBeCloseTo(8_700, 9)
    expect(result.capitalIncomeTax).toBeCloseTo(2_294.625, 9)
  })

  it('offsets haircut fund losses against full interest in the single loss pot', () => {
    // −2,000 × 0.7 = −1,400 + 3,000 = 1,600 − 1,000 = 600 base.
    // Tax 600 × 0.25 × 1.055 = 158.25.
    const partial = assessCore(-2_000, 0, 0, 1_000, true, 3_000)
    expect(partial.taxableBase).toBeCloseTo(600, 9)
    expect(partial.capitalIncomeTax).toBeCloseTo(158.25, 9)
    expect(partial.closingLossCarryforward).toBe(0)
    // −5,000 × 0.7 = −3,500 + 2,000 = −1,500 → 1,500 loss carried, allowance untouched.
    const full = assessCore(-5_000, 0, 0, 1_000, true, 2_000)
    expect(full.capitalIncomeTax).toBe(0)
    expect(full.sparerpauschbetragApplied).toBe(0)
    expect(full.closingLossCarryforward).toBeCloseTo(1_500, 9)
    expect(full.closingAllowance).toBeCloseTo(1_000, 9)
  })

  it('keeps zero-interest legacy behavior exact', () => {
    expect(assessCore(10_000, 1_000, 0, 1_000, true)).toEqual(assessCore(10_000, 1_000, 0, 1_000, true, 0))
    const legacy = assessCore(10_000, 1_000, 0, 1_000, true)
    expect(legacy.taxableWithdrawal).toBeCloseTo(7_700, 9)
    expect(legacy.capitalIncomeTax).toBeCloseTo(1_767.125, 9)
  })
})

describe('assessCapitalIncomeTax / assessYearTax: validated bank-interest field', () => {
  it('taxes validated bank interest without fund exemption', () => {
    const result = assessCapitalIncomeTax({ fundSaleGain: 0, vorabpauschaleIncome: 0, openingLossCarryforward: 0, incomeClass: 'equity-fund', bankInterest: 5_000, ...SCOPE })
    expect(result.taxableWithdrawal).toBeCloseTo(5_000, 9)
    expect(result.capitalIncomeTax).toBeCloseTo(1_055, 9)
  })

  it('defaults omitted bank interest to zero (scalar/manual callers unchanged)', () => {
    const result = assessCapitalIncomeTax({ fundSaleGain: 10_000, vorabpauschaleIncome: 1_000, openingLossCarryforward: 0, incomeClass: 'equity-fund', ...SCOPE })
    expect(result.capitalIncomeTax).toBeCloseTo(1_767.125, 9)
  })

  it('rejects negative bank interest', () => {
    expect(() => assessCapitalIncomeTax({ fundSaleGain: 0, vorabpauschaleIncome: 0, openingLossCarryforward: 0, incomeClass: 'equity-fund', bankInterest: -1, ...SCOPE })).toThrow()
  })

  it('threads a bank-driven loss through assessYearTax into the next year', () => {
    // Year A: −5,000 × 0.7 = −3,500 + 500 interest = −3,000 → closing loss 3,000.
    const stateA = createTaxState({ ...SCOPE, inflationFactor: 1 })
    const yearA = assessYearTax(stateA, { fundSaleGain: -5_000, vorabpauschaleIncome: 0, incomeClass: 'equity-fund', bankInterest: 500 })
    expect(yearA.result.capitalIncomeTax).toBe(0)
    expect(yearA.result.closingLossCarryforward).toBeCloseTo(3_000, 9)
    // Year B: 4,000 interest − 3,000 loss = 1,000 − 1,000 allowance = 0 base → no tax.
    const yearB = assessYearTax(yearA.nextState, { fundSaleGain: 0, vorabpauschaleIncome: 0, incomeClass: 'equity-fund', bankInterest: 4_000 })
    expect(yearB.result.taxableBase).toBe(0)
    expect(yearB.result.capitalIncomeTax).toBe(0)
    expect(yearB.result.sparerpauschbetragApplied).toBeCloseTo(1_000, 9)
    expect(yearB.nextState.lossCarryforward).toBe(0)
  })
})

describe('tax/insurance loss equivalence with nonzero expense allowance', () => {
  it('shares the same closing-loss algebra; only the assessment deductions differ', () => {
    const tax = assessCore(4_000, 1_000, 1_500, 1_000, true, 2_000)
    const insurance = assessCapitalIncome({ bankInterest: 2_000, receivedVorabpauschale: 1_000, adjustedFundSaleGain: 4_000, openingSimulatedLoss: 1_500, expenseAllowance: 102 })
    expect(insurance.closingSimulatedLoss).toBeCloseTo(tax.closingLossCarryforward, 9)
    expect(insurance.closingSimulatedLoss).toBe(0)
    // Insurance deducts the expense allowance from the assessment; tax deducts the
    // saver allowance and applies the flat rate instead.
    expect(insurance.annualAssessment).toBeCloseTo(3_898, 9)
    expect(tax.taxableBase).toBeCloseTo(3_000, 9)
    expect(tax.capitalIncomeTax).toBeCloseTo(791.25, 9)
  })

  it('matches closing losses when interest cannot cover the haircut fund loss', () => {
    const tax = assessCore(-5_000, 0, 0, 1_000, true, 500)
    const insurance = assessCapitalIncome({ bankInterest: 500, receivedVorabpauschale: 0, adjustedFundSaleGain: -5_000, openingSimulatedLoss: 0, expenseAllowance: 102 })
    expect(tax.closingLossCarryforward).toBeCloseTo(3_000, 9)
    expect(insurance.closingSimulatedLoss).toBeCloseTo(3_000, 9)
    expect(tax.capitalIncomeTax).toBe(0)
    expect(insurance.annualAssessment).toBe(0)
  })
})

describe('estimator trial: gross bank interest taxed and funded once', () => {
  it('funds no-spending accumulation tax from the portfolio (bank-only, hand-computed)', () => {
    // 100,000 bank at 2% gross → 2,000 interest; no funds, no VP, allowance 1,000.
    // Taxable 2,000 − 1,000 = 1,000 base → tax 263.75; bank sales realize no gains,
    // so no funding feedback beyond the tax itself.
    const state = bankOnlyState(100_000)
    const result = simulateEstimatorYear(state, {
      projectedBasisRate: 0.032,
      spendingLessOtherIncome: 0,
      withdrawalTax: { openingLossCarryforward: 0, allowanceAvailable: scaledSparerpauschbetrag(1) },
      buckets: [{ id: 'bank', totalReturnRate: 0.02, grossBankReturnRate: 0.02, contribution: 0 }],
    }, noInsurance)
    expect(result.status).toBe('converged')
    expect(result.bankInterest).toBeCloseTo(2_000, 9)
    expect(result.withdrawalTax!.taxableWithdrawal).toBeCloseTo(2_000, 9)
    expect(result.withdrawalTax!.capitalIncomeTax).toBeCloseTo(263.75, 9)
    expect(result.requiredWithdrawal).toBeCloseTo(263.75, 6)
    expect(result.paidWithdrawal).toBeCloseTo(263.75, 6)
    expect(result.closingCapital).toBeCloseTo(102_000 - 263.75, 6)
    expect(result.closingCapital).toBeCloseTo(
      result.openingCapital + result.investmentReturn + result.contribution - result.paidWithdrawal, 9)
  })

  it('assesses gross interest while net fees stay in the return (gross vs net)', () => {
    // 40,000 bank: 2% gross interest = 800 taxable, −3% net return = −1,200 wealth.
    const state = bankOnlyState(40_000)
    const result = simulateEstimatorYear(state, {
      projectedBasisRate: 0.032,
      spendingLessOtherIncome: 0,
      withdrawalTax: { openingLossCarryforward: 0, allowanceAvailable: scaledSparerpauschbetrag(1) },
      buckets: [{ id: 'bank', totalReturnRate: -0.03, grossBankReturnRate: 0.02, contribution: 0 }],
    }, noInsurance)
    expect(result.status).toBe('converged')
    expect(result.bankInterest).toBeCloseTo(800, 9)
    expect(result.investmentReturn).toBeCloseTo(-1_200, 9)
    // 800 below the 1,000 allowance → no tax, nothing funded.
    expect(result.withdrawalTax!.capitalIncomeTax).toBe(0)
    expect(result.paidWithdrawal).toBe(0)
    expect(result.closingCapital).toBeCloseTo(38_800, 9)
  })

  it('never taxes withdrawn bank principal a second time', () => {
    const run = (spending: number) => simulateEstimatorYear(bankOnlyState(100_000), {
      projectedBasisRate: 0.032,
      spendingLessOtherIncome: spending,
      withdrawalTax: { openingLossCarryforward: 0, allowanceAvailable: scaledSparerpauschbetrag(1) },
      buckets: [{ id: 'bank', totalReturnRate: 0.02, grossBankReturnRate: 0.02, contribution: 0 }],
    }, noInsurance)
    const small = run(5_000)
    const large = run(20_000)
    // Same interest credited once; quadrupling the bank-principal withdrawal leaves
    // the taxable amount unchanged.
    expect(small.bankInterest).toBeCloseTo(2_000, 9)
    expect(large.bankInterest).toBeCloseTo(2_000, 9)
    expect(small.withdrawalTax!.taxableWithdrawal).toBeCloseTo(2_000, 9)
    expect(large.withdrawalTax!.taxableWithdrawal).toBeCloseTo(small.withdrawalTax!.taxableWithdrawal, 9)
    expect(large.sale.bankPrincipalWithdrawn).toBeGreaterThan(small.sale.bankPrincipalWithdrawn)
    expect(large.sale.adjustedFundSaleGain).toBe(0)
  })

  it('adds bank interest to the funding fixed point of a mixed withdrawal', () => {
    const state = createEstimatorState({
      buckets: [fund(60_000), bank(40_000)],
      fundAcquisitionCost: 30_000,
      scope: 'single-person-domestic-private-post-2017-no-special-events',
      lossHistory: 'confirmed-none-and-no-external-offsets',
    })
    const allowance = scaledSparerpauschbetrag(1)
    const result = simulateEstimatorYear(state, {
      projectedBasisRate: 0.032,
      spendingLessOtherIncome: 10_000,
      withdrawalTax: { openingLossCarryforward: 0, allowanceAvailable: allowance },
      buckets: [
        { id: 'fund', totalReturnRate: 0.1, contribution: 0 },
        { id: 'bank', totalReturnRate: 0.02, grossBankReturnRate: 0.02, contribution: 0 },
      ],
    }, noInsurance)
    expect(result.status).toBe('converged')
    expect(result.bankInterest).toBeCloseTo(800, 9)
    // Independent recomputation from the realized gains plus the credited interest.
    const expected = assessCore(
      result.sale.adjustedFundSaleGain + result.movement.adjustedFundSaleGain,
      result.receivedVorabpauschale, 0, allowance, true, result.bankInterest)
    expect(result.withdrawalTax!.taxableWithdrawal).toBeCloseTo(expected.taxableWithdrawal, 9)
    expect(result.withdrawalTax!.capitalIncomeTax).toBeCloseTo(expected.capitalIncomeTax, 9)
    // The credited interest is inside the taxable amount, not just alongside it.
    const fundOnly = assessCore(
      result.sale.adjustedFundSaleGain + result.movement.adjustedFundSaleGain,
      result.receivedVorabpauschale, 0, allowance, true)
    expect(result.withdrawalTax!.taxableWithdrawal).toBeCloseTo(fundOnly.taxableWithdrawal + 800, 9)
    // Funding fixed point: required covers spending plus the interest-inclusive tax.
    expect(result.requiredWithdrawal).toBeCloseTo(
      10_000 + result.withdrawalTax!.capitalIncomeTax, 4)
    expect(result.closingCapital).toBeCloseTo(
      result.openingCapital + result.investmentReturn + result.contribution - result.paidWithdrawal, 9)
  })
})

function interestFixture(): RentenlueckeInput {
  return insuredInput({
    currentAge: 64, retirementAge: 65, planningAge: 69, currentCapital: 100000,
    monthlyContributionToday: 100, monthlyDesiredSpendingToday: 2500,
    estimatorPortfolio: [
      { id: 'fund', name: 'Fonds', value: 60000, holding: 'accumulating-equity-fund', returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.equity },
      { id: 'bank', name: 'Bank', value: 40000, holding: 'ordinary-bank-deposit', returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.cash },
    ],
    retirementInsurance: automaticInsurance({
      bridge: { status: 'voluntary', circumstances: 'standard', capitalMode: 'automatic' },
      capitalEstimator: { fundAcquisitionCost: 30000, projectedBasisRate: 0.032, scopeConfirmed: true, lossScopeConfirmed: true },
    }),
  })
}

const interestPath = (input: RentenlueckeInput, fund = 0.1, bank = 0.02) => Array.from(
  { length: input.planningAge - input.currentAge }, () => [
    { id: 'fund', totalReturnRate: fund }, { id: 'bank', totalReturnRate: bank, grossBankReturnRate: bank },
  ])

describe('ledger integration: required capital, bootstrap, shortfall and surplus', () => {
  it('recomputes every ledger tax from realized gains plus credited interest (bootstrap parity)', () => {
    const input = interestFixture()
    const full = simulateScenarioWithReturnPath(input, [], undefined, interestPath(input))
    const sampled = simulateCapitalLedgerPath(normalizeInput(input), interestPath(input), () => 0)
    expect(sampled.rows).toEqual(full.rows)
    let openingLoss = 0
    for (const row of full.rows) {
      const assessment = row.capitalAssessment!
      // Independent check: the row tax is the shared core on the year's realized
      // sale/movement gains and received VP plus the once-credited gross interest.
      const expected = assessCore(
        assessment.sale.adjustedFundSaleGain + assessment.movement.adjustedFundSaleGain,
        assessment.receivedVorabpauschale, openingLoss,
        scaledSparerpauschbetrag(row.inflationFactor), true, assessment.bankInterest)
      expect(row.capitalIncomeTax).toBeCloseTo(expected.capitalIncomeTax, 9)
      expect(row.taxableWithdrawal).toBeCloseTo(expected.taxableWithdrawal, 9)
      // Estimator conservation through the single authoritative outflow.
      expect(row.closingCapital).toBeCloseTo(
        row.openingCapital + row.investmentReturn + row.contribution - assessment.paidWithdrawal, 6)
      openingLoss = assessment.closingState!.simulatedLossCarryforward
    }
  })

  it('searches required capital with the interest-inclusive funding loop (survives/fails probe)', () => {
    const input = interestFixture()
    input.currentAge = input.retirementAge = 67
    input.planningAge = 69
    input.retirementInsurance!.pension = { status: 'voluntary', circumstances: 'standard', capitalMode: 'automatic', drvSubsidy: 'not-received' }
    const result = simulateScenario(input)
    const required = result.summary.requiredCapitalAtRetirement
    expect(required).toBeGreaterThan(0)
    const scaled = structuredClone(input)
    scaled.currentCapital = required
    scaled.estimatorPortfolio!.forEach(b => { b.value *= required / input.currentCapital })
    scaled.retirementInsurance!.capitalEstimator!.fundAcquisitionCost! *= required / input.currentCapital
    expect(simulateScenario(scaled).summary.survivesUntilPlanningAge).toBe(true)
    scaled.currentCapital = required - 2
    scaled.estimatorPortfolio!.forEach(b => { b.value *= (required - 2) / required })
    scaled.retirementInsurance!.capitalEstimator!.fundAcquisitionCost! *= (required - 2) / required
    expect(simulateScenario(scaled).summary.survivesUntilPlanningAge).toBe(false)
  })

  it('keeps shortfalls visible with the interest-inclusive tax assessed', () => {
    const input = interestFixture()
    input.monthlyDesiredSpendingToday = 100000
    const result = simulateScenario(input)
    const first = result.retirementRows[0]
    expect(first.capitalAssessment!.status).toBe('shortfall')
    expect(first.unfundedWithdrawal).toBeGreaterThan(0)
    expect(first.closingCapital).toBe(0)
    // The tax is still the shared core on the actual (shortfall) sale plus interest.
    const assessment = first.capitalAssessment!
    const expected = assessCore(
      assessment.sale.adjustedFundSaleGain + assessment.movement.adjustedFundSaleGain,
      assessment.receivedVorabpauschale, 0,
      scaledSparerpauschbetrag(first.inflationFactor), true, assessment.bankInterest)
    expect(first.capitalIncomeTax).toBeCloseTo(expected.capitalIncomeTax, 9)
  })

  it('leaves surplus income outside the portfolio with interest credited exactly once', () => {
    const input = interestFixture()
    input.currentAge = input.retirementAge = 67
    input.monthlyDesiredSpendingToday = 100
    input.retirementInsurance!.pension = { status: 'voluntary', circumstances: 'standard', capitalMode: 'automatic', drvSubsidy: 'not-received' }
    const full = simulateScenarioWithReturnPath(input, [], undefined, interestPath(input))
    const sampled = simulateCapitalLedgerPath(normalizeInput(input), interestPath(input), () => 0)
    expect(sampled.rows).toEqual(full.rows)
    expect(full.summary.requiredCapitalAtRetirement).toBe(0)
    for (const row of full.rows) {
      expect(row.surplusIncome).toBeGreaterThan(0)
      expect(row.capitalAssessment!.paidWithdrawal).toBe(0)
      // No double credit: the credited gross interest is inside the single return.
      expect(row.closingCapital).toBeCloseTo(row.openingCapital + row.investmentReturn, 6)
    }
  })
})

describe('visible bank-interest tax disclosure', () => {
  it('names bank interest in the detailed tax scope without overclaiming manual coverage', () => {
    expect(taxDisclosures.join(' ')).toMatch(/Bankzins/)
    expect(estimatorDisclosures.join(' ')).toMatch(/Bankzins/)
    expect(manualApproximationDisclosure).toMatch(/Bankzins/)
  })
})
