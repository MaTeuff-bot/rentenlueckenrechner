import { describe, expect, it } from 'vitest'
import { applyCoverage, type InsuranceCoverageAnswers } from '../insuranceCoverage'
import { completedCoverage } from './insuranceFixtures'
import { timelineBoundary } from '../scenarioTimeline'
import { automaticInsurance, cashOnlyInput, insuredInput, pension, withFullCostBasis, zeroBucketPath } from './insuranceFixtures'
import { clearHiddenInvalidInsuranceValues } from '../retirementInsurance'
import { simulateScenario } from '../simulateScenario'
import { simulateScenarioWithReturnPath, runStochasticSimulation } from '../stochasticReturns'
import { runHistoricalBootstrapSimulation, simulateHistoricalBootstrapReferenceScenario, FIXED_INFLATION_SOURCE_ID, PLANNING_RATE_SOURCE_ID, SYNTHETIC_RETURN_SERIES_IDS } from '../historicalReturns'
import { createPortfolioComponentsFromBuckets } from '../portfolioBuckets'
import { needsDetailedPortfolio } from '../capitalIncome/setup'
import type { RentenlueckeInput, YearlyPeriodRow } from '../types'

/**
 * Reference-scenario suite (hardening PR2).
 *
 * Each scenario is a named, reusable input fixture covering one shipped user path.
 * Assertions are tier 1 (independently hand-computed figures, small exact cases),
 * tier 2 (universal conservation invariants) and tier 3 (labelled regression pins
 * for outputs with no feasible hand calculation).
 * Tolerances: invariants use strict relative closeness; hand-computed money uses
 * 1e-6 relative; regression pins use 1e-6 relative and their own label.
 */

const REL = 1e-6

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Assertion<T> {
    toBeMoneyClose(expected: number): void
  }
}

expect.extend({
  toBeMoneyClose(received: number, expected: number) {
    const pass = Math.abs(received - expected) <= Math.max(REL * Math.abs(expected), 1e-9)
    return { pass, message: () => `expected ${received} to be within ${REL} of ${expected}` }
  },
})

function prepare(input: RentenlueckeInput, coverage?: InsuranceCoverageAnswers): RentenlueckeInput {
  const base = { ...input, retirementInsurance: input.retirementInsurance ? applyCoverage(input.retirementInsurance, coverage ?? completedCoverage()) : undefined }
  return clearHiddenInvalidInsuranceValues({
    ...base,
    retirementInsurance: base.retirementInsurance
      ? { ...base.retirementInsurance, pensionAge: timelineBoundary(base.retirementIncomeStreams ?? []) }
      : undefined,
  })
}

function expectLedgerConservation(rows: YearlyPeriodRow[]) {
  for (const row of rows) {
    if (row.capitalAssessment) {
      // Ledger path: paid withdrawal is the authoritative outflow.
      expect(row.closingCapital).toBeMoneyClose(
        row.openingCapital + row.investmentReturn + row.contribution - row.capitalAssessment.paidWithdrawal + (row.surplusReinvested ?? 0))
    } else {
      // Scalar path: gap withdrawal plus funded Kapitalertragsteuer is the authoritative
      // outflow; contributions add. (Zero when no taxable gains exist.)
      expect(row.closingCapital).toBeMoneyClose(
        row.openingCapital + row.investmentReturn + row.contribution - row.gapWithdrawal - (row.capitalIncomeTax ?? 0) + row.unfundedWithdrawal)
    }
    if (row.phase === 'retirement' && !row.capitalAssessment) {
      expect(row.gapWithdrawal).toBeMoneyClose(Math.max(0, row.desiredSpending - row.retirementIncomeNet))
      // Slice-2 net identity: the GRV-Rentensteuer reduces the spendable net like
      // any other deduction (net = gross - other - KV/PV - pensionIncomeTax).
      expect(row.retirementIncomeNet).toBeMoneyClose(
        row.retirementIncomeGross - row.retirementIncomeOtherDeductions - row.healthInsurance - row.careInsurance - (row.pensionIncomeTax ?? 0))
    }
    // Insurance is deducted exactly once, never from the portfolio twice.
    if (row.phase === 'retirement') {
      expect(row.retirementIncomeDeductions).toBeMoneyClose(row.retirementIncomeOtherDeductions + row.healthInsurance + row.careInsurance)
    }
  }
  for (let index = 1; index < rows.length; index++) {
    expect(rows[index].openingCapital).toBeMoneyClose(rows[index - 1].closingCapital)
    expect(rows[index].yearIndex).toBe(rows[index - 1].yearIndex + 1)
  }
}

