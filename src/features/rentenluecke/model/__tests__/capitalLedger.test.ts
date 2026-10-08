import { describe, expect, it } from 'vitest'
import { insuredInput, automaticInsurance } from './insuranceFixtures'
import { simulateScenario } from '../simulateScenario'
import { simulateScenarioWithReturnPath } from '../stochasticReturns'
import { insuranceSetupIssues } from '../retirementInsurance'
import { createPortfolioComponentsFromBuckets } from '../portfolioBuckets'
import { simulateHistoricalBootstrapScenario, simulateHistoricalBootstrapReferenceScenario, runHistoricalBootstrapSimulation } from '../historicalReturns'
import { PLANNING_RATE_SOURCE_ID, SYNTHETIC_RETURN_SERIES_IDS } from '../historicalReturns/constants'
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
      { id: 'bank', name: 'Bank', value: 40000, holding: 'ordinary-bank-deposit', returnSeriesId: PLANNING_RATE_SOURCE_ID },
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
    expect(() => simulateScenario(input, 0.02)).toThrow(/positive Ausgangsallokation/)
    expect(() => simulateScenarioWithReturnPath(input, [], undefined, path(input))).toThrow(/positive Ausgangsallokation/)
    // Mandatory: legacy manual capital fields never bypass portfolio eligibility.
    input.retirementInsurance!.bridge = { ...input.retirementInsurance!.bridge, capitalMode: 'manual' as never, capitalMonthlyToday: 0 as never }
    expect(insuranceSetupIssues(input).join()).toContain('positive Ausgangsallokation')
    expect(() => simulateScenario(input, 0.02)).toThrow(/positive Ausgangsallokation/)
  })
  it('rejects partial or ambiguous bucket paths in both full and bootstrap ledgers', () => {
    const input = estimatorInput()
    for (const invalid of [path(input).slice(1), path(input).map(row => [...row, row[0]]), path(input).map(row => [row[0]])]) {
      expect(() => simulateScenarioWithReturnPath(input, [], undefined, invalid)).toThrow(/Renditepfad/)
      expect(() => simulateCapitalLedgerPath(normalizeInput(input), invalid, () => 0)).toThrow(/Renditepfad/)
    }
  })
  it('reinvests retirement income surplus year-end in full and bootstrap ledgers', () => {
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
      expect(row.surplusReinvested).toBeCloseTo(row.surplusIncome, 8)
      expect(row.contribution).toBe(0)
      expect(row.capitalAssessment!.paidWithdrawal).toBe(0)
      expect(row.capitalAssessment!.requiredWithdrawal).toBe(0)
      // Corrected after-all-charges surplus: income pays the trial capital tax, no second debit.
      expect(row.surplusIncome).toBeCloseTo(Math.max(0, row.retirementIncomeNet - row.desiredSpending - (row.capitalIncomeTax ?? 0)), 8)
      expect(row.closingCapital).toBeCloseTo(row.openingCapital + row.investmentReturn + (row.surplusReinvested ?? 0), 6)
      // No overshoot beyond the pre-tax margin.
      expect(row.surplusIncome).toBeLessThanOrEqual(Math.max(0, row.retirementIncomeNet - row.desiredSpending) + 1e-9)
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
    const settings = { portfolioComponents: createPortfolioComponentsFromBuckets(input.estimatorPortfolio!), inflationSourceId: 'fixed-manual', simulations: 2, cashPlanningRate: 0.02 }
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
    // Mandatory: legacy manual capital fields never bypass portfolio eligibility.
    input.retirementInsurance!.bridge = { ...input.retirementInsurance!.bridge, capitalMode: 'manual' as never, capitalMonthlyToday: 10 as never }
    expect(insuranceSetupIssues(input).join()).toContain('entfernen/ersetzen')
    expect(input.estimatorPortfolio![0].holding).toBe('unsupported')
  })
  it('preserves returns, savings, cash conservation, VP history and KVdR boundaries', () => {
    const input = estimatorInput()
    const r = simulateScenarioWithReturnPath(input, Array(5).fill(.068), undefined, path(input))
    expect(r.rows[0].investmentReturn).toBeCloseTo(6800)
    // The accumulation year funds the interest-inclusive Umschichtung tax from the
    // portfolio: 800 bank interest joins the exempted rebalancing gain, so the paid
    // sale (tax 149.645) leaves closing below the pre-tax 108,000 (tier-3 pins).
    expect(r.rows[0].capitalAssessment!.bankInterest).toBeCloseTo(800)
    expect(r.rows[0].capitalIncomeTax).toBeCloseTo(149.6446661216122)
    expect(r.rows[0].taxableWithdrawal).toBeCloseTo(1567.3731416933165)
    expect(r.rows[0].closingCapital).toBeCloseTo(107850.35533387838)
    expect(r.rows[0].capitalAssessment!.movement.fundSales).toBeCloseTo(1917.3097588113014)
    expect(r.rows[0].capitalAssessment!.movement.costReleased).toBeCloseTo(871.504435823319)
    expect(r.rows[1].capitalAssessment!.receivedVorabpauschale).toBeGreaterThan(0)
    for (const row of r.rows) {
      expect(row.closingCapital).toBeCloseTo(row.openingCapital + row.investmentReturn + row.contribution - row.capitalAssessment!.paidWithdrawal + (row.surplusReinvested ?? 0), 5)
      if (row.phase === 'retirement') {
        // Slice-1 funding rule: the required withdrawal funds the net spending gap
        // plus Kapitalertragsteuer, so it exceeds desired-minus-net by exactly the tax.
        // (Slice 2 holds automatically: the net is already reduced by the pension tax.)
        expect(row.gapWithdrawal).toBeCloseTo(Math.max(0, row.desiredSpending - row.retirementIncomeNet + (row.capitalIncomeTax ?? 0)), 5)
        expect(row.retirementIncomeNet).toBeCloseTo(row.retirementIncomeGross - row.retirementIncomeOtherDeductions - row.healthInsurance - row.careInsurance - (row.pensionIncomeTax ?? 0))
        // The single paid withdrawal covers gap, insurance and both taxes; the gap receives the remainder.
        const insurance = row.capitalAssessment!.insurance.kv + row.capitalAssessment!.insurance.pv
        expect((row.netGapWithdrawal ?? 0) + insurance + (row.capitalIncomeTax ?? 0) + (row.pensionIncomeTax ?? 0)).toBeCloseTo(row.capitalAssessment!.paidWithdrawal, 5)
        expect(row.capitalIncomeTax ?? 0).toBeGreaterThan(0)
      } else {
        // Slice 1b: accumulation rows carry the same tax fields (Umschichtung);
        // the paid sale funds tax only (gap is zero).
        expect(row.capitalIncomeTax).toBeDefined()
        expect(row.taxableWithdrawal).toBeDefined()
        expect(row.sparerpauschbetragApplied).toBeDefined()
        expect(row.capitalAssessment!.paidWithdrawal).toBeCloseTo((row.capitalIncomeTax ?? 0) + row.unfundedWithdrawal, 5)
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
    expect(insuranceSetupIssues(input).join()).toContain('Tagesgeld-Planungszinsquelle')
  })
  it('keeps nominal Basiszins independent of inflation and recomputes annual VP', () => {
    const input = estimatorInput()
    const zero = simulateScenarioWithReturnPath(input, [], Array(5).fill(0), path(input))
    const inflated = simulateScenarioWithReturnPath(input, [], Array(5).fill(.1), path(input))
    expect(inflated.rows[0].capitalAssessment!.pendingVorabpauschale).toBeCloseTo(zero.rows[0].capitalAssessment!.pendingVorabpauschale)
    expect(inflated.rows[1].capitalAssessment!.assessment.expenseAllowance).toBeCloseTo(56.1)
    expect(zero.rows[1].capitalAssessment!.pendingVorabpauschale).not.toBe(zero.rows[0].capitalAssessment!.pendingVorabpauschale)
  })
  it('uses whole-phase manual totals alongside automatic bridge without extra spendable income', () => {
    const input = estimatorInput()
    // Whole-phase manual totals replace only insurance; portfolioBase stays 0 for manual, assessment for automatic.
    input.retirementInsurance!.pension = { status: 'unknown', circumstances: 'standard', manual: true, kvMonthlyToday: 80, pvMonthlyToday: 20, drvSubsidy: 'not-received' } as never
    const r = simulateScenarioWithReturnPath(input, [], undefined, path(input))
    expect(r.rows.find(r => r.ageStart === 67)!.portfolioContributionBase).toBe(0)
    expect(r.rows.find(r => r.ageStart === 67)!.retirementIncomeGross).toBe(24000)
    expect(r.rows.find(r => r.ageStart === 67)!.healthInsurance).toBeCloseTo(80 * 12 * r.rows.find(r => r.ageStart === 67)!.inflationFactor, 8)
    expect(r.rows.find(r => r.ageStart === 67)!.careInsurance).toBeCloseTo(20 * 12 * r.rows.find(r => r.ageStart === 67)!.inflationFactor, 8)
    expect(r.rows.find(r => r.ageStart === 65)!.portfolioContributionBase).toBe(r.rows[1].capitalAssessment!.assessment.annualAssessment)
    // Manual totals add no cash and no double deduction: gross unchanged, insurance deducted once.
    for (const row of r.retirementRows) {
      expect(row.retirementIncomeNet).toBeCloseTo(row.retirementIncomeGross - row.retirementIncomeOtherDeductions - row.healthInsurance - row.careInsurance - (row.pensionIncomeTax ?? 0), 8)
    }
  })
  it('shares deterministic/reference paths and returns reproducible bootstrap results', () => {
    const input = estimatorInput()
    // Fund-only stochastic fixture avoids unsupported negative bank-interest draws.
    input.estimatorPortfolio = [input.estimatorPortfolio![0]]
    input.estimatorPortfolio[0].value = input.currentCapital
    const settings = { portfolioComponents: createPortfolioComponentsFromBuckets(input.estimatorPortfolio), inflationSourceId: 'fixed-manual', simulations: 3 }
    const deterministic = simulateScenario(input, 0.02)
    expect(simulateHistoricalBootstrapReferenceScenario(input, settings).rows).toEqual(deterministic.rows)
    expect(simulateHistoricalBootstrapScenario(input, settings)).toEqual(simulateHistoricalBootstrapScenario(input, settings))
    expect(runHistoricalBootstrapSimulation(input, settings)).toEqual(runHistoricalBootstrapSimulation(input, settings))
  }, 30000)
  it('searches required capital with the same cost ratio and funding calculation', () => {
    const input = estimatorInput()
    input.currentAge = input.retirementAge = 67
    input.planningAge = 69
    input.retirementInsurance!.pension = { status: 'voluntary', circumstances: 'standard', capitalMode: 'automatic', drvSubsidy: 'not-received' }
    const result = simulateScenarioWithReturnPath(input, [], undefined, path(input))
    const required = result.summary.requiredCapitalAtRetirement
    const scaled = structuredClone(input)
    scaled.currentCapital = required
    scaled.estimatorPortfolio!.forEach(b => { b.value *= required / input.currentCapital })
    scaled.retirementInsurance!.capitalEstimator!.fundAcquisitionCost! *= required / input.currentCapital
    expect(simulateScenarioWithReturnPath(scaled, [], undefined, path(scaled)).summary.survivesUntilPlanningAge).toBe(true)
    scaled.currentCapital = required - 2
    scaled.estimatorPortfolio!.forEach(b => { b.value *= (required - 2) / required })
    scaled.retirementInsurance!.capitalEstimator!.fundAcquisitionCost! *= (required - 2) / required
    expect(simulateScenarioWithReturnPath(scaled, [], undefined, path(scaled)).summary.survivesUntilPlanningAge).toBe(false)
  })
  it('keeps bank-only gross interest separate from costs and ignores retained hidden fund setup', () => {
    const input = estimatorInput()
    input.estimatorPortfolio = [{ ...input.estimatorPortfolio![1], value: 100000, annualCostRate: .05 }]
    const bankPath = Array.from({ length: input.planningAge - input.currentAge }, () => [
      { id: input.estimatorPortfolio![0].id, totalReturnRate: -0.03, grossBankReturnRate: 0.02 },
    ])
    const result = simulateScenarioWithReturnPath(input, [], undefined, bankPath)
    expect(result.rows[0].investmentReturn).toBeCloseTo(-3000)
    expect(result.rows[0].capitalAssessment!.bankInterest).toBeCloseTo(2000)
    expect(result.rows[0].capitalAssessment!.closingState!.fundAcquisitionCost).toBe(0)
    expect(input.retirementInsurance!.capitalEstimator!.fundAcquisitionCost).toBe(30000)
  })
  it('rejects inconsistent opening capital rather than silently replacing it', () => {
    const input = estimatorInput()
    input.currentCapital = 200000
    expect(() => simulateScenario(input, 0.02)).toThrow(/übereinstimmen/)
  })
  it('reports asset shortfall including insurance-funding gains', () => {
    const input = estimatorInput()
    input.monthlyDesiredSpendingToday = 100000
    const result = simulateScenarioWithReturnPath(input, [], undefined, path(input))
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