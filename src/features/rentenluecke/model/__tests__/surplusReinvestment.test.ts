import { describe, expect, it } from 'vitest'
import { cashOnlyInput } from './insuranceFixtures'
import { simulateScenarioWithReturnPath } from '../stochasticReturns'
import { simulateCapitalLedgerPath } from '../capitalIncome/ledger'
import { normalizeInput } from '../normalizeInput'
import { calculateVorabpauschale } from '../capitalIncome/insuranceEstimator'
import { assessCore } from '../tax/pureCore'
import { scaledSparerpauschbetrag } from '../tax/capitalIncomeTax'
import { PLANNING_RATE_SOURCE_ID, SYNTHETIC_RETURN_SERIES_IDS } from '../historicalReturns/constants'
import type { RentenlueckeInput } from '../types'
import { insuredInput, automaticInsurance, pension } from './insuranceFixtures'

function otherStream(monthly: number, id = 'other') {
  return {
    id, name: 'Other', amountMonthlyToday: monthly, startAge: 67, endAge: null,
    amountBasis: 'gross' as const, deductionMode: 'effectiveHaircut' as const, effectiveDeductionRate: 0,
  }
}

function bankOnlyInput(opening: number, monthlyIncome: number, monthlySpending: number, years = 1): RentenlueckeInput {
  return cashOnlyInput({
    currentAge: 67, retirementAge: 67, planningAge: 67 + years,
    currentCapital: opening,
    monthlyDesiredSpendingToday: monthlySpending,
    annualInflationRate: 0, annualReturnBeforeRetirement: 0, annualReturnInRetirement: 0,
    estimatorPortfolio: [{ id: 'bank', name: 'Bank', value: opening, holding: 'ordinary-bank-deposit' as const, returnSeriesId: PLANNING_RATE_SOURCE_ID }],
    retirementIncomeStreams: [otherStream(monthlyIncome)],
    retirementInsurance: {
      referenceYear: 2026, childBirthYears: [], pensionAge: 67,
      capitalEstimator: { projectedBasisRate: 0.032, scopeConfirmed: true, lossScopeConfirmed: true },
      bridge: { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 },
      pension: { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 },
    },
  })
}

function fundOnlyInput(opening: number, cost: number, monthlyIncome: number, monthlySpending: number, years = 1): RentenlueckeInput {
  return cashOnlyInput({
    currentAge: 67, retirementAge: 67, planningAge: 67 + years,
    currentCapital: opening,
    monthlyDesiredSpendingToday: monthlySpending,
    annualInflationRate: 0, annualReturnBeforeRetirement: 0, annualReturnInRetirement: 0,
    estimatorPortfolio: [{ id: 'fund', name: 'Fonds', value: opening, holding: 'accumulating-equity-fund' as const, returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.equity }],
    retirementIncomeStreams: [otherStream(monthlyIncome)],
    retirementInsurance: {
      referenceYear: 2026, childBirthYears: [], pensionAge: 67,
      capitalEstimator: { fundAcquisitionCost: cost, projectedBasisRate: 0.032, scopeConfirmed: true, lossScopeConfirmed: true },
      bridge: { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 },
      pension: { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 },
    },
  })
}

function mixedInput(fundValue: number, bankValue: number, cost: number, monthlyIncome: number, monthlySpending: number, years = 1): RentenlueckeInput {
  const total = fundValue + bankValue
  return cashOnlyInput({
    currentAge: 67, retirementAge: 67, planningAge: 67 + years,
    currentCapital: total,
    monthlyDesiredSpendingToday: monthlySpending,
    annualInflationRate: 0, annualReturnBeforeRetirement: 0, annualReturnInRetirement: 0,
    estimatorPortfolio: [
      { id: 'fund', name: 'Fonds', value: fundValue, holding: 'accumulating-equity-fund' as const, returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.equity },
      { id: 'bank', name: 'Bank', value: bankValue, holding: 'ordinary-bank-deposit' as const, returnSeriesId: PLANNING_RATE_SOURCE_ID },
    ],
    retirementIncomeStreams: [otherStream(monthlyIncome)],
    retirementInsurance: {
      referenceYear: 2026, childBirthYears: [], pensionAge: 67,
      capitalEstimator: { fundAcquisitionCost: cost, projectedBasisRate: 0.032, scopeConfirmed: true, lossScopeConfirmed: true },
      bridge: { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 },
      pension: { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 },
    },
  })
}