function expectZeroStartNeverBorrows(rows: readonly YearlyPeriodRow[]) {
  for (const row of rows) {
    expect(row.openingCapital).toBeGreaterThanOrEqual(-1e-9)
    expect(row.closingCapital).toBeGreaterThanOrEqual(-1e-9)
    if (row.openingCapital === 0 && row.investmentReturn === 0 && row.contribution === 0 && row.unfundedWithdrawal === 0) {
      expect(row.closingCapital).toBe(0)
    }
  }
}

// ---------------------------------------------------------------------------
// Scenario fixtures (Q1a: typed TS builders, reusable by later hardening PRs)
// ---------------------------------------------------------------------------

const deterministicSettings = { inflationSourceId: FIXED_INFLATION_SOURCE_ID, simulations: 1, cashPlanningRate: 0.02 } as const

/** S1: standard KVdR retirement, tiny horizon so every figure is hand-computable. */
export function kvdrStandardScenario(): RentenlueckeInput {
  return withFullCostBasis(cashOnlyInput({
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
  }))
}

/** S2: early retirement at 60, statutory pension at 67 → 7-year voluntary bridge. */
export function earlyRetirementBridgeScenario(): RentenlueckeInput {
  return withFullCostBasis(cashOnlyInput({
    currentAge: 60, retirementAge: 60, planningAge: 72,
    currentCapital: 500_000, monthlyContributionToday: 0,
    monthlyDesiredSpendingToday: 2_500,
    annualInflationRate: 0, annualReturnBeforeRetirement: 0, annualReturnInRetirement: 0,
    retirementInsurance: {
      pensionAge: 67, referenceYear: 2026, insurerAdditionalRate: 0.029,
      isParent: false, childrenConfirmed: true, childBirthYears: [],
      bridge: { manual: true, kvMonthlyToday: 180, pvMonthlyToday: 40 },
      pension: { status: 'kvdr', circumstances: 'standard' },
    },
    retirementIncomeStreams: [
      { ...pension({ startAge: 67 }), name: 'GV Rente' },
    ],
  }))
}

/** S3: voluntary GKV in retirement with the modeled portfolio assessment. */
export function voluntaryPortfolioCapitalScenario(): RentenlueckeInput {
  return withFullCostBasis(cashOnlyInput({
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
  }))
}

/** S4: automatic capital-income estimator (accumulating fund + bank deposit). */
export function estimatorScenario(): RentenlueckeInput {
  return insuredInput({
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
  })
}

/** S5: zero initial wealth, accumulation through contributions only. */
export function zeroStartAccumulationScenario(): RentenlueckeInput {
  return cashOnlyInput({
    currentAge: 66, retirementAge: 68, planningAge: 70,
    currentCapital: 0, monthlyContributionToday: 1_000,
    monthlyDesiredSpendingToday: 2_000,
    monthlyRetirementIncomeToday: 0,
    annualInflationRate: 0, annualReturnBeforeRetirement: 0, annualReturnInRetirement: 0,
  })
}

