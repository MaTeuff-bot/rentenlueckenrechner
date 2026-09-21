import { createInflationFactorResolver } from './simulateAccumulation'
import { calculateRetirementIncomeForYear, grvPensionGrossForYear } from './retirementIncomeStreams'
import { createTaxState, scaledSparerpauschbetrag, type CapitalIncomeTaxState } from './tax/capitalIncomeTax'
import { assessPensionYearTaxValues, resolvePensionTaxSetup } from './tax/incomeTax'
import { assessCore } from './tax/pureCore'
import type { AnnualInflationResolver, AnnualReturnResolver, NormalizedScenario, YearlyPeriodRow } from './types'

export const MONEY_EPSILON = 1e-7

export type RetirementTaxFunding = { capitalIncomeTax: number }

/** Gain-proportional approximation for withdrawals without a holdings breakdown
 * (scalar ledger: no acquisition costs, no assessed Vorabpauschalen).
 * The withdrawal's share of the year's capital growth is treated as realized gain;
 * signed, so withdrawals in loss years feed the tax loss carryforward. */
export function estimateScalarWithdrawalGain(input: {
  capitalBeforeCashflow: number
  investmentReturn: number
  gapWithdrawal: number
}): number {
  const { capitalBeforeCashflow, investmentReturn, gapWithdrawal } = input
  if (!(capitalBeforeCashflow > 0) || !(gapWithdrawal > 0)) return 0
  return investmentReturn * Math.min(1, gapWithdrawal / capitalBeforeCashflow)
}

/** Single retirement-year tax assessment on the gain-proportional base.
 * No Teilfreistellung without a holdings breakdown (conservative, disclosed);
 * the effective allowance is the inflation-scaled Sparerpauschbetrag held in
 * state.allowanceAnnual; loss carryforward rolls through the given state. */
export function assessScalarWithdrawalTax(
  state: CapitalIncomeTaxState,
  input: { capitalBeforeCashflow: number; investmentReturn: number; gapWithdrawal: number },
) {
  // State scope/loss validated at creation; the hot arithmetic lives in the
  // dependency-free pure core (positional args keep the capital search fast).
  const result = assessCore(
    estimateScalarWithdrawalGain(input), 0,
    state.lossCarryforward, state.allowanceAnnual, false)
  return { result, nextState: { ...state, lossCarryforward: result.closingLossCarryforward } }
}

export function createRetirementTaxState(openingLossCarryforward = 0): CapitalIncomeTaxState {
  return createTaxState({
    scope: 'single-person-domestic-private-post-2017-no-special-events',
    allowanceMode: 'single-sparerpauschbetrag',
    openingLossCarryforward,
  })
}

// Shared funding step used by the ledger and required-capital search.
// The portfolio funds gapWithdrawal + capitalIncomeTax (Abgeltungsteuer withholding
// analogy: tax first, the gap receives the remainder). Shortfalls stay visible as
// unfundedWithdrawal and are never silently covered.
export function fundRetirementYear(
  capital: number,
  nominalReturnRate: number,
  gapWithdrawal: number,
  tax: RetirementTaxFunding = { capitalIncomeTax: 0 },
) {
  const investmentReturn = capital * nominalReturnRate
  const capitalBeforeCashflow = capital + investmentReturn
  const capitalIncomeTax = Math.max(0, tax.capitalIncomeTax)
  const rawClosingCapital = capitalBeforeCashflow - gapWithdrawal - capitalIncomeTax
  const depleted = rawClosingCapital < -MONEY_EPSILON
  const unfundedWithdrawal = depleted ? -rawClosingCapital : 0
  const closingCapital = rawClosingCapital < MONEY_EPSILON ? 0 : rawClosingCapital
  const paidTotal = Math.max(0, capitalBeforeCashflow - closingCapital)
  const taxPaid = Math.min(capitalIncomeTax, paidTotal)
  return {
    investmentReturn, capitalBeforeCashflow, depleted,
    unfundedWithdrawal,
    closingCapital,
    capitalIncomeTax,
    netGapWithdrawal: Math.max(0, paidTotal - taxPaid),
  }
}

