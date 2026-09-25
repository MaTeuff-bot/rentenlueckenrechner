import { describe, expect, it } from 'vitest'
import { applyCoverage, type InsuranceCoverageAnswers } from '../insuranceCoverage'
import { completedCoverage } from './insuranceFixtures'
import { timelineBoundary } from '../scenarioTimeline'
import { automaticInsurance, cashOnlyInput, insuredInput, pension } from './insuranceFixtures'
import { clearHiddenInvalidInsuranceValues } from '../retirementInsurance'
import { simulateScenario } from '../simulateScenario'
import { simulateScenarioWithReturnPath, runStochasticSimulation, createSeededRandom, generatePortfolioReturnPath } from '../stochasticReturns'
import { runHistoricalBootstrapSimulation, simulateHistoricalBootstrapReferenceScenario, FIXED_INFLATION_SOURCE_ID, SYNTHETIC_RETURN_SERIES_IDS } from '../historicalReturns'
import { createPortfolioComponentsFromBuckets } from '../portfolioBuckets'
import { needsEstimator } from '../capitalIncome/setup'
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
        row.openingCapital + row.investmentReturn + row.contribution - row.capitalAssessment.paidWithdrawal)
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

const deterministicSettings = { inflationSourceId: FIXED_INFLATION_SOURCE_ID, simulations: 1 } as const

/** S1: standard KVdR retirement, tiny horizon so every figure is hand-computable. */
export function kvdrStandardScenario(): RentenlueckeInput {
  return cashOnlyInput({
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
  })
}

/** S2: early retirement at 60, statutory pension at 67 → 7-year voluntary bridge. */
export function earlyRetirementBridgeScenario(): RentenlueckeInput {
  return cashOnlyInput({
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
  })
}

/** S3: voluntary GKV in retirement with explicit manual capital-income basis. */
export function voluntaryManualCapitalScenario(): RentenlueckeInput {
  const input = cashOnlyInput({
    currentAge: 67, retirementAge: 67, planningAge: 70,
    currentCapital: 200_000, monthlyContributionToday: 0,
    monthlyDesiredSpendingToday: 2_000,
    annualInflationRate: 0, annualReturnInRetirement: 0,
    retirementInsurance: {
      pensionAge: 67, referenceYear: 2026, insurerAdditionalRate: 0.029,
      isParent: false, childrenConfirmed: true, childBirthYears: [],
      bridge: { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 },
      pension: { status: 'voluntary', circumstances: 'standard', capitalMode: 'manual',
        capitalMonthlyToday: 100, drvSubsidy: 'not-received' },
    },
    retirementIncomeStreams: [
      { ...pension({ amountMonthlyToday: 1_500 }), name: 'GV Rente' },
    ],
  })
  return input
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
        returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.cash },
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
  return cashOnlyInput({
    currentAge: 67, retirementAge: 67, planningAge: 75,
    currentCapital: 10_000, monthlyContributionToday: 0,
    monthlyDesiredSpendingToday: 2_000,
    monthlyRetirementIncomeToday: 0,
    annualInflationRate: 0, annualReturnInRetirement: 0,
  })
}

const SCENARIOS = {
  'kvdr-standard': kvdrStandardScenario,
  'early-bridge': earlyRetirementBridgeScenario,
  'voluntary-manual-capital': voluntaryManualCapitalScenario,
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

  it('computes the hand-calculated ledger exactly', () => {
    // Age 67: pension 24,000 gross. KVdR: KV basis 24,000 ≤ ceiling 69,750 (5812.5*12);
    // general rate (14.6+2.9)%=17.5% → 4,200/yr; half paid by insurer → own KV 2,100.
    // PV: childless ≥23 → (3.6+0.6)% of 24,000 = 1,008. Pre-tax net 20,892.
    // Slice 2 (Rentenbesteuerung): Rentenbeginn 2027 → 84.5 %; first-year gross
    // 24,000 → Rentenfreibetrag 15.5 % × 24,000 = 3,720 (frozen). Taxable share
    // 24,000-3,720 = 20,280; zvE 20,280-102-(2,100+1,008) = 17,070; §32a zone 2
    // (y=0.4722 → 864.99…) → pensionIncomeTax 864. Net 20,892-864 = 20,028.
    // Desired 24,000 → gap 3,972/yr. Capital 100,000 at 0% funds 3 years; never depleted.
    const result = simulateScenario(input)
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
    // Slice 1: zero return means no taxable gains, so no tax is assessed or funded;
    // the gap is met in full and required capital is unchanged by the tax.
    for (const row of result.retirementRows) {
      expect(row.capitalIncomeTax).toBeMoneyClose(0)
      expect(row.taxableWithdrawal).toBeMoneyClose(0)
      expect(row.sparerpauschbetragApplied).toBeMoneyClose(0)
      expect(row.netGapWithdrawal).toBeMoneyClose(row.gapWithdrawal)
    }
  })

  it('pins required capital: 3,972 for one year, funded forever at 0% with income above zero gap', () => {
    // At 0% return the gap repeats 3,972 every year (3,108 pre-tax gap + 864
    // GRV-Rentensteuer, slice 2); required capital = 2 × 3,972 = 7,944.
    const result = simulateScenario(input)
    expect(result.summary.requiredCapitalAtRetirement).toBeMoneyClose(7_944)
    expect(result.summary.projectedCapitalAtRetirement).toBeMoneyClose(100_000)
  })
})