/** S6: depleted capital in retirement (planning age outlives the money). */
export function depletedScenario(): RentenlueckeInput {
  return withFullCostBasis(cashOnlyInput({
    currentAge: 67, retirementAge: 67, planningAge: 75,
    currentCapital: 10_000, monthlyContributionToday: 0,
    monthlyDesiredSpendingToday: 2_000,
    monthlyRetirementIncomeToday: 0,
    annualInflationRate: 0, annualReturnInRetirement: 0,
  }))
}

const SCENARIOS = {
  'kvdr-standard': kvdrStandardScenario,
  'early-bridge': earlyRetirementBridgeScenario,
  'voluntary-portfolio-capital': voluntaryPortfolioCapitalScenario,
  'estimator-automatic': estimatorScenario,
  'zero-start': zeroStartAccumulationScenario,
  'depleted': depletedScenario,
} as const

export type ScenarioName = keyof typeof SCENARIOS

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('reference scenario S1: standard KVdR retirement', () => {
  const input = prepare(kvdrStandardScenario())
  // Mandatory detailed portfolio with explicitly modeled zero returns: the full
  // cost basis means withdrawals realize no gains, and min(start × 0.7 × rate,
  // end − start) = 0 accrues no Vorabpauschale, so no Kapitalertragsteuer arises.
  const years = input.planningAge - input.currentAge
  const zeroPath = zeroBucketPath(input, years)

  it('computes the hand-calculated ledger exactly', () => {
    // Age 67: pension 24,000 gross. KVdR: KV basis 24,000 ≤ ceiling 69,750 (5812.5*12);
    // general rate (14.6+2.9)%=17.5% → 4,200/yr; half paid by insurer → own KV 2,100.
    // PV: childless ≥23 → (3.6+0.6)% of 24,000 = 1,008. Pre-tax net 20,892.
    // Slice 2 (Rentenbesteuerung): Rentenbeginn 2027 → 84.5 %; first-year gross
    // 24,000 → Rentenfreibetrag 15.5 % × 24,000 = 3,720 (frozen). Taxable share
    // 24,000-3,720 = 20,280; zvE 20,280-102-(2,100+1,008) = 17,070; §32a zone 2
    // (y=0.4722 → 864.99…) → pensionIncomeTax 864. Net 20,892-864 = 20,028.
    // Desired 24,000 → gap 3,972/yr. Capital 100,000 at modeled 0% funds 3 years;
    // never depleted.
    const result = simulateScenarioWithReturnPath(input, [], undefined, zeroPath)
    expect(result.retirementRows).toHaveLength(2)
    for (const row of result.retirementRows) {
      expect(row.retirementIncomeGross).toBeMoneyClose(24_000)
      expect(row.healthInsurance).toBeMoneyClose(2_100)
      expect(row.careInsurance).toBeMoneyClose(1_008)
      expect(row.pensionTaxBase).toBeMoneyClose(20_280)
      expect(row.pensionIncomeTax).toBeMoneyClose(864)
      expect(row.retirementIncomeNet).toBeMoneyClose(20_028)
      expect(row.gapWithdrawal).toBeMoneyClose(3_972)
    }
    expect(result.summary.survivesUntilPlanningAge).toBe(true)
    expectLedgerConservation(result.rows)
    // No taxable gains, interest or Vorabpauschale at modeled zero returns, so no
    // tax is assessed or funded. The 3,972 paid withdrawal funds exactly the
    // 3,108 KV/PV share plus the 864 pension tax, leaving no net remainder.
    for (const row of result.retirementRows) {
      expect(row.capitalIncomeTax).toBeMoneyClose(0)
      expect(row.taxableWithdrawal).toBeMoneyClose(0)
      expect(row.sparerpauschbetragApplied).toBeMoneyClose(0)
      expect(row.netGapWithdrawal).toBeCloseTo(0, 8)
    }
  })

  it('pins required capital: 3,972 for one year, funded forever at 0% with income above zero gap', () => {
    // At modeled 0% the gap repeats 3,972 every year (3,108 pre-tax gap + 864
    // GRV-Rentensteuer, slice 2); required capital is the 2 × 3,972 = 7,944
    // nominal sum within the ledger search's €1 stop epsilon.
    const result = simulateScenarioWithReturnPath(input, [], undefined, zeroPath)
    const required = result.summary.requiredCapitalAtRetirement
    expect(required).toBeGreaterThanOrEqual(7_944)
    expect(required).toBeLessThanOrEqual(7_945)
    expect(result.summary.projectedCapitalAtRetirement).toBeMoneyClose(100_000)
  })
})