export function simulateRetirementRows(
  scenario: NormalizedScenario,
  startingCapitalAtRetirement: number,
  getAnnualReturn?: AnnualReturnResolver,
  getAnnualInflation?: AnnualInflationResolver,
): YearlyPeriodRow[] {
  let capital = startingCapitalAtRetirement
  let taxState = createRetirementTaxState()
  const rows: YearlyPeriodRow[] = []
  const getInflationFactor = createInflationFactorResolver(scenario.annualInflationRate, getAnnualInflation)
  // Rentenbesteuerung setup is capital-independent: the frozen Rentenfreibetrag
  // derives from the first simulation retirement year with GRV receipt (rule
  // snapshot docs/rentenbesteuerung-rules-2026.md). Null when no GRV stream pays.
  const pensionTaxSetup = resolvePensionTaxSetup({
    streams: scenario.sourceInput.retirementIncomeStreams,
    currentAge: scenario.currentAge,
    retirementAge: scenario.retirementAge,
    planningAge: scenario.planningAge,
    referenceYear: scenario.retirementInsurance.referenceYear,
    yearsToRetirement: scenario.yearsToRetirement,
    inflationFactorAt: (yearIndex: number) => getInflationFactor(yearIndex),
  })

  for (let retirementYear = 0; retirementYear < scenario.retirementYears; retirementYear += 1) {
    const yearIndex = scenario.yearsToRetirement + retirementYear
    const ageStart = scenario.retirementAge + retirementYear
    const ageEnd = ageStart + 1
    const inflationFactor = getInflationFactor(yearIndex)
    const desiredSpending = scenario.annualDesiredSpendingToday * inflationFactor
    const income = calculateRetirementIncomeForYear(scenario.sourceInput, ageStart, inflationFactor)
    // Rentenbesteuerung first (capital-independent): GRV-Rentensteuer reduces the
    // spendable net, so the gap is net of ALL deductions (KV/PV + pension tax).
    // The Abgeltungsteuer assessment below then runs on the resulting gap.
    const grvGross = grvPensionGrossForYear(scenario.sourceInput, ageStart, inflationFactor)
    // Arithmetic core (no per-year validation): setup validated once at creation,
    // yearly values are engine-computed money — see assessPensionYearTaxValues.
    const pensionAssessment = pensionTaxSetup
      ? assessPensionYearTaxValues(pensionTaxSetup, grvGross, income.kv, income.pv, inflationFactor)
      : null
    const pensionIncomeTax = pensionAssessment?.pensionIncomeTax ?? 0
    const retirementIncomeNet = income.net - pensionIncomeTax
    const gapWithdrawal = Math.max(0, desiredSpending - retirementIncomeNet)
    const gapWithdrawalToday = gapWithdrawal / inflationFactor
    const surplusIncome = Math.max(0, retirementIncomeNet - desiredSpending)
    const nominalReturnRate = getAnnualReturn?.(yearIndex, 'retirement') ?? scenario.annualReturnInRetirement
    const capitalBeforeCashflow = capital + capital * nominalReturnRate
    // Effective allowance scales with scenario inflation (planning assumption, legally nominal).
    taxState = { ...taxState, allowanceAnnual: scaledSparerpauschbetrag(inflationFactor) }
    const assessed = assessScalarWithdrawalTax(taxState, {
      capitalBeforeCashflow, investmentReturn: capital * nominalReturnRate, gapWithdrawal,
    })
    taxState = assessed.nextState
    const { result: taxAssessment } = assessed
    const { investmentReturn, depleted, unfundedWithdrawal, closingCapital, netGapWithdrawal } =
      fundRetirementYear(capital, nominalReturnRate, gapWithdrawal, { capitalIncomeTax: taxAssessment.capitalIncomeTax })
    const closingCapitalToday = closingCapital / getInflationFactor(yearIndex + 1)

    rows.push({
      yearIndex,
      ageStart,
      ageEnd,
      phase: 'retirement',
      inflationFactor,
      nominalReturnRate,
      openingCapital: capital,
      investmentReturn,
      capitalBeforeCashflow,
      contribution: 0,
      desiredSpending,
      retirementIncome: retirementIncomeNet,
      retirementIncomeGross: income.gross,
      retirementIncomeDeductions: income.deductions,
      insurance: income.insurance,
      retirementIncomeOtherDeductions: income.otherDeductions,
      healthInsurance: income.kv,
      careInsurance: income.pv,
      portfolioContributionBase: income.portfolioBase,
      retirementIncomeNet,
      pensionIncomeTax,
      pensionTaxBase: pensionAssessment?.pensionTaxBase ?? 0,
      surplusIncome,
      gapWithdrawal,
      gapWithdrawalToday,
      capitalIncomeTax: taxAssessment.capitalIncomeTax,
      taxableWithdrawal: taxAssessment.taxableWithdrawal,
      sparerpauschbetragApplied: taxAssessment.sparerpauschbetragApplied,
      netGapWithdrawal,
      closingCapital,
      closingCapitalToday,
      depleted,
      unfundedWithdrawal,
    })

    capital = closingCapital
  }

  return rows
}
