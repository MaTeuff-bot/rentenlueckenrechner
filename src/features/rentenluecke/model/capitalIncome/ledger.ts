import { createEstimatorState, simulateEstimatorYear, type EstimatorState } from './insuranceEstimator'
import { capitalMode } from './setup'
import { calculateRetirementIncomeForYear } from '../retirementIncomeStreams'
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
    const result = simulateEstimatorYear(state, {
      projectedBasisRate: setup.projectedBasisRate, expenseAllowance: 51 * inflationFactor,
      spendingLessOtherIncome: desiredSpending - (incomeBefore ? incomeBefore.gross - incomeBefore.otherDeductions : 0),
      buckets: buckets.map((b, n) => {
        const r = rates.find(r => r.id === b.id)
        if (!r && b.value > 0) throw new Error(`Fehlender Renditepfad: ${b.name}`)
        return { id: b.id, totalReturnRate: r?.totalReturnRate ?? 0, grossBankReturnRate: b.holding === 'ordinary-bank-deposit' ? r?.grossBankReturnRate : undefined, contribution: contribution * weights[n], targetWeight: weights[n] }
      }),
    }, assessment => accumulation ? { kv: 0, pv: 0 } : incomeFor(assessment))
    if (!result.closingState) throw new Error(`Kapitalbasis: numerischer Finanzierungsfehler im Alter ${age}; Restabweichung ${result.residual} €.`)
    const income = accumulation ? null : incomeFor(result.assessment.annualAssessment)
    const closingCapital = result.closingCapital
    const gapWithdrawal = result.requiredWithdrawal
    return { capitalAssessment: result, insurance: income?.insurance,
      yearIndex: index, ageStart: age, ageEnd: age + 1, phase: accumulation ? 'accumulation' : 'retirement', inflationFactor,
      nominalReturnRate: result.openingCapital ? result.investmentReturn / result.openingCapital : rates.reduce((s, r) => s + r.totalReturnRate * weights[buckets.findIndex(b => b.id === r.id)], 0),
      openingCapital: result.openingCapital, investmentReturn: result.investmentReturn, capitalBeforeCashflow: result.openingCapital + result.investmentReturn,
      contribution, desiredSpending, retirementIncome: income?.net ?? 0, retirementIncomeGross: income?.gross ?? 0,
      retirementIncomeDeductions: income?.deductions ?? 0, retirementIncomeOtherDeductions: income?.otherDeductions ?? 0,
      healthInsurance: income?.kv ?? 0, careInsurance: income?.pv ?? 0, portfolioContributionBase: income?.portfolioBase ?? 0,
      retirementIncomeNet: income?.net ?? 0, surplusIncome: Math.max(0, (income?.net ?? 0) - desiredSpending),
      gapWithdrawal, gapWithdrawalToday: gapWithdrawal / inflationFactor, closingCapital, closingCapitalToday: closingCapital / factor(index + 1),
      depleted: result.status === 'shortfall', unfundedWithdrawal: result.unfundedWithdrawal }
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