describe('reference scenario S2: early retirement with voluntary bridge', () => {
  const input = prepare(earlyRetirementBridgeScenario())
  // Whole-phase manual bridge totals (explicitly unsupported circumstances) plus
  // the mandatory detailed portfolio at explicitly modeled zero returns.
  const zeroPath = zeroBucketPath(input, input.planningAge - input.currentAge)

  it('runs the bridge manually at 67−60=7 years, then KVdR', () => {
    const result = simulateScenarioWithReturnPath(input, [], undefined, zeroPath)
    expect(result.retirementRows).toHaveLength(12)
    const bridge = result.retirementRows.filter(r => r.ageStart < 67)
    const pensionPhase = result.retirementRows.filter(r => r.ageStart >= 67)
    expect(bridge).toHaveLength(7)
    expect(pensionPhase).toHaveLength(5)
    // Bridge: desired 30,000, no income. Own KV 180*12=2,160, PV 40*12=480.
    // gap = 30,000 - 0 + 2,160 + 480 → withdrawal 32,640; net income -2,640.
    for (const row of bridge) {
      expect(row.healthInsurance).toBeMoneyClose(2_160)
      expect(row.careInsurance).toBeMoneyClose(480)
      expect(row.pensionIncomeTax).toBeMoneyClose(0)
      expect(row.gapWithdrawal).toBeMoneyClose(32_640)
    }
    // Pension phase: gross 24,000. KVdR own KV = 17.5%×24,000/2 = 2,100 (verified probe);
    // PV childless 4.2%×24,000 = 1,008; pre-tax net 20,892.
    // Slice 2: Rentenbeginn 2033 → 87.5 %; freibetrag 12.5 % × 24,000 = 3,000;
    // taxable 21,000; zvE 21,000-102-3,108 = 17,790; zone 2 (y=0.5442 → 1,032.71…)
    // → pensionIncomeTax 1,032; net 19,860; gap = 30,000 − 19,860 = 10,140.
    for (const row of pensionPhase) {
      expect(row.healthInsurance).toBeMoneyClose(2_100)
      expect(row.careInsurance).toBeMoneyClose(1_008)
      expect(row.pensionTaxBase).toBeMoneyClose(21_000)
      expect(row.pensionIncomeTax).toBeMoneyClose(1_032)
      expect(row.retirementIncomeNet).toBeMoneyClose(19_860)
      expect(row.gapWithdrawal).toBeMoneyClose(10_140)
    }
    expectLedgerConservation(result.rows)
    expect(result.summary.survivesUntilPlanningAge).toBe(true)
  })

  it('keeps the phase boundary exactly at the statutory stream age', () => {
    const result = simulateScenario(input, 0.02)
    expect(result.retirementRows.find(r => r.ageStart === 66)!.healthInsurance).toBeMoneyClose(2_160)
    expect(result.retirementRows.find(r => r.ageStart === 67)!.healthInsurance).toBeMoneyClose(2_100)
  })
})