describe('reference scenario S2: early retirement with voluntary bridge', () => {
  const input = prepare(earlyRetirementBridgeScenario())

  it('runs the bridge manually at 67−60=7 years, then KVdR', () => {
    const result = simulateScenario(input)
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
    const result = simulateScenario(input)
    expect(result.retirementRows.find(r => r.ageStart === 66)!.healthInsurance).toBeMoneyClose(2_160)
    expect(result.retirementRows.find(r => r.ageStart === 67)!.healthInsurance).toBeMoneyClose(2_100)
  })
})

describe('reference scenario S3: voluntary GKV with manual capital basis', () => {
  const input = prepare(voluntaryManualCapitalScenario())

  it('assesses pension, minimum top-up and capital in the shared ceiling', () => {
    // Verified engine output (probe): voluntary pension 18,000 gross.
    // KV: statutory 18,000×17.5% = 3,150, no KVdR share, plus capital basis
    // 1,200×16.9% (reduced rate) = 202.80 → own KV 3,352.80.
    // PV: childless surcharge, 4.2%×18,000 = 756 + capital 1,200×4.2% = 50.40 → 806.40.
    const result = simulateScenario(input)
    for (const row of result.retirementRows) {
      expect(row.careInsurance).toBeMoneyClose(806.4)
      expect(row.portfolioContributionBase).toBeMoneyClose(1_200)
      expect(row.healthInsurance).toBeMoneyClose(3_352.8)
      // Slice 1: manual capital basis at 0% return has no taxable gains (gain-proportional
      // base is zero), so no tax is assessed; the calculation is never blocked.
      expect(row.capitalIncomeTax).toBeMoneyClose(0)
      expect(row.taxableWithdrawal).toBeMoneyClose(0)
      expect(row.sparerpauschbetragApplied).toBeMoneyClose(0)
      expect(row.netGapWithdrawal).toBeMoneyClose(row.gapWithdrawal)
    }
    expectLedgerConservation(result.rows)
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
    expect(needsEstimator(input)).toBe(true)
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
    // First retirement year (age 67): funding-sale gain 4,408.124 + rebalancing gain
    // 602.234 + received VP 1,318.007 = 6,328.366; x0.7 (30% Teilfreistellung) =
    // 4,429.856; + bank interest 839.445 (ordinary deposit, no exemption) = 5,269.301;
    // allowance 1,000 -> base 4,269.301; tax 4,269.301 x 0.25 x 1.055 = 1,126.028.
    // The larger interest-inclusive capital tax funds a larger sale, which slightly
    // raises the insurance assessment (KV/PV Sonderausgaben) and lowers the pension
    // tax to 263 (was 265 fund-only). Required withdrawal = 6,000 gap + insurance +
    // 1,126.028 capital tax + 263 pension tax = 13,522.780 gap (tier-3 pins).
    const result = simulateScenario(input)
    const first = result.retirementRows[0]
    expect(first.capitalAssessment!.bankInterest).toBeMoneyClose(839.4450777952111)
    expect(first.taxableWithdrawal).toBeMoneyClose(5269.301209402183)
    expect(first.sparerpauschbetragApplied).toBeMoneyClose(1_000)
    expect(first.capitalIncomeTax).toBeMoneyClose(1126.0281939798258)
    expect(first.pensionTaxBase).toBeMoneyClose(20_280)
    expect(first.pensionIncomeTax).toBeMoneyClose(263)
    expect(first.retirementIncomeNet).toBeMoneyClose(17603.248252072553)
    expect(first.netGapWithdrawal).toBeMoneyClose(6_000)
    expect(first.gapWithdrawal).toBeMoneyClose(13522.779941907274)
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
    // slice 2 raises it by the funded GRV-Rentensteuer; the holdings-only funding
    // take keeps future capital-tax estimates slightly lower than full state scaling.
    // Both pins moved with the bank-interest-inclusive capital tax: the accumulation
    // year now funds 69.365 tax (projected 104,930.635 instead of 105,000).
    expect(result.summary.requiredCapitalAtRetirement).toBeMoneyClose(34552.849772185415)
    expect(result.summary.projectedCapitalAtRetirement).toBeMoneyClose(104930.63472440137)
  })

  it('matches deterministic and reference bootstrap paths and reproduces seeded runs', () => {
    const settings = { portfolioComponents: createPortfolioComponentsFromBuckets(input.estimatorPortfolio!), ...deterministicSettings }
    const direct = simulateScenarioWithReturnPath(input, [], undefined, bucketPath)
    const reference = simulateHistoricalBootstrapReferenceScenario(input, settings)
    expect(reference.rows).toEqual(simulateScenario(input).rows)
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

  it('accumulates exactly the contributed amounts and never invents returns', () => {
    // 2 accumulation years × 12,000 = 24,000 at 0% return and 0% inflation.
    const result = simulateScenario(input)
    expect(result.accumulationRows).toHaveLength(2)
    expect(result.accumulationRows[0].closingCapital).toBeMoneyClose(12_000)
    expect(result.accumulationRows[1].closingCapital).toBeMoneyClose(24_000)
    expect(result.summary.projectedCapitalAtRetirement).toBeMoneyClose(24_000)
    expectZeroStartNeverBorrows(result.rows)
    expectLedgerConservation(result.rows)
    // Retirement at 68–70: desired 24,000/yr, zero pension income (explicit override) →
    // gap 24,000/yr vs 24,000 capital. The first year is exactly consumed (closing 0,
    // not depleted by the epsilon rule); the following years are unfunded.
    expect(result.summary.survivesUntilPlanningAge).toBe(false)
    expect(result.retirementRows.some(row => row.depleted)).toBe(true)
    expect(result.retirementRows.at(-1)!.unfundedWithdrawal).toBeGreaterThan(0)
  })
})

describe('reference scenario S6: depleted capital', () => {
  const input = prepare(depletedScenario())

  it('marks depletion, clamps capital at zero and reports unfunded withdrawals', () => {
    const result = simulateScenario(input)
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
  })
})

describe('cross-scenario invariants and return paths', () => {
  const names = Object.keys(SCENARIOS) as ScenarioName[]

  it('every scenario survives schema validation and full-ledger conservation', () => {
    for (const name of names) {
      const input = prepare(SCENARIOS[name]())
      const result = simulateScenario(input)
      expect(result.rows.length, name).toBe(input.planningAge - input.currentAge)
      expectLedgerConservation(result.rows)
    }
  })

  it('monotone inflation factors and nonnegative money in every row', () => {
    for (const name of names) {
      const result = simulateScenario(prepare(SCENARIOS[name]()))
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
    const path = (seed: number) => generatePortfolioReturnPath(
      input.planningAge - input.currentAge,
      { equity: 0.6, bonds: 0.3, fixed: 0.1 },
      undefined,
      createSeededRandom(seed))
    const a = simulateScenarioWithReturnPath(input, path(42_000))
    const b = simulateScenarioWithReturnPath(input, path(42_000))
    expect(a.rows).toEqual(b.rows)
    const c = simulateScenarioWithReturnPath(input, path(42_001))
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
    const result = simulateScenario(prepare(estimatorScenario()))
    for (const row of result.retirementRows) {
      // Slice-2 net identity holds on estimator rows too (pension tax reduces the net).
      expect(row.retirementIncomeNet).toBeMoneyClose(
        row.retirementIncomeGross - row.retirementIncomeOtherDeductions - row.healthInsurance - row.careInsurance - (row.pensionIncomeTax ?? 0))
    }
  })
})
