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
    expect(full.summary.survivesUntilPlanningAge).toBe(true)
    expect(full.retirementRows.every((row) => !row.depleted)).toBe(true)
    expect(full.retirementRows.every((row) => row.unfundedWithdrawal === 0)).toBe(true)
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
  it('retains worthless fund costs without disposal and funds fresh capital after accumulation loss', () => {
    const input = estimatorInput()
    input.estimatorPortfolio = [{ ...input.estimatorPortfolio![0], value: input.currentCapital }]
    input.monthlyContributionToday = 0
    const returns = Array.from({ length: 5 }, (_, i) => [{ id: 'fund', totalReturnRate: i === 0 ? -1 : 0 }])
    const result = simulateScenarioWithReturnPath(input, [], undefined, returns)
    expect(result.rows[0].closingCapital).toBe(0)
    expect(result.rows[0].capitalAssessment!.closingState!.fundAcquisitionCost).toBe(30000)
    expect(result.rows[0].capitalAssessment!.closingState!.simulatedLossCarryforward).toBe(0)
    expect(result.retirementRows[0].unfundedWithdrawal).toBeGreaterThan(0)
    expect(result.summary.survivesUntilPlanningAge).toBe(false)
    expect(result.summary.depletionAge).not.toBeNull()
    expect(result.retirementRows.every((row) => row.closingCapital >= 0)).toBe(true)
    expect(simulateCapitalLedgerPath(normalizeInput(input), returns, () => 0).rows).toEqual(result.rows)
  })
  it('rejects allocation purchases at zero NAV explicitly without mutating the input', () => {
    // A -100% fund year kills the fund in accumulation; the accepted event then
    // tries to buy the dead fund at zero NAV in the first retirement year and
    // must throw instead of inventing units. Drift alone never purchases.
    const input = estimatorInput()
    input.monthlyContributionToday = 0
    input.allocationAtRetirement = { enabled: true, accepted: true, fixedTargets: [],
      remainderWeights: { fund: 0.5, bank: 0.5 } }
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
    // Drift realizes no rebalancing gain: the 800 bank interest stays below the
    // 1,000 allowance, so the accumulation year funds no tax and sells nothing;
    // closing is the full 106,800 + 1,200 starting-share contribution = 108,000.
    // Taxable = 0 x 0.7 + 800 interest; allowance applied 800; tax 0. The
    // retained old-holding VP (min(60,000 x 0.7 x 0.032, 6,000) = 1,344) plus the
    // December VP on the 720 starting-share fund contribution
    // (min(720/1.1 x 0.7 x 0.032, 720 - 720/1.1)/12 = 1.2218) is received in year 2.
    expect(r.rows[0].capitalAssessment!.bankInterest).toBeCloseTo(800)
    expect(r.rows[0].capitalIncomeTax).toBe(0)
    expect(r.rows[0].taxableWithdrawal).toBeCloseTo(800)
    expect(r.rows[0].sparerpauschbetragApplied).toBeCloseTo(800)
    expect(r.rows[0].closingCapital).toBeCloseTo(108000)
    expect(r.rows[0].capitalAssessment!.movement.fundSales).toBeCloseTo(0)
    expect(r.rows[0].capitalAssessment!.movement.fundPurchases).toBeCloseTo(0)
    expect(r.rows[0].capitalAssessment!.movement.costReleased).toBeCloseTo(0)
    expect(r.rows[0].capitalAssessment!.pendingVorabpauschale).toBeCloseTo(1345.2218181818182, 8)
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
  it('keeps cost ratio and funding consistent in the forward ledger with exact-zero distinction', () => {
    const input = estimatorInput()
    input.currentAge = input.retirementAge = 67
    input.planningAge = 69
    input.retirementInsurance!.pension = { status: 'voluntary', circumstances: 'standard', capitalMode: 'automatic', drvSubsidy: 'not-received' }
    const result = simulateScenarioWithReturnPath(input, [], undefined, path(input))
    // Forward ledger only: cost ratio preserved, funding visible without a lifetime search.
    expect(Number.isFinite(result.summary.projectedCapitalAtRetirement)).toBe(true)
    expect(result.summary.survivesUntilPlanningAge).toBe(result.retirementRows.every((row) => !row.depleted))
    for (const row of result.retirementRows) {
      expect(row.closingCapital).toBeGreaterThanOrEqual(0)
      expect(row.closingCapital).toBeCloseTo(
        row.openingCapital + row.investmentReturn + row.contribution - row.capitalAssessment!.paidWithdrawal + (row.surplusReinvested ?? 0), 6)
    }
    // Exact-zero fully funded counts as survival, distinct from unfunded depletion.
    expect(result.retirementRows.every((row) => row.unfundedWithdrawal === 0)).toBe(result.summary.survivesUntilPlanningAge)
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
  it('drifts without annual trades: no rebalancing purchases, contributions keep starting shares', () => {
    // Hand-derived drift: opening f=100/b=100. Returns f -20% -> 80, b 0% -> 100
    // (H=180). Spending 0, no insurance/tax -> required 0, paid 0, deposit 0.
    // Drift targets stay 80/100: no fund sales, no purchases, no gain. Cost keeps
    // the pooled 80 plus the 10 starting-share fund contribution = 90. December
    // VP on the 10 contribution at r=-0.2 is max(0, min(...)) = 0 (loss path).
    // Closing 90/110 = 200 conserves H + contributions (20).
    const state = createEstimatorState({ buckets: [
      { id: 'f', value: 100, eligibility: 'accumulating-equity-fund' }, { id: 'b', value: 100, eligibility: 'ordinary-bank-deposit' },
    ], fundAcquisitionCost: 80, scope: 'single-person-domestic-private-post-2017-no-special-events', lossHistory: 'confirmed-none-and-no-external-offsets' })
    const r = simulateEstimatorYear(state, { projectedBasisRate: .032, spendingLessOtherIncome: 0, buckets: [
      { id: 'f', totalReturnRate: -.2, contribution: 10 }, { id: 'b', totalReturnRate: 0, contribution: 10 },
    ] }, () => ({ kv: 0, pv: 0 }))
    expect(r.status).toBe('converged')
    expect(r.movement.fundSales).toBe(0)
    expect(r.movement.fundPurchases).toBe(0)
    expect(r.movement.costReleased).toBe(0)
    expect(r.movement.adjustedFundSaleGain).toBe(0)
    expect(r.closingState!.fundAcquisitionCost).toBe(90)
    expect(r.closingState!.pendingVorabpauschale).toBe(0)
    expect(r.closingState!.buckets.find(b => b.id === 'f')!.value).toBe(90)
    expect(r.closingState!.buckets.find(b => b.id === 'b')!.value).toBe(110)
    expect(r.closingCapital).toBe(200)
  })
  it('event twin: a 50/50 allocation event rebalances the same year once (old-restoration pins)', () => {
    // Same fixture with a one-time 50/50 event: B = 180 -> targets 90/90, so the
    // fund buys 10 once (bank sale, untracked principal). Movement cost 80 + 10 =
    // 90, plus the 10 starting-share fund contribution -> 100. Closing 100/100 =
    // 200. This reproduces the pre-arbeitsende annual-restoration pins exactly,
    // now as an explicit one-time event instead of a yearly trade.
    const state = createEstimatorState({ buckets: [
      { id: 'f', value: 100, eligibility: 'accumulating-equity-fund' }, { id: 'b', value: 100, eligibility: 'ordinary-bank-deposit' },
    ], fundAcquisitionCost: 80, scope: 'single-person-domestic-private-post-2017-no-special-events', lossHistory: 'confirmed-none-and-no-external-offsets' })
    const r = simulateEstimatorYear(state, { projectedBasisRate: .032, spendingLessOtherIncome: 0,
      allocationEvent: { fixedTargets: [], remainderWeights: { f: 0.5, b: 0.5 }, inflationFactor: 1 },
      buckets: [
        { id: 'f', totalReturnRate: -.2, contribution: 10 }, { id: 'b', totalReturnRate: 0, contribution: 10 },
      ] }, () => ({ kv: 0, pv: 0 }))
    expect(r.status).toBe('converged')
    expect(r.movement.fundSales).toBe(0)
    expect(r.movement.fundPurchases).toBe(10)
    expect(r.movement.adjustedFundSaleGain).toBe(0)
    expect(r.closingState!.fundAcquisitionCost).toBe(100)
    expect(r.closingState!.pendingVorabpauschale).toBe(0)
    expect(r.closingCapital).toBe(200)
  })
  it('drifts fund-to-fund years with no sales while preserving pooled cost and VP balances', () => {
    // Hand-derived drift twin of the event test below: opening up=100/down=100,
    // cost 160, assessed 20, pending 10. Returns +20%/-20% -> 120/80 (H=200).
    // Spending 0 -> paid 0. Drift keeps 120/80: fundSales 0, costReleased 0,
    // adjustmentReleased 0. Received VP 10, no sale gain: annual assessment =
    // (10 + 0) * 0.7 - 0 expense = 7. Assessed closes 20 + 10 - 0 = 30. Kept
    // pending = up VP 2.24 (min(100*0.7*0.032, 20)) fully retained = 2.24.
    // Closing capital 200 conserves H (no contributions).
    const opening = { ...createEstimatorState({ buckets: [
      { id: 'up', value: 100, eligibility: 'accumulating-equity-fund' },
      { id: 'down', value: 100, eligibility: 'accumulating-equity-fund' },
    ], fundAcquisitionCost: 160, scope: 'single-person-domestic-private-post-2017-no-special-events', lossHistory: 'confirmed-none-and-no-external-offsets' }),
    assessedVorabpauschalen: 20, pendingVorabpauschale: 10 }
    const result = simulateEstimatorYear(opening, { projectedBasisRate: .032, expenseAllowance: 0, spendingLessOtherIncome: 0,
      buckets: [{ id: 'up', totalReturnRate: .2, contribution: 0 },
        { id: 'down', totalReturnRate: -.2, contribution: 0 }],
    }, () => ({ kv: 0, pv: 0 }))
    expect(result.status).toBe('converged')
    expect(result.movement.fundSales).toBeCloseTo(0)
    expect(result.movement.fundPurchases).toBeCloseTo(0)
    expect(result.movement.costReleased).toBeCloseTo(0)
    expect(result.movement.adjustmentReleased).toBeCloseTo(0)
    expect(result.assessment.annualAssessment).toBeCloseTo(7)
    expect(result.closingState!.fundAcquisitionCost).toBeCloseTo(160)
    expect(result.closingState!.assessedVorabpauschalen).toBeCloseTo(30)
    expect(result.pendingVorabpauschale).toBeCloseTo(2.24)
    expect(result.closingCapital).toBeCloseTo(200)
    expect(opening.assessedVorabpauschalen).toBe(20)
  })
  it('event twin: a 50/50 allocation event realizes the fund-to-fund sale once (old-restoration pins)', () => {
    // Same fixture with a one-time 50/50 event: B = 200 -> targets 100/100, so
    // up sells 20 and down buys 20 once. Fraction 20/200 = 0.1 releases cost 16
    // and adjustment 3 (assessed base 20 + received 10 = 30). Sale gain
    // 20 - 16 - 3 = 1; annual assessment (10 + 1) * 0.7 = 7.7. Assessed closes
    // 30 - 3 = 27. Kept pending 2.24 * 100/120 (retained-share VP) plus zero
    // December VP on the loss-path purchase. Cost closes 160 - 16 + 20 = 164,
    // capital 200. These are the pre-arbeitsende annual-restoration pins,
    // recomputed here as an explicit one-time event.
    const eventOpening = { ...createEstimatorState({ buckets: [
      { id: 'up', value: 100, eligibility: 'accumulating-equity-fund' },
      { id: 'down', value: 100, eligibility: 'accumulating-equity-fund' },
    ], fundAcquisitionCost: 160, scope: 'single-person-domestic-private-post-2017-no-special-events', lossHistory: 'confirmed-none-and-no-external-offsets' }),
    assessedVorabpauschalen: 20, pendingVorabpauschale: 10 }
    const eventResult = simulateEstimatorYear(eventOpening, { projectedBasisRate: .032, expenseAllowance: 0, spendingLessOtherIncome: 0,
      allocationEvent: { fixedTargets: [], remainderWeights: { up: 0.5, down: 0.5 }, inflationFactor: 1 },
      buckets: [{ id: 'up', totalReturnRate: .2, contribution: 0 },
        { id: 'down', totalReturnRate: -.2, contribution: 0 }],
    }, () => ({ kv: 0, pv: 0 }))
    expect(eventResult.movement.fundSales).toBeCloseTo(20)
    expect(eventResult.movement.fundPurchases).toBeCloseTo(20)
    expect(eventResult.movement.costReleased).toBeCloseTo(16)
    expect(eventResult.movement.adjustmentReleased).toBeCloseTo(3)
    expect(eventResult.assessment.annualAssessment).toBeCloseTo(7.7)
    expect(eventResult.closingState!.fundAcquisitionCost).toBeCloseTo(164)
    expect(eventResult.closingState!.assessedVorabpauschalen).toBeCloseTo(27)
    expect(eventResult.pendingVorabpauschale).toBeCloseTo(2.24 * 100 / 120)
    expect(eventResult.closingCapital).toBeCloseTo(200)
    expect(eventOpening.assessedVorabpauschalen).toBe(20)
  })
})