describe('reference scenario S3: voluntary GKV with modeled portfolio assessment', () => {
  const input = prepare(voluntaryPortfolioCapitalScenario())
  // Mandatory detailed portfolio at explicitly modeled zero returns: no gains,
  // interest or Vorabpauschale arise, so the solved annual capital assessment is
  // exactly 0 and no Kapitalertragsteuer is assessed. The 18,000 pension alone
  // sits below the 69,750 shared ceiling, so no capping applies.
  const zeroPath = zeroBucketPath(input, input.planningAge - input.currentAge)

  it('assesses the pension at the voluntary rates with no invented capital income', () => {
    // Voluntary pension 18,000 gross: KV 18,000×17.5% = 3,150 (no KVdR half
    // share, no DRV subsidy received); PV childless 4.2%×18,000 = 756.
    // Slice 2: Rentenbeginn 2026 → 84%; freibetrag 16%×18,000 = 2,880; taxable
    // 15,120; zvE = 15,120−102−(3,150+756) = 11,112 below the Grundfreibetrag →
    // pensionIncomeTax 0. Net 18,000−3,150−756 = 14,094; gap 24,000−14,094 = 9,906.
    const result = simulateScenarioWithReturnPath(input, [], undefined, zeroPath)
    expect(result.retirementRows).toHaveLength(3)
    for (const row of result.retirementRows) {
      expect(row.retirementIncomeGross).toBeMoneyClose(18_000)
      expect(row.portfolioContributionBase).toBe(0)
      expect(row.healthInsurance).toBeMoneyClose(3_150)
      expect(row.careInsurance).toBeMoneyClose(756)
      expect(row.pensionTaxBase).toBeMoneyClose(15_120)
      expect(row.pensionIncomeTax).toBe(0)
      expect(row.retirementIncomeNet).toBeMoneyClose(14_094)
      expect(row.gapWithdrawal).toBeMoneyClose(9_906)
      expect(row.capitalIncomeTax).toBeMoneyClose(0)
      expect(row.taxableWithdrawal).toBeMoneyClose(0)
      expect(row.sparerpauschbetragApplied).toBeMoneyClose(0)
    }
    expectLedgerConservation(result.rows)
  })

  it('uses the same tax method as KVdR with contribution-induced amounts, never double-deducted', () => {
    // Same exogenous flows under KVdR: the statutory 17.5% applies to the same
    // 18,000 assessment, but KVdR halves the own KV share (1,575 vs 3,150) while
    // PV stays 756. The lower own insurance lowers Sonderausgaben, so zvE rises
    // to 15,120−102−(1,575+756) = 12,687 → pensionIncomeTax 48 (vs 0 above);
    // net 18,000−1,575−756−48 = 15,621; gap 8,379. Method identical, amounts
    // differ only through the insurance rules; insurance is deducted exactly once.
    const kvdr = prepare({ ...voluntaryPortfolioCapitalScenario(),
      retirementInsurance: { ...voluntaryPortfolioCapitalScenario().retirementInsurance!,
        pension: { status: 'kvdr', circumstances: 'standard' } },
    })
    const row = simulateScenarioWithReturnPath(kvdr, [], undefined, zeroBucketPath(kvdr, kvdr.planningAge - kvdr.currentAge)).retirementRows[0]
    expect(row.insurance).toMatchObject({ selectedStatus: 'kvdr', effectiveStatus: 'kvdr' })
    expect(row.healthInsurance).toBeMoneyClose(1_575)
    expect(row.careInsurance).toBeMoneyClose(756)
    expect(row.pensionIncomeTax).toBeMoneyClose(48)
    expect(row.retirementIncomeNet).toBeMoneyClose(15_621)
    expect(row.gapWithdrawal).toBeMoneyClose(8_379)
    expect(row.retirementIncomeDeductions).toBeMoneyClose(row.retirementIncomeOtherDeductions + row.healthInsurance + row.careInsurance)
  })
})