const bankPath = (years: number, rate = 0.02) =>
  Array.from({ length: years }, () => [{ id: 'bank', totalReturnRate: rate, grossBankReturnRate: rate }])
const fundPath = (years: number, rate = 0.05) =>
  Array.from({ length: years }, () => [{ id: 'fund', totalReturnRate: rate }])
const mixedPath = (years: number, fund = 0.05, bank = 0.02) =>
  Array.from({ length: years }, () => [
    { id: 'fund', totalReturnRate: fund },
    { id: 'bank', totalReturnRate: bank, grossBankReturnRate: bank },
  ])

describe('retirement surplus reinvestment (signed funding need)', () => {
  it('bank-only surplus: income pays capital tax with no sale and no second debit', () => {
    // Opening 100k bank at 2%: interest 2000, allowance 1000 -> base 1000 -> tax 263.75.
    // Income 2000/mo = 24000, spending 100/mo = 1200, manual KV/PV 0, no pension tax.
    // Signed need = 1200 - 24000 + 263.75 = -22536.25; surplus = 22536.25.
    // Closing = 100000 + 2000 + 22536.25 = 124536.25, paid 0, no fund cost/VP.
    const input = bankOnlyInput(100_000, 2000, 100, 1)
    const result = simulateScenarioWithReturnPath(input, [], undefined, bankPath(1, 0.02))
    const [row] = result.retirementRows
    expect(row.capitalAssessment!.paidWithdrawal).toBe(0)
    expect(row.capitalAssessment!.requiredWithdrawal).toBe(0)
    expect(row.capitalIncomeTax).toBeCloseTo(263.75, 8)
    expect(row.surplusIncome).toBeCloseTo(22_536.25, 8)
    expect(row.surplusReinvested).toBeCloseTo(22_536.25, 8)
    expect(row.surplusIncome).toBeCloseTo(row.retirementIncomeNet - row.desiredSpending - (row.capitalIncomeTax ?? 0), 8)
    expect(row.closingCapital).toBeCloseTo(124_536.25, 6)
    expect(row.closingCapital).toBeCloseTo(row.openingCapital + row.investmentReturn + (row.surplusReinvested ?? 0), 8)
    expect(row.capitalAssessment!.closingState!.fundAcquisitionCost).toBe(0)
    expect(row.capitalAssessment!.pendingVorabpauschale).toBe(0)
    expect(row.capitalAssessment!.bankInterest).toBeCloseTo(2000, 8)
    expect(row.investmentReturn).toBeCloseTo(2000, 8)
  })

  it('fund-only surplus: adds pooled cost and December VP, no current-year return on new money', () => {
    // Opening 100k fund at 5%, cost 100k (no gain): 0-withdrawal tax 0 (no VP receipt first year).
    // Income 3000/mo = 36000, spending 2000/mo = 24000 -> surplus 12000.
    // Fund share 12000 adds cost; December VP = 1/12 of capped amount.
    const input = fundOnlyInput(100_000, 100_000, 3000, 2000, 1)
    const result = simulateScenarioWithReturnPath(input, [], undefined, fundPath(1, 0.05))
    const [row] = result.retirementRows
    expect(row.capitalIncomeTax).toBe(0)
    expect(row.surplusIncome).toBeCloseTo(12_000, 8)
    expect(row.surplusReinvested).toBeCloseTo(12_000, 8)
    expect(row.investmentReturn).toBeCloseTo(5000, 8)
    expect(row.closingCapital).toBeCloseTo(100_000 + 5000 + 12_000, 6)
    expect(row.capitalAssessment!.closingState!.fundAcquisitionCost).toBeCloseTo(100_000 + 12_000, 6)
    // Independently hand-computed December pending VP (not only via the
    // production helper): old holding 100000 x 0.7 x 0.032 = 2240, capped by
    // the 5000 gain, full-year factor 12/12 => 2240. December purchase 12000
    // at 5%: January NAV 12000/1.05 = 11428.571428571429, base
    // 11428.571428571429 x 0.7 x 0.032 = 256, capped by the 571.4285714285714
    // gain, 1/12 => 21.33333333333333. Total pending VP 2261.3333333333335.
    expect(row.capitalAssessment!.pendingVorabpauschale).toBeCloseTo(2240 + 21.33333333333333, 6)
    const oldVp = calculateVorabpauschale({ startValue: 100_000, endValue: 105_000, projectedBasisRate: 0.032, acquisitionMonth: 1 })
    const surplusVp = calculateVorabpauschale({ startValue: 12_000 / 1.05, endValue: 12_000, projectedBasisRate: 0.032, acquisitionMonth: 12 })
    expect(oldVp).toBeCloseTo(2240, 8)
    expect(surplusVp).toBeCloseTo(21.33333333333333, 8)
    expect(row.capitalAssessment!.pendingVorabpauschale).toBeCloseTo(oldVp + surplusVp, 8)
    expect(row.capitalAssessment!.bankInterest).toBe(0)
    // Tax/allowance/loss untouched by the purchase.
    expect(row.taxableWithdrawal).toBe(0)
    expect(row.sparerpauschbetragApplied).toBe(0)
    expect(row.capitalAssessment!.closingState!.simulatedLossCarryforward).toBe(0)
  })

  it('mixed surplus splits proportionally to current holdings; zero bucket gets zero', () => {
    // Fund 60000 + bank 40000, zero returns, full cost basis (no tax).
    // Income 3000/mo = 36000, spending 2000/mo = 24000 -> surplus 12000.
    // Post-funding total 100000: fund share 7200, bank share 4800.
    const input = mixedInput(60_000, 40_000, 60_000, 3000, 2000, 1)
    const result = simulateScenarioWithReturnPath(input, [], undefined, mixedPath(1, 0, 0).map(row => row.map(b => b.id === 'bank' ? { ...b, totalReturnRate: 0, grossBankReturnRate: 0 } : b)))
    const [row] = result.retirementRows
    expect(row.surplusIncome).toBeCloseTo(12_000, 8)
    const buckets = row.capitalAssessment!.closingState!.buckets
    expect(buckets.find(b => b.id === 'fund')!.value).toBeCloseTo(60_000 + 7200, 6)
    expect(buckets.find(b => b.id === 'bank')!.value).toBeCloseTo(40_000 + 4800, 6)
    expect(row.capitalAssessment!.closingState!.fundAcquisitionCost).toBeCloseTo(60_000 + 7200, 6)
    // Zero returns accrue no VP.
    expect(row.capitalAssessment!.pendingVorabpauschale).toBeCloseTo(0, 10)
  })

  it('zero-balance bucket gets zero share when positive holdings exist', () => {
    const input = mixedInput(100_000, 0, 100_000, 3000, 2000, 1)
    const result = simulateScenarioWithReturnPath(input, [], undefined, mixedPath(1, 0, 0).map(row => row.map(b => b.id === 'bank' ? { ...b, totalReturnRate: 0, grossBankReturnRate: 0 } : b)))
    const [row] = result.retirementRows
    expect(row.surplusIncome).toBeCloseTo(12_000, 8)
    const buckets = row.capitalAssessment!.closingState!.buckets
    expect(buckets.find(b => b.id === 'fund')!.value).toBeCloseTo(112_000, 6)
    expect(buckets.find(b => b.id === 'bank')!.value).toBeCloseTo(0, 10)
  })

  it('capital tax larger than income margin leaves no surplus and funds from portfolio', () => {
    // Same bank 2% tax 263.75, but margin only 240: income 24000, spending 23760.
    // Signed need = 23760 - 24000 + 263.75 = 23.75 > 0 -> required > 0, surplus 0.
    const input = bankOnlyInput(100_000, 2000, 1980, 1)
    const result = simulateScenarioWithReturnPath(input, [], undefined, bankPath(1, 0.02))
    const [row] = result.retirementRows
    expect(row.surplusIncome).toBe(0)
    expect(row.surplusReinvested ?? 0).toBe(0)
    expect(row.gapWithdrawal).toBeGreaterThan(0)
    expect(row.capitalAssessment!.paidWithdrawal).toBeGreaterThan(0)
    expect(row.closingCapital).toBeCloseTo(row.openingCapital + row.investmentReturn - row.capitalAssessment!.paidWithdrawal, 6)
  })

  it('capital tax equal to income margin is the zero-surplus boundary', () => {
    // Margin exactly 263.75: income 24000, spending 23736.25 -> need 0 -> required 0, surplus 0.
    const input = bankOnlyInput(100_000, 2000, 23736.25 / 12, 1)
    const result = simulateScenarioWithReturnPath(input, [], undefined, bankPath(1, 0.02))
    const [row] = result.retirementRows
    expect(row.capitalIncomeTax).toBeCloseTo(263.75, 6)
    expect(row.surplusIncome).toBeCloseTo(0, 6)
    expect(row.surplusReinvested ?? 0).toBeCloseTo(0, 8)
    expect(row.gapWithdrawal).toBeCloseTo(0, 6)
    expect(row.capitalAssessment!.paidWithdrawal).toBeCloseTo(0, 8)
    expect(row.closingCapital).toBeCloseTo(row.openingCapital + row.investmentReturn, 6)
  })

  it('charges KV/PV, pension tax and capital tax exactly once with conservation and no overshoot', () => {
    const base = insuredInput({
      currentAge: 67, retirementAge: 67, planningAge: 68, currentCapital: 100_000,
      monthlyContributionToday: 0, monthlyDesiredSpendingToday: 100,
      annualInflationRate: 0, annualReturnBeforeRetirement: 0, annualReturnInRetirement: 0,
      estimatorPortfolio: [
        { id: 'fund', name: 'Fonds', value: 60_000, holding: 'accumulating-equity-fund' as const, returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.equity },
        { id: 'bank', name: 'Bank', value: 40_000, holding: 'ordinary-bank-deposit' as const, returnSeriesId: PLANNING_RATE_SOURCE_ID },
      ],
      retirementInsurance: automaticInsurance({
        bridge: { status: 'voluntary', circumstances: 'standard', capitalMode: 'automatic' },
        pension: { status: 'voluntary', circumstances: 'standard', capitalMode: 'automatic', drvSubsidy: 'not-received' },
        capitalEstimator: { fundAcquisitionCost: 30_000, projectedBasisRate: 0.032, scopeConfirmed: true, lossScopeConfirmed: true },
      }),
      retirementIncomeStreams: [{ ...pension({ amountMonthlyToday: 2000 }), startAge: 67 }],
    })
    const path = mixedPath(1, 0, 0).map(row => row.map(b => b.id === 'bank' ? { ...b, totalReturnRate: 0, grossBankReturnRate: 0 } : b))
    const result = simulateScenarioWithReturnPath(base, [], undefined, path)
    const [row] = result.retirementRows
    expect(row.gapWithdrawal).toBe(0)
    expect(row.capitalAssessment!.paidWithdrawal).toBe(0)
    expect(row.retirementIncomeNet).toBeCloseTo(row.retirementIncomeGross - row.retirementIncomeOtherDeductions - row.healthInsurance - row.careInsurance - (row.pensionIncomeTax ?? 0), 8)
    expect(row.surplusIncome).toBeCloseTo(row.retirementIncomeNet - row.desiredSpending - (row.capitalIncomeTax ?? 0), 8)
    expect(row.surplusIncome).toBeGreaterThanOrEqual(0)
    expect(row.surplusIncome).toBeLessThanOrEqual(Math.max(0, row.retirementIncomeNet - row.desiredSpending) + 1e-9)
    expect(row.closingCapital).toBeCloseTo(row.openingCapital + row.investmentReturn + (row.surplusReinvested ?? 0), 6)
    // Once each: row insurance/taxes mirror the committed trial; income funds them (paid 0).
    expect(row.healthInsurance).toBeCloseTo(row.capitalAssessment!.insurance.kv, 8)
    expect(row.careInsurance).toBeCloseTo(row.capitalAssessment!.insurance.pv, 8)
    expect(row.netGapWithdrawal ?? 0).toBe(0)
    expect(row.capitalAssessment!.paidWithdrawal).toBe(0)
  })

  it('compounds surplus next year with interest once and shared allowance/loss once', () => {
    // Two bank years at 2%: year1 surplus raises year2 opening; year2 interest is opening2 * 2% once.
    const input = bankOnlyInput(100_000, 2000, 100, 2)
    const result = simulateScenarioWithReturnPath(input, [], undefined, bankPath(2, 0.02))
    const [first, second] = result.retirementRows
    expect(first.surplusReinvested).toBeCloseTo(first.surplusIncome, 8)
    expect(second.openingCapital).toBeCloseTo(first.closingCapital, 8)
    expect(second.capitalAssessment!.bankInterest).toBeCloseTo(second.openingCapital * 0.02, 8)
    expect(second.investmentReturn).toBeCloseTo(second.openingCapital * 0.02, 8)
    // Allowance applied once per year: each year taxable = interest (no gains/VP first two years for bank-only).
    // First year taxable 2000, second year taxable opening2*0.02; both use full 1000 allowance once.
    const firstExpected = assessCore(0, 0, 0, scaledSparerpauschbetrag(first.inflationFactor), true, first.capitalAssessment!.bankInterest)
    expect(first.capitalIncomeTax).toBeCloseTo(firstExpected.capitalIncomeTax, 8)
    const secondExpected = assessCore(
      0, second.capitalAssessment!.receivedVorabpauschale,
      first.capitalAssessment!.closingState!.simulatedLossCarryforward,
      scaledSparerpauschbetrag(second.inflationFactor), true, second.capitalAssessment!.bankInterest)
    expect(second.capitalIncomeTax).toBeCloseTo(secondExpected.capitalIncomeTax, 8)
    // Loss carryforward propagates without reconsumption for the purchase.
    expect(second.capitalAssessment!.closingState!.simulatedLossCarryforward).toBe(
      secondExpected.closingLossCarryforward)
    // Conservation each year.
    for (const row of result.retirementRows) {
      expect(row.closingCapital).toBeCloseTo(row.openingCapital + row.investmentReturn + (row.surplusReinvested ?? 0), 6)
    }
  })

  it('keeps deficit and accumulation years parity (no surplus, no behavior change)', () => {
    // Deficit: income 100/mo = 1200, spending 2000/mo = 24000, bank 0% (no tax) -> gap 22800, surplus 0.
    const deficit = bankOnlyInput(100_000, 100, 2000, 1)
    const deficitResult = simulateScenarioWithReturnPath(deficit, [], undefined, bankPath(1, 0))
    const [gapRow] = deficitResult.retirementRows
    expect(gapRow.surplusIncome).toBe(0)
    expect(gapRow.surplusReinvested ?? 0).toBe(0)
    expect(gapRow.gapWithdrawal).toBeCloseTo(22_800, 8)
    expect(gapRow.closingCapital).toBeCloseTo(gapRow.openingCapital + gapRow.investmentReturn - gapRow.capitalAssessment!.paidWithdrawal, 8)
    // Accumulation: contribution years never reinvest, gap 0, surplus 0.
    const acc = cashOnlyInput({
      currentAge: 64, retirementAge: 65, planningAge: 66, currentCapital: 100_000,
      monthlyContributionToday: 100, monthlyDesiredSpendingToday: 2000,
      annualInflationRate: 0, annualReturnBeforeRetirement: 0, annualReturnInRetirement: 0,
      estimatorPortfolio: [{ id: 'bank', name: 'Bank', value: 100_000, holding: 'ordinary-bank-deposit' as const, returnSeriesId: PLANNING_RATE_SOURCE_ID }],
      retirementIncomeStreams: [otherStream(2000)],
      retirementInsurance: {
        referenceYear: 2026, childBirthYears: [], pensionAge: 65,
        capitalEstimator: { projectedBasisRate: 0.032, scopeConfirmed: true, lossScopeConfirmed: true },
        bridge: { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 },
        pension: { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 },
      },
    })
    const accResult = simulateScenarioWithReturnPath(acc, [], undefined, bankPath(2, 0))
    for (const row of accResult.accumulationRows) {
      expect(row.surplusIncome).toBe(0)
      expect(row.surplusReinvested ?? 0).toBe(0)
      expect(row.gapWithdrawal).toBe(0)
    }
  })

  it('allows negative net returns due to costs while reinvesting surplus', () => {
    // Gross +2% interest but net -3% wealth return (5% costs, not deductible).
    const input = bankOnlyInput(100_000, 3000, 100, 1)
    const path = [[{ id: 'bank', totalReturnRate: -0.03, grossBankReturnRate: 0.02 }]]
    const result = simulateScenarioWithReturnPath(input, [], undefined, path)
    const [row] = result.retirementRows
    expect(row.investmentReturn).toBeCloseTo(-3000, 8)
    expect(row.capitalAssessment!.bankInterest).toBeCloseTo(2000, 8)
    expect(row.surplusIncome).toBeGreaterThan(0)
    expect(row.closingCapital).toBeCloseTo(row.openingCapital + row.investmentReturn + (row.surplusReinvested ?? 0), 6)
  })

  it('equal fallback across all declared buckets when post-funding total is zero', () => {
    // Year 1 has no retirement income (late stream starts at 68) so spending
    // depletes the 10k opening to zero; year 2 income 36k minus spending 12k
    // leaves a 24k surplus with zero post-funding total, split equally.
    const deplete = cashOnlyInput({
      currentAge: 67, retirementAge: 67, planningAge: 69, currentCapital: 10_000,
      monthlyDesiredSpendingToday: 1000, annualInflationRate: 0, annualReturnBeforeRetirement: 0, annualReturnInRetirement: 0,
      estimatorPortfolio: [
        { id: 'fund', name: 'Fonds', value: 6000, holding: 'accumulating-equity-fund' as const, returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.equity },
        { id: 'bank', name: 'Bank', value: 4000, holding: 'ordinary-bank-deposit' as const, returnSeriesId: PLANNING_RATE_SOURCE_ID },
      ],
      retirementIncomeStreams: [{ ...otherStream(3000, 'late'), startAge: 68, endAge: null }],
      retirementInsurance: {
        referenceYear: 2026, childBirthYears: [], pensionAge: 67,
        capitalEstimator: { fundAcquisitionCost: 6000, projectedBasisRate: 0.032, scopeConfirmed: true, lossScopeConfirmed: true },
        bridge: { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 },
        pension: { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 },
      },
    })
    const zeroPath = (years: number) => Array.from({ length: years }, () => [
      { id: 'fund', totalReturnRate: 0 },
      { id: 'bank', totalReturnRate: 0, grossBankReturnRate: 0 },
    ])
    const result = simulateScenarioWithReturnPath(deplete, [], undefined, zeroPath(2))
    const [first, second] = result.retirementRows
    expect(first.depleted).toBe(true)
    expect(first.closingCapital).toBe(0)
    expect(second.openingCapital).toBe(0)
    expect(second.surplusIncome).toBeGreaterThan(0)
    // Equal fallback: 24000 surplus (36000 income - 12000 spending) split 12000/12000.
    expect(second.surplusIncome).toBeCloseTo(24_000, 8)
    const buckets = second.capitalAssessment!.closingState!.buckets
    expect(buckets.find(b => b.id === 'fund')!.value).toBeCloseTo(12_000, 6)
    expect(buckets.find(b => b.id === 'bank')!.value).toBeCloseTo(12_000, 6)
    expect(second.closingCapital).toBeCloseTo(24_000, 6)
  })

  it('rejects zero-NAV fund purchases for surplus reinvestment', () => {
    const input = fundOnlyInput(100_000, 100_000, 3000, 100, 1)
    expect(() => simulateScenarioWithReturnPath(input, [], undefined, [[{ id: 'fund', totalReturnRate: -1 }]])).toThrow(/zero NAV/)
  })

  it('keeps nominal/today inflation units consistent', () => {
    const input = cashOnlyInput({
      currentAge: 67, retirementAge: 67, planningAge: 68, currentCapital: 100_000,
      monthlyDesiredSpendingToday: 100, annualInflationRate: 0.05,
      annualReturnBeforeRetirement: 0, annualReturnInRetirement: 0,
      estimatorPortfolio: [{ id: 'bank', name: 'Bank', value: 100_000, holding: 'ordinary-bank-deposit' as const, returnSeriesId: PLANNING_RATE_SOURCE_ID }],
      retirementIncomeStreams: [otherStream(2000)],
      retirementInsurance: {
        referenceYear: 2026, childBirthYears: [], pensionAge: 67,
        capitalEstimator: { projectedBasisRate: 0.032, scopeConfirmed: true, lossScopeConfirmed: true },
        bridge: { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 },
        pension: { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 },
      },
    })
    const result = simulateScenarioWithReturnPath(input, [], undefined, bankPath(1, 0))
    const [row] = result.retirementRows
    expect(row.surplusIncome).toBeGreaterThan(0)
    expect(row.closingCapitalToday).toBeCloseTo(row.closingCapital / row.inflationFactor / 1.05, 8)
    // Surplus stays nominal; today divisor is next-year factor.
  })

  it('shares deterministic, bootstrap and forward paths with controlled returns', () => {
    const input = mixedInput(60_000, 40_000, 30_000, 100, 2000, 2)
    const path = mixedPath(2, 0.05, 0.02)
    const full = simulateScenarioWithReturnPath(input, [], undefined, path)
    const sampled = simulateCapitalLedgerPath(normalizeInput(input), path, () => 0)
    expect(sampled.rows).toEqual(full.rows)
    // Genuinely positive surplus path parity (income far above spending):
    // fund 60k at 5% + bank 40k at 2%, income 36k/yr vs spending 1.2k/yr.
    const surplusInput = mixedInput(60_000, 40_000, 30_000, 3000, 100, 2)
    const surplusPath = mixedPath(2, 0.05, 0.02)
    const surplusFull = simulateScenarioWithReturnPath(surplusInput, [], undefined, surplusPath)
    const surplusSampled = simulateCapitalLedgerPath(normalizeInput(surplusInput), surplusPath, () => 0)
    expect(surplusSampled.rows).toEqual(surplusFull.rows)
    expect(surplusFull.retirementRows[0].surplusIncome).toBeGreaterThan(0)
    expect(surplusFull.retirementRows[0].surplusReinvested).toBeCloseTo(surplusFull.retirementRows[0].surplusIncome, 8)
    for (const row of surplusFull.retirementRows) {
      expect(row.closingCapital).toBeCloseTo(row.openingCapital + row.investmentReturn + (row.surplusReinvested ?? 0), 6)
    }
    // Forward ledger only: surplus compounding visible without a lifetime search.
    expect(Number.isFinite(full.summary.projectedCapitalAtRetirement)).toBe(true)
    expect(full.summary.survivesUntilPlanningAge).toBe(full.retirementRows.every((row) => !row.depleted))
    const lowSpending = mixedInput(60_000, 40_000, 30_000, 3000, 100, 2)
    const lowResult = simulateScenarioWithReturnPath(lowSpending, [], undefined, mixedPath(2, 0, 0).map(r => r.map(b => b.id === 'bank' ? { ...b, totalReturnRate: 0, grossBankReturnRate: 0 } : b)))
    expect(lowResult.summary.survivesUntilPlanningAge).toBe(true)
    expect(lowResult.retirementRows.every((row) => !row.depleted)).toBe(true)
    expect(lowResult.retirementRows.every((row) => row.unfundedWithdrawal === 0)).toBe(true)
    // Monotonicity spot-check (empirical, not a proof): surviving capital implies larger survives.
    // Truly unproved domains (discontinuous callbacks, shortfall branching) are not claimed as proven.
    const base = mixedInput(60_000, 40_000, 30_000, 100, 2500, 3)
    const caps = [1_000, 10_000, 50_000, 100_000, 200_000]
    const survives: boolean[] = []
    for (const cap of caps) {
      const scaled = {
        ...base, currentCapital: cap,
        estimatorPortfolio: base.estimatorPortfolio!.map(b => ({ ...b, value: b.value * (cap / 100_000) })),
        retirementInsurance: { ...base.retirementInsurance!, capitalEstimator: { ...base.retirementInsurance!.capitalEstimator!, fundAcquisitionCost: 30_000 * (cap / 100_000) } },
      } as RentenlueckeInput
      const r = simulateScenarioWithReturnPath(scaled, [], undefined, mixedPath(3, 0.02, 0.01))
      survives.push(r.summary.survivesUntilPlanningAge)
    }
    for (let i = 1; i < survives.length; i++) {
      if (survives[i - 1]) expect(survives[i]).toBe(true)
    }
  })
})
