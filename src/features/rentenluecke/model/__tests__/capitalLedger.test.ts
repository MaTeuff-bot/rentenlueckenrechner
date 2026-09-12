import { describe, expect, it } from 'vitest'
import { insuredInput, automaticInsurance } from './insuranceFixtures'
import { simulateScenario } from '../simulateScenario'
import { simulateScenarioWithReturnPath } from '../stochasticReturns'
import { insuranceSetupIssues } from '../retirementInsurance'
import { createPortfolioComponentsFromBuckets } from '../portfolioBuckets'
import { simulateHistoricalBootstrapScenario, simulateHistoricalBootstrapReferenceScenario, runHistoricalBootstrapSimulation } from '../historicalReturns'
import { SYNTHETIC_RETURN_SERIES_IDS } from '../historicalReturns/constants'
import { createEstimatorState, simulateEstimatorYear } from '../capitalIncome/insuranceEstimator'
import type { RentenlueckeInput } from '../types'
import { simulateCapitalLedgerPath } from '../capitalIncome/ledger'
import { normalizeInput } from '../normalizeInput'

export function estimatorInput(): RentenlueckeInput {
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
const path = (input: RentenlueckeInput, fund = .1, bank = .02, gross = bank) => Array.from({ length: input.planningAge - input.currentAge }, () => [
  { id: 'fund', totalReturnRate: fund }, { id: 'bank', totalReturnRate: bank, grossBankReturnRate: gross },
])
describe('integrated capital assessment ledger', () => {
  it('marks an undefined zero-capital allocation incomplete across public simulation paths', () => {
    const input = estimatorInput()
    input.currentCapital = 0
    input.estimatorPortfolio!.forEach(b => { b.value = 0 })
    expect(insuranceSetupIssues(input).join()).toContain('positive Ausgangsallokation')
    expect(() => simulateScenario(input)).toThrow(/positive Ausgangsallokation/)
    expect(() => simulateScenarioWithReturnPath(input, [], undefined, path(input))).toThrow(/positive Ausgangsallokation/)
    input.retirementInsurance!.bridge.capitalMode = 'manual'
    input.retirementInsurance!.bridge.capitalMonthlyToday = 0
    expect(insuranceSetupIssues(input)).toEqual([])
    expect(simulateScenario(input).rows[0].openingCapital).toBe(0)
  })
  it('rejects partial or ambiguous bucket paths in both full and bootstrap ledgers', () => {
    const input = estimatorInput()
    for (const invalid of [path(input).slice(1), path(input).map(row => [...row, row[0]]), path(input).map(row => [row[0]])]) {
      expect(() => simulateScenarioWithReturnPath(input, [], undefined, invalid)).toThrow(/Renditepfad/)
      expect(() => simulateCapitalLedgerPath(normalizeInput(input), invalid, () => 0)).toThrow(/Renditepfad/)
    }
  })
  it('keeps retirement income surplus outside the portfolio in full and bootstrap ledgers', () => {
    const input = estimatorInput()
    input.currentAge = input.retirementAge = 67
    input.monthlyDesiredSpendingToday = 100
    input.retirementInsurance!.pension = { status: 'voluntary', circumstances: 'standard', capitalMode: 'automatic', drvSubsidy: 'not-received' }
    const full = simulateScenarioWithReturnPath(input, [], undefined, path(input))
    const sampled = simulateCapitalLedgerPath(normalizeInput(input), path(input), () => 0)
    expect(sampled.rows).toEqual(full.rows)
    expect(full.summary.requiredCapitalAtRetirement).toBe(0)
    for (const row of full.rows) {
      expect(row.surplusIncome).toBeGreaterThan(0)
      expect(row.contribution).toBe(0)
      expect(row.capitalAssessment!.paidWithdrawal).toBe(0)
      expect(row.closingCapital).toBeCloseTo(row.openingCapital + row.investmentReturn)
    }
  })
  it('retains worthless fund costs without disposal and searches fresh capital after accumulation loss', () => {
    const input = estimatorInput()
    input.estimatorPortfolio = [{ ...input.estimatorPortfolio![0], value: input.currentCapital }]
    input.monthlyContributionToday = 0
    const returns = Array.from({ length: 5 }, (_, i) => [{ id: 'fund', totalReturnRate: i === 0 ? -1 : 0 }])
    const result = simulateScenarioWithReturnPath(input, [], undefined, returns)
    expect(result.rows[0].closingCapital).toBe(0)
    expect(result.rows[0].capitalAssessment!.closingState!.fundAcquisitionCost).toBe(30000)
    expect(result.rows[0].capitalAssessment!.closingState!.simulatedLossCarryforward).toBe(0)
    expect(result.retirementRows[0].unfundedWithdrawal).toBeGreaterThan(0)
    expect(result.summary.requiredCapitalAtRetirement).toBeGreaterThan(0)
    expect(simulateCapitalLedgerPath(normalizeInput(input), returns, () => 0).rows).toEqual(result.rows)
  })
  it('rejects allocation purchases at zero NAV explicitly without mutating the input', () => {
    const input = estimatorInput()
    input.monthlyContributionToday = 0
    const snapshot = structuredClone(input)
    expect(() => simulateScenarioWithReturnPath(input, [], undefined, path(input, -1, 0))).toThrow(/Allokationskauf/)
    expect(input).toEqual(snapshot)
  })
  it('blocks incomplete setup in reference and combined bootstrap forecasts', () => {
    const input = estimatorInput()
    input.retirementInsurance!.capitalEstimator!.fundAcquisitionCost = undefined
    const settings = { portfolioComponents: createPortfolioComponentsFromBuckets(input.estimatorPortfolio!), inflationSourceId: 'fixed-manual', simulations: 2 }
    expect(() => simulateHistoricalBootstrapReferenceScenario(input, settings)).toThrow(/Anschaffungskosten/)
    expect(() => runHistoricalBootstrapSimulation(input, settings)).toThrow(/Anschaffungskosten/)
  })
  it('requires explicit classification and fund costs, accepts zero, retains independent manual choices', () => {
    const input = estimatorInput()
    expect(insuranceSetupIssues(input)).toEqual([])
    input.retirementInsurance!.capitalEstimator!.fundAcquisitionCost = undefined
    expect(insuranceSetupIssues(input).join()).toContain('Anschaffungskosten')
    input.retirementInsurance!.capitalEstimator!.fundAcquisitionCost = 0
    expect(insuranceSetupIssues(input)).toEqual([])
    input.estimatorPortfolio![0].holding = 'unsupported'
    expect(insuranceSetupIssues(input).join()).toContain('entfernen/ersetzen')
    input.retirementInsurance!.bridge.capitalMode = 'manual'
    input.retirementInsurance!.bridge.capitalMonthlyToday = 10
    expect(insuranceSetupIssues(input)).toEqual([])
    expect(input.estimatorPortfolio![0].holding).toBe('unsupported')
  })
  it('preserves returns, savings, cash conservation, VP history and KVdR boundaries', () => {
    const input = estimatorInput()
    const r = simulateScenarioWithReturnPath(input, Array(5).fill(.068), undefined, path(input))
    expect(r.rows[0].investmentReturn).toBeCloseTo(6800)
    expect(r.rows[0].closingCapital).toBeCloseTo(108000)
    expect(r.rows[0].capitalAssessment!.movement.fundSales).toBeCloseTo(1920)
    expect(r.rows[0].capitalAssessment!.movement.costReleased).toBeCloseTo(1920 / 66000 * 30000)
    expect(r.rows[1].capitalAssessment!.receivedVorabpauschale).toBeGreaterThan(0)
    for (const row of r.rows) {
      expect(row.closingCapital).toBeCloseTo(row.openingCapital + row.investmentReturn + row.contribution - row.capitalAssessment!.paidWithdrawal, 5)
      if (row.phase === 'retirement') {
        expect(row.gapWithdrawal).toBeCloseTo(Math.max(0, row.desiredSpending - row.retirementIncomeNet), 5)
        expect(row.retirementIncomeNet).toBeCloseTo(row.retirementIncomeGross - row.retirementIncomeOtherDeductions - row.healthInsurance - row.careInsurance)
      }
      if (row.ageStart >= 67) expect(row.portfolioContributionBase).toBe(0)
    }
  })
  it('assesses gross positive bank interest despite negative cost-net return; rejects negative gross paths', () => {
    const input = estimatorInput()
    const result = simulateScenarioWithReturnPath(input, [], undefined, path(input, -.1, -.03, .02))
    expect(result.rows[0].capitalAssessment!.bankInterest).toBeCloseTo(800)
    expect(result.rows[0].investmentReturn).toBeCloseTo(-7200)
    expect(() => simulateScenarioWithReturnPath(input, [], undefined, path(input, .1, -.01, -.01))).toThrow()
    input.estimatorPortfolio![1].returnSeriesId = SYNTHETIC_RETURN_SERIES_IDS.equity
    expect(insuranceSetupIssues(input).join()).toContain('Brutto-Zinsquelle')
  })
  it('keeps nominal Basiszins independent of inflation and recomputes annual VP', () => {
    const input = estimatorInput()
    const zero = simulateScenarioWithReturnPath(input, [], Array(5).fill(0), path(input))
    const inflated = simulateScenarioWithReturnPath(input, [], Array(5).fill(.1), path(input))
    expect(inflated.rows[0].capitalAssessment!.pendingVorabpauschale).toBeCloseTo(zero.rows[0].capitalAssessment!.pendingVorabpauschale)
    expect(inflated.rows[1].capitalAssessment!.assessment.expenseAllowance).toBeCloseTo(56.1)
    expect(zero.rows[1].capitalAssessment!.pendingVorabpauschale).not.toBe(zero.rows[0].capitalAssessment!.pendingVorabpauschale)
  })
  it('uses manual pension assessment alongside automatic bridge without extra spendable income', () => {
    const input = estimatorInput()
    input.retirementInsurance!.pension = { status: 'unknown', circumstances: 'standard', capitalMode: 'manual', capitalMonthlyToday: 500, drvSubsidy: 'not-received' }
    const r = simulateScenarioWithReturnPath(input, [], undefined, path(input))
    expect(r.rows.find(r => r.ageStart === 67)!.portfolioContributionBase).toBe(6000)
    expect(r.rows.find(r => r.ageStart === 67)!.retirementIncomeGross).toBe(24000)
    expect(r.rows.find(r => r.ageStart === 65)!.portfolioContributionBase).toBe(r.rows[1].capitalAssessment!.assessment.annualAssessment)
  })
  it('shares deterministic/reference paths and returns reproducible bootstrap results', () => {
    const input = estimatorInput()
    // Fund-only stochastic fixture avoids unsupported negative bank-interest draws.
    input.estimatorPortfolio = [input.estimatorPortfolio![0]]
    input.estimatorPortfolio[0].value = input.currentCapital
    const settings = { portfolioComponents: createPortfolioComponentsFromBuckets(input.estimatorPortfolio), inflationSourceId: 'fixed-manual', simulations: 3 }
    const deterministic = simulateScenario(input)
    expect(simulateHistoricalBootstrapReferenceScenario(input, settings).rows).toEqual(deterministic.rows)
    expect(simulateHistoricalBootstrapScenario(input, settings)).toEqual(simulateHistoricalBootstrapScenario(input, settings))
    expect(runHistoricalBootstrapSimulation(input, settings)).toEqual(runHistoricalBootstrapSimulation(input, settings))
  }, 30000)
  it('searches required capital with the same cost ratio and funding calculation', () => {
    const input = estimatorInput()
    input.currentAge = input.retirementAge = 67
    input.planningAge = 69
    input.retirementInsurance!.pension = { status: 'voluntary', circumstances: 'standard', capitalMode: 'automatic', drvSubsidy: 'not-received' }
    const result = simulateScenario(input)
    const required = result.summary.requiredCapitalAtRetirement
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
  it('keeps bank-only gross interest separate from costs and ignores retained hidden fund setup', () => {
    const input = estimatorInput()
    input.estimatorPortfolio = [{ ...input.estimatorPortfolio![1], value: 100000, annualCostRate: .05 }]
    const result = simulateScenario(input)
    expect(result.rows[0].investmentReturn).toBeCloseTo(-3000)
    expect(result.rows[0].capitalAssessment!.bankInterest).toBeCloseTo(2000)
    expect(result.rows[0].capitalAssessment!.closingState!.fundAcquisitionCost).toBe(0)
    expect(input.retirementInsurance!.capitalEstimator!.fundAcquisitionCost).toBe(30000)
  })
  it('rejects inconsistent opening capital rather than silently replacing it', () => {
    const input = estimatorInput()
    input.currentCapital = 200000
    expect(() => simulateScenario(input)).toThrow(/übereinstimmen/)
  })
  it('reports asset shortfall including insurance-funding gains', () => {
    const input = estimatorInput()
    input.monthlyDesiredSpendingToday = 100000
    const result = simulateScenario(input)
    expect(result.retirementRows[0].unfundedWithdrawal).toBeGreaterThan(0)
    expect(result.retirementRows[0].capitalAssessment!.status).toBe('shortfall')
  })
  it('accounts for bank-to-fund purchases and separate assessed/pending VP without inventing income', () => {
    const state = createEstimatorState({ buckets: [
      { id: 'f', value: 100, eligibility: 'accumulating-equity-fund' }, { id: 'b', value: 100, eligibility: 'ordinary-bank-deposit' },
    ], fundAcquisitionCost: 80, scope: 'single-person-domestic-private-post-2017-no-special-events', lossHistory: 'confirmed-none-and-no-external-offsets' })
    const r = simulateEstimatorYear(state, { projectedBasisRate: .032, spendingLessOtherIncome: 0, buckets: [
      { id: 'f', totalReturnRate: -.2, contribution: 10, targetWeight: .5 }, { id: 'b', totalReturnRate: 0, contribution: 10, targetWeight: .5 },
    ] }, () => ({ kv: 0, pv: 0 }))
    expect(r.movement.fundPurchases).toBe(10)
    expect(r.movement.adjustedFundSaleGain).toBe(0)
    expect(r.closingState!.fundAcquisitionCost).toBe(100)
    expect(r.closingState!.pendingVorabpauschale).toBe(0)
    expect(r.closingCapital).toBe(200)
  })
  it('recognizes fund-to-fund allocation sales while preserving pooled cost and separate VP balances', () => {
    const opening = { ...createEstimatorState({ buckets: [
      { id: 'up', value: 100, eligibility: 'accumulating-equity-fund' },
      { id: 'down', value: 100, eligibility: 'accumulating-equity-fund' },
    ], fundAcquisitionCost: 160, scope: 'single-person-domestic-private-post-2017-no-special-events', lossHistory: 'confirmed-none-and-no-external-offsets' }),
    assessedVorabpauschalen: 20, pendingVorabpauschale: 10 }
    const result = simulateEstimatorYear(opening, { projectedBasisRate: .032, expenseAllowance: 0, spendingLessOtherIncome: 0,
      buckets: [{ id: 'up', totalReturnRate: .2, contribution: 0, targetWeight: .5 },
        { id: 'down', totalReturnRate: -.2, contribution: 0, targetWeight: .5 }],
    }, () => ({ kv: 0, pv: 0 }))
    expect(result.movement.fundSales).toBeCloseTo(20)
    expect(result.movement.fundPurchases).toBeCloseTo(20)
    expect(result.movement.costReleased).toBeCloseTo(16)
    expect(result.movement.adjustmentReleased).toBeCloseTo(3)
    expect(result.assessment.annualAssessment).toBeCloseTo(7.7)
    expect(result.closingState!.fundAcquisitionCost).toBeCloseTo(164)
    expect(result.closingState!.assessedVorabpauschalen).toBeCloseTo(27)
    expect(result.pendingVorabpauschale).toBeCloseTo(2.24 * 100 / 120)
    expect(result.closingCapital).toBeCloseTo(200)
    expect(opening.assessedVorabpauschalen).toBe(20)
  })
})