describe('reference scenario S4: automatic capital-income estimator', () => {
  const input = prepare(estimatorScenario())
  const fundRate = 0.06
  const bankRate = 0.02
  const bucketPath = Array.from({ length: 4 }, () => [
    { id: 'fund', totalReturnRate: fundRate },
    { id: 'bank', totalReturnRate: bankRate, grossBankReturnRate: bankRate },
  ])

  it('needs the estimator and funds it from the actual portfolio', () => {
    expect(needsDetailedPortfolio(input)).toBe(true)
    const result = simulateScenarioWithReturnPath(input, [], undefined, bucketPath)
    // Year 1 (age 66, accumulation): opening 100,000; return 60,000*.06+40,000*.02 = 4,400;
    // closing 104,400. KV/PV of accumulation phase are 0 (paid outside the portfolio).
    const first = result.rows[0]
    expect(first.investmentReturn).toBeMoneyClose(4_400)
    expect(first.healthInsurance).toBe(0)
    expect(first.careInsurance).toBe(0)
    expectLedgerConservation(result.rows)
  })

  it('creates fund Vorabpauschale pending in year 1 and receives it in year 2', () => {
    const result = simulateScenarioWithReturnPath(input, [], undefined, bucketPath)
    const vp = result.rows[0].capitalAssessment!.pendingVorabpauschale
    // Old holdings: min(60,000×0.7×0.032, 3,600) = 1,344 (full-year factor). Annual
    // rebalancing to the initial 60/40 weights sells fund (63,600 vs target 62,160)
    // and the retained-pending convention scales the old-holding VP by the retained
    // share; verified engine value 1,323.1625… (regression pin, exact formula in
    // insuranceEstimator.maintainAllocation). The pin sits below the pre-bank-interest
    // 1,323.7132 value because the interest-inclusive accumulation tax is funded
    // from a slightly larger sale, retaining marginally less VP.
    expect(vp).toBeMoneyClose(1_323.1625766809689)
    expect(result.rows[1].capitalAssessment!.receivedVorabpauschale).toBeMoneyClose(1_323.1625766809689)
  })

  it('assesses and funds Kapitalertragsteuer on withdrawal gains plus Vorabpauschale', () => {
    // First retirement year (age 67): the pension tax joins the same committed
    // sale, so funding the ~261 pension tax realizes more gains than the
    // pension-ignorant base (was 6,328.366 -> 4,429.856 x0.7 + 839.445 interest
    // = 5,269.301 taxable): jointly funded taxable 5,336.048; allowance 1,000
    // -> base 4,336.048; tax 4,336.048 x 0.25 x 1.055 = 1,143.633. The larger
    // sale slightly raises the insurance assessment (KV/PV 5,093.173/1,054.262
    // Sonderausgaben), lowering the pension tax to 261 (was 263 pension-ignorant).
    // Required withdrawal = 6,000 gap + insurance + 1,143.633 capital tax + 261
    // pension tax = 13,552.068 gap. Tier-3 regression pins after the joint-funding
    // fix (no feasible hand calculation for the fixed point; gap/paid/closing
    // identities are verified by the joint-funding suite).
    const result = simulateScenario(input, 0.02)
    const first = result.retirementRows[0]
    expect(first.capitalAssessment!.bankInterest).toBeMoneyClose(839.4450777952111)
    expect(first.taxableWithdrawal).toBeMoneyClose(5336.048177575691)
    expect(first.sparerpauschbetragApplied).toBeMoneyClose(1_000)
    expect(first.capitalIncomeTax).toBeMoneyClose(1143.6327068355884)
    expect(first.pensionTaxBase).toBeMoneyClose(20_280)
    expect(first.pensionIncomeTax).toBeMoneyClose(261)
    expect(first.retirementIncomeNet).toBeMoneyClose(17591.565123596985)
    expect(first.netGapWithdrawal).toBeMoneyClose(6_000)
    expect(first.gapWithdrawal).toBeMoneyClose(13552.067583238604)
    // Every retirement year is taxed with a fresh annual allowance (scaled by inflation;
    // factor 1 here, so 1,000); accumulation Umschichtung rows carry the same fields.
    for (const row of result.retirementRows) {
      expect(row.capitalIncomeTax ?? 0).toBeGreaterThan(0)
      expect(row.sparerpauschbetragApplied).toBeMoneyClose(1_000)
      expect(row.netGapWithdrawal ?? 0).toBeMoneyClose(6_000)
    }
    for (const row of result.accumulationRows) {
      expect(row.capitalIncomeTax).toBeDefined()
      expect(row.taxableWithdrawal).toBeDefined()
      expect(row.sparerpauschbetragApplied).toBeDefined()
    }
    expectLedgerConservation(result.rows)
    // Required capital funds gap + both taxes (tier-3 regression pin for the taxed search;
    // slice 2 raises it by the jointly funded GRV-Rentensteuer: the search rebuilds
    // rows through the taxed joint path, where each pension-tax share is funded by
    // the gain-realizing sale itself. Both pins moved with the bank-interest-inclusive
    // capital tax: the accumulation year now funds 69.365 tax (projected 104,930.635
    // instead of 105,000); required capital rises to 34,707.357 with joint funding
    // (was 34,552.850 pension-ignorant).
    expect(result.summary.requiredCapitalAtRetirement).toBeMoneyClose(34707.357313855726)
    expect(result.summary.projectedCapitalAtRetirement).toBeMoneyClose(104930.63472440137)
  })

  it('matches deterministic and reference bootstrap paths and reproduces seeded runs', () => {
    const settings = { portfolioComponents: createPortfolioComponentsFromBuckets(input.estimatorPortfolio!), ...deterministicSettings }
    const direct = simulateScenarioWithReturnPath(input, [], undefined, bucketPath)
    const reference = simulateHistoricalBootstrapReferenceScenario(input, settings)
    expect(reference.rows).toEqual(simulateScenario(input, 0.02).rows)
    // The reference path uses expected returns of the selected sources, not our fixed path;
    // regression pin: with these sources the expected portfolio return is strictly positive.
    expect(reference.rows[0].nominalReturnRate).toBeGreaterThan(0)
    const once = runHistoricalBootstrapSimulation(input, settings)
    const twice = runHistoricalBootstrapSimulation(input, settings)
    expect(once).toEqual(twice)
    expect(once.rows.map(r => r.p50CapitalToday)).toEqual(once.rows.map(r => r.p50CapitalToday))
    expect(direct.rows.length).toBe(reference.rows.length)
  })
})

