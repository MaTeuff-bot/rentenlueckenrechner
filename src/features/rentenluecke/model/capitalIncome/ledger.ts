import { createEstimatorState, simulateEstimatorYear, type EstimatorState } from './insuranceEstimator'
import { scaledSparerpauschbetrag } from '../tax/capitalIncomeTax'
import { capitalMode } from './setup'
import { calculateRetirementIncomeForYear, grvPensionGrossForYear } from '../retirementIncomeStreams'
import { MONEY_EPSILON } from '../simulateRetirement'
import { assessPensionYearTaxValues, resolvePensionTaxSetup } from '../tax/incomeTax'
import { createInflationFactorResolver } from '../simulateAccumulation'
import { deriveSummary } from '../deriveSummary'
import type { AnnualInflationResolver, NormalizedScenario, SimulationResult, YearlyPeriodRow } from '../types'
import { createPortfolioComponentsFromBuckets } from '../portfolioBuckets'
import { expectedBucketReturns } from './returns'

export type BucketReturn = { id: string; totalReturnRate: number; grossBankReturnRate?: number }
export type BucketReturnPath = BucketReturn[][]

function buildCapitalLedger(scenario: NormalizedScenario, path?: BucketReturnPath, inflation?: AnnualInflationResolver) {
  const input = scenario.sourceInput
  const buckets = input.estimatorPortfolio!
  if (path && path.length !== scenario.yearsToRetirement + scenario.retirementYears)
    throw new Error('Automatische Kapitalbasis benötigt einen vollständigen Renditepfad für jedes Modelljahr.')
  const total = buckets.reduce((s, b) => s + b.value, 0)
  if (total <= 0) throw new Error('Automatische Kapitalbasis benötigt eine positive Ausgangsallokation.')
  const weights = buckets.map(b => b.value / total)
  const setup = input.retirementInsurance!.capitalEstimator!
  const initial = createEstimatorState({ buckets: buckets.map(b => ({ id: b.id, value: b.value, eligibility: b.holding as 'accumulating-equity-fund' | 'ordinary-bank-deposit' })), fundAcquisitionCost: buckets.some(b => b.holding === 'accumulating-equity-fund') ? setup.fundAcquisitionCost! : 0,
    scope: 'single-person-domestic-private-post-2017-no-special-events', lossHistory: 'confirmed-none-and-no-external-offsets' })
  const defaultReturns = expectedBucketReturns(input, { portfolioComponents: createPortfolioComponentsFromBuckets(buckets), inflationSourceId: 'fixed-manual', simulations: 1 })
  const factor = createInflationFactorResolver(scenario.annualInflationRate, inflation)
  // Rentenbesteuerung setup is capital-independent (frozen Rentenfreibetrag from
  // the first retirement year with GRV receipt). Shared across year() calls and
  // required-capital candidate trials; see docs/rentenbesteuerung-rules-2026.md.
  const pensionTaxSetup = resolvePensionTaxSetup({
    streams: input.retirementIncomeStreams,
    currentAge: scenario.currentAge,
    retirementAge: scenario.retirementAge,
    planningAge: scenario.planningAge,
    referenceYear: input.retirementInsurance!.referenceYear,
    yearsToRetirement: scenario.yearsToRetirement,
    inflationFactorAt: (yearIndex: number) => factor(yearIndex),
  })
  const year = (state: EstimatorState, index: number): YearlyPeriodRow => {
    const age = scenario.currentAge + index
    const accumulation = index < scenario.yearsToRetirement
    const inflationFactor = factor(index)
    const phase = age < input.retirementInsurance!.pensionAge! ? 'bridge' : 'pension'
    const p = input.retirementInsurance![phase]
    const automaticCapital = capitalMode(p) === 'automatic' && p.status !== 'kvdr'
    const incomeFor = (assessment: number) => calculateRetirementIncomeForYear(input, age, inflationFactor, automaticCapital ? assessment : undefined)
    const incomeBefore = accumulation ? null : incomeFor(0)
    const desiredSpending = accumulation ? 0 : scenario.annualDesiredSpendingToday * inflationFactor
    const contribution = accumulation ? scenario.annualContributionToday * inflationFactor : 0
    const rates = path ? path[index] : defaultReturns
    if (!rates || new Set(rates.map(r => r.id)).size !== rates.length || rates.some(r => !buckets.some(b => b.id === r.id)))
      throw new Error(`Ungültiger Renditepfad im Alter ${age}: Anlagen müssen eindeutig zugeordnet sein.`)
    // Abgeltungsteuer on realized fund gains + received Vorabpauschale, both for
    // retirement Entnahmen and accumulation Umschichtungen (same assessCore path).
    // Single-source loss input: the estimator opening state's simulated loss
    // carryforward, shared across accumulation and retirement years. The allowance
    // is the inflation-scaled Sparerpauschbetrag (base 1,000 EUR × factor).
    const allowanceAvailable = scaledSparerpauschbetrag(inflationFactor)
    const result = simulateEstimatorYear(state, {
      projectedBasisRate: setup.projectedBasisRate, expenseAllowance: 51 * inflationFactor,
      spendingLessOtherIncome: desiredSpending - (incomeBefore ? incomeBefore.gross - incomeBefore.otherDeductions : 0),
      withdrawalTax: { openingLossCarryforward: state.simulatedLossCarryforward, allowanceAvailable },
      buckets: buckets.map((b, n) => {
        const r = rates.find(r => r.id === b.id)
        if (!r && b.value > 0) throw new Error(`Fehlender Renditepfad: ${b.name}`)
        return { id: b.id, totalReturnRate: r?.totalReturnRate ?? 0, grossBankReturnRate: b.holding === 'ordinary-bank-deposit' ? r?.grossBankReturnRate : undefined, contribution: contribution * weights[n], targetWeight: weights[n] }
      }),
    }, assessment => accumulation ? { kv: 0, pv: 0 } : incomeFor(assessment))
    if (!result.closingState) throw new Error(`Kapitalbasis: numerischer Finanzierungsfehler im Alter ${age}; Restabweichung ${result.residual} €.`)
    const income = accumulation ? null : incomeFor(result.assessment.annualAssessment)
    // Rentenbesteuerung on the final assessment's income (ordering: estimator year
    // incl. Kapitalertragsteuer first, then GRV pension tax from the resulting
    // KV/PV amounts, funded the same year).
    // Arithmetic core (no per-year validation): setup validated once at creation,
    // yearly values are engine-computed money — see assessPensionYearTaxValues.
    const pensionAssessment = !accumulation && pensionTaxSetup
      ? assessPensionYearTaxValues(pensionTaxSetup,
        grvPensionGrossForYear(input, age, inflationFactor),
        income?.kv ?? 0, income?.pv ?? 0, inflationFactor)
      : null
    const pensionIncomeTax = pensionAssessment?.pensionIncomeTax ?? 0
    const pensionTaxBase = pensionAssessment?.pensionTaxBase ?? 0
    const retirementIncomeNet = (income?.net ?? 0) - pensionIncomeTax
    // The pension tax joins the same funding logic as insurance (estimator line
    // 263: required = max(0, spending + insurance + capitalTax)): the portfolio
    // funds only what outside income cannot cover. baseNeed recomputes the
    // estimator's pre-max required amount from final values, so the gap stays
    // net of ALL deductions while a surplus keeps absorbing taxes outside the
    // portfolio (no funding when the surplus covers the pension tax).
    const capitalTax = result.withdrawalTax?.capitalIncomeTax ?? 0
    const baseNeed = !accumulation && income
      ? desiredSpending - (income.gross - income.otherDeductions)
        + result.insurance.kv + result.insurance.pv + capitalTax
      : 0
    const gapWithdrawal = accumulation ? 0 : Math.max(0, baseNeed + pensionIncomeTax)
    const extraFunding = accumulation ? 0 : Math.max(0, gapWithdrawal - result.requiredWithdrawal)
    // Same-year funding of the pension-tax share from the remaining portfolio
    // (planning approximation, mirroring fundRetirementYear in
    // simulateRetirement.ts). Shortfalls stay visible as unfundedWithdrawal,
    // never silently covered.
    const estimatorShortfall = result.status === 'shortfall'
    let closingCapital = result.closingCapital
    let paidWithdrawal = result.paidWithdrawal
    let pensionUnfunded = 0
    if (extraFunding > 0 && !estimatorShortfall) {
      const rawClosingCapital = closingCapital - extraFunding
      if (rawClosingCapital < -MONEY_EPSILON) {
        pensionUnfunded = -rawClosingCapital
        paidWithdrawal += closingCapital
        closingCapital = 0
      } else {
        paidWithdrawal += extraFunding
        closingCapital = rawClosingCapital < MONEY_EPSILON ? 0 : rawClosingCapital
      }
    } else if (extraFunding > 0) {
      pensionUnfunded = extraFunding
    }
    const fundedPensionTax = extraFunding - pensionUnfunded
    // Funded pension tax leaves the estimator's holdings as a pro-rata cash take:
    // bucket values scale down so the chained next-year opening matches this
    // row's closing (no double-counted tax). Cost, Vorabpauschalen and the loss
    // carryforward stay untouched, so the estimator's book-chaining identities
    // keep holding exactly; no gain realization is modeled on the funding take
    // (planning approximation, disclosed in the rule snapshot — like worthless
    // fund costs, the per-euro cost base simply survives the cash take).
    let closingState = result.closingState
    if (fundedPensionTax > 0 && closingState) {
      const holdings = closingState.buckets.reduce((sum, b) => sum + b.value, 0)
      if (holdings > 0) {
        const keep = Math.max(0, (holdings - fundedPensionTax) / holdings)
        closingState = {
          ...closingState,
          buckets: closingState.buckets.map(b => ({ ...b, value: b.value * keep })),
        }
      }
    }
    // The single portfolio sale funds the required withdrawal plus the pension
    // tax: surface the funded/unfunded split through the assessment's paid,
    // shortfall and chained-state totals so row conservation holds against one
    // authoritative outflow.
    const capitalAssessment = extraFunding === 0 ? result : {
      ...result,
      paidWithdrawal,
      unfundedWithdrawal: result.unfundedWithdrawal + pensionUnfunded,
      closingState,
    }
    return { capitalAssessment, insurance: income?.insurance,
      yearIndex: index, ageStart: age, ageEnd: age + 1, phase: accumulation ? 'accumulation' : 'retirement', inflationFactor,
      nominalReturnRate: result.openingCapital ? result.investmentReturn / result.openingCapital : rates.reduce((s, r) => s + r.totalReturnRate * weights[buckets.findIndex(b => b.id === r.id)], 0),
      openingCapital: result.openingCapital, investmentReturn: result.investmentReturn, capitalBeforeCashflow: result.openingCapital + result.investmentReturn,
      contribution, desiredSpending, retirementIncome: retirementIncomeNet, retirementIncomeGross: income?.gross ?? 0,
      retirementIncomeDeductions: income?.deductions ?? 0, retirementIncomeOtherDeductions: income?.otherDeductions ?? 0,
      healthInsurance: income?.kv ?? 0, careInsurance: income?.pv ?? 0, portfolioContributionBase: income?.portfolioBase ?? 0,
      retirementIncomeNet, surplusIncome: Math.max(0, retirementIncomeNet - desiredSpending),
      gapWithdrawal, gapWithdrawalToday: gapWithdrawal / inflationFactor,
      ...(!accumulation ? { pensionIncomeTax, pensionTaxBase } : {}),
      ...(result.withdrawalTax ? {
        capitalIncomeTax: result.withdrawalTax.capitalIncomeTax,
        taxableWithdrawal: result.withdrawalTax.taxableWithdrawal,
        sparerpauschbetragApplied: result.withdrawalTax.sparerpauschbetragApplied,
        // Tax (and insurance) funded first; the gap receives the remainder.
        // In accumulation years the gap is zero, so this equals the funded remainder (usually zero).
        netGapWithdrawal: Math.max(0, paidWithdrawal - result.insurance.kv - result.insurance.pv - result.withdrawalTax.capitalIncomeTax - fundedPensionTax),
      } : {}),
      closingCapital, closingCapitalToday: closingCapital / factor(index + 1),
      depleted: estimatorShortfall || pensionUnfunded > 0, unfundedWithdrawal: capitalAssessment.unfundedWithdrawal }
  }
  let state = initial
  const accumulationRows: YearlyPeriodRow[] = []
  for (let index = 0; index < scenario.yearsToRetirement; index++) {
    const row = year(state, index)
    accumulationRows.push(row)
    state = row.capitalAssessment!.closingState!
  }
  const retirementState = state
  const projectedCapital = state.buckets.reduce((s, b) => s + b.value, 0)
  const retirement = (opening: EstimatorState, stopOnShortfall = false) => {
    let current = opening
    const rows: YearlyPeriodRow[] = []
    for (let index = scenario.yearsToRetirement; index < scenario.yearsToRetirement + scenario.retirementYears; index++) {
      const row = year(current, index)
      rows.push(row)
      if (stopOnShortfall && row.depleted) break
      current = row.capitalAssessment!.closingState!
    }
    return rows
  }
  const retirementRows = retirement(retirementState)
  // Hypothetical starting portfolios preserve the projected per-euro cost/VP history.
  // This is a search assumption, never an accounting movement on the actual ledger.
  const candidate = (capital: number): EstimatorState => {
    if (projectedCapital === 0) return { ...initial, buckets: initial.buckets.map((b, n) => ({ ...b, value: capital * weights[n] })), fundAcquisitionCost: capital * buckets.reduce((s, b, n) => s + (b.holding === 'accumulating-equity-fund' ? weights[n] : 0), 0) }
    const scale = capital / projectedCapital
    return { ...retirementState, buckets: retirementState.buckets.map(b => ({ ...b, value: b.value * scale })), fundAcquisitionCost: retirementState.fundAcquisitionCost * scale,
      assessedVorabpauschalen: retirementState.assessedVorabpauschalen * scale, pendingVorabpauschale: retirementState.pendingVorabpauschale * scale, simulatedLossCarryforward: retirementState.simulatedLossCarryforward * scale }
  }
  const requiredCapital = () => {
    const survives = (capital: number) => !retirement(candidate(capital), true).some(r => r.depleted)
    let high = Math.max(1, projectedCapital), low = 0
    if (survives(0)) high = 0
    else {
      while (!survives(high)) {
        high *= 2
        if (high > 1e12) throw new Error('Erforderliches Kapital: keine tragfähige Obergrenze gefunden.')
      }
      while (high - low > 1) {
        const mid = (low + high) / 2
        if (survives(mid)) high = mid
        else low = mid
      }
    }
    return high
  }
  return { rows: [...accumulationRows, ...retirementRows], accumulationRows, retirementRows, projectedCapital, requiredCapital }
}

export function simulateCapitalLedger(scenario: NormalizedScenario, path?: BucketReturnPath, inflation?: AnnualInflationResolver): SimulationResult {
  const ledger = buildCapitalLedger(scenario, path, inflation)
  return { rows: ledger.rows, accumulationRows: ledger.accumulationRows, retirementRows: ledger.retirementRows,
    summary: deriveSummary(ledger.projectedCapital, ledger.requiredCapital(), ledger.retirementRows) }
}

/** Bootstrap percentiles need actual cashflows/survival, not a capital search for each trial. */
export function simulateCapitalLedgerPath(scenario: NormalizedScenario, path: BucketReturnPath, inflation: AnnualInflationResolver) {
  const ledger = buildCapitalLedger(scenario, path, inflation)
  return { rows: ledger.rows, summary: { survivesUntilPlanningAge: ledger.retirementRows.every(r => !r.depleted) } }
}