describe('reference scenario S5: zero-start accumulation', () => {
  const input = prepare(zeroStartAccumulationScenario())

  it('blocks zero-start forecasts with a truthful diagnostic instead of inventing capital', () => {
    // No zero-start support: a zero opening allocation cannot start the detailed
    // ledger, even with accumulation contributions. The forecast blocks with the
    // positive-allocation diagnostic on every public route; the required-capital
    // trial endpoint at zero (candidate(0)) is unaffected — see requiredCapital.
    expect(input.currentCapital).toBe(0)
    expect(() => simulateScenario(input, 0.02)).toThrow(/positive Ausgangsallokation/)
    expect(() => simulateScenarioWithReturnPath(input, [], undefined, zeroBucketPath(input, input.planningAge - input.currentAge))).toThrow(/positive Ausgangsallokation/)
  })
})

describe('reference scenario S6: depleted capital', () => {
  const input = prepare(depletedScenario())
  // Full cost basis plus explicitly modeled zero returns: no gains, interest or
  // Vorabpauschale, so no Kapitalertragsteuer changes the depletion arithmetic.
  const zeroPath = zeroBucketPath(input, input.planningAge - input.currentAge)

  it('marks depletion, clamps capital at zero and reports unfunded withdrawals', () => {
    const result = simulateScenarioWithReturnPath(input, [], undefined, zeroPath)
    // 10,000 capital, 24,000 gap at 0%: depleted in year 1 with 14,000 unfunded.
    expect(result.retirementRows[0].depleted).toBe(true)
    expect(result.retirementRows[0].unfundedWithdrawal).toBeMoneyClose(14_000)
    expect(result.retirementRows[0].closingCapital).toBe(0)
    for (const row of result.retirementRows.slice(1)) {
      expect(row.openingCapital).toBe(0)
      expect(row.closingCapital).toBe(0)
      expect(row.gapWithdrawal).toBeMoneyClose(24_000)
    }
    expect(result.summary.survivesUntilPlanningAge).toBe(false)
    expect(result.summary.depletionAge).toBe(67)
    expectZeroStartNeverBorrows(result.rows)
    expectLedgerConservation(result.rows)
    // At modeled 0% with no capital tax, required capital is the 8 × 24,000 =
    // 192,000 nominal sum within the ledger search's €1 stop epsilon.
    const required = result.summary.requiredCapitalAtRetirement
    expect(required).toBeGreaterThanOrEqual(192_000)
    expect(required).toBeLessThanOrEqual(192_001)
  })
})

describe('cross-scenario invariants and return paths', () => {
  // Zero-start blocks every forecast (S5); all runnable scenarios below carry a
  // positive opening allocation on the mandatory detailed portfolio.
  const names = (Object.keys(SCENARIOS) as ScenarioName[]).filter(name => name !== 'zero-start')

  it('every scenario survives schema validation and full-ledger conservation', () => {
    for (const name of names) {
      const input = prepare(SCENARIOS[name]())
      const result = simulateScenario(input, 0.02)
      expect(result.rows.length, name).toBe(input.planningAge - input.currentAge)
      expectLedgerConservation(result.rows)
    }
  })

  it('monotone inflation factors and nonnegative money in every row', () => {
    for (const name of names) {
      const result = simulateScenario(prepare(SCENARIOS[name]()), 0.02)
      for (const row of result.rows) {
        for (const money of [row.openingCapital, row.closingCapital, row.desiredSpending, row.retirementIncomeGross]) {
          expect(Number.isFinite(money), `${name} row ${row.ageStart}`).toBe(true)
        }
      }
      for (let index = 1; index < result.rows.length; index++) {
        expect(result.rows[index].inflationFactor).toBeGreaterThanOrEqual(result.rows[index - 1].inflationFactor)
      }
    }
  })

  it('deterministic seed reproduces identical stochastic paths (same seed → same result)', () => {
    const input = prepare(kvdrStandardScenario())
    const settings = { simulations: 4, seed: 42_000, allocation: { equity: 0.6, bonds: 0.3, fixed: 0.1 } } as const
    const a = runStochasticSimulation(input, settings)
    const b = runStochasticSimulation(input, settings)
    expect(a).toEqual(b)
    const c = runStochasticSimulation(input, { ...settings, seed: 42_001 })
    expect(c.rows).not.toEqual(a.rows)
  })

  it('stochastic summary stays within its own percentile envelope', () => {
    const input = prepare(kvdrStandardScenario())
    const summary = runStochasticSimulation(input, { simulations: 8, seed: 991, allocation: { equity: 0.6, bonds: 0.3, fixed: 0.1 } })
    expect(summary.simulations).toBe(8)
    expect(summary.successProbability).toBeGreaterThanOrEqual(0)
    expect(summary.successProbability).toBeLessThanOrEqual(1)
    for (const row of summary.rows) {
      expect(row.p10CapitalToday).toBeLessThanOrEqual(row.p50CapitalToday + 1e-9)
      expect(row.p50CapitalToday).toBeLessThanOrEqual(row.p90CapitalToday + 1e-9)
    }
  })

  it('keeps assessment-only capital out of spendable income in estimator scenarios', () => {
    const result = simulateScenario(prepare(estimatorScenario()), 0.02)
    for (const row of result.retirementRows) {
      // Slice-2 net identity holds on estimator rows too (pension tax reduces the net).
      expect(row.retirementIncomeNet).toBeMoneyClose(
        row.retirementIncomeGross - row.retirementIncomeOtherDeductions - row.healthInsurance - row.careInsurance - (row.pensionIncomeTax ?? 0))
    }
  })
})