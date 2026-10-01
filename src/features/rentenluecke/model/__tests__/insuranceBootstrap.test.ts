import { generateHistoricalInflationPath, sampleHistoricalYearsForPath } from '../historicalReturns/bootstrapSampling'
import { describe, expect, it } from 'vitest'
import { automaticInsurance, insuredInput, pension } from './insuranceFixtures'
import { createSeededRandom, simulateScenarioWithReturnPath } from '../stochasticReturns'
import { sampledBucketReturns } from '../capitalIncome/returns'
import { createPortfolioComponentsFromBuckets } from '../portfolioBuckets'
import { createHistoricalBootstrapSeed, DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
  findInflationSourceOption, getValidHistoricalYears,
  runHistoricalBootstrapSimulation, simulateHistoricalBootstrapReferenceScenario, simulateHistoricalBootstrapScenario } from '../historicalReturns'
import type { RentenlueckeInput } from '../types'

const insured: RentenlueckeInput = insuredInput({
  currentAge: 66, retirementAge: 66, planningAge: 71,
  currentCapital: 100_000,
  // Fund-only portfolio: bank legs honestly reject negative gross paths (no
  // clamp/resample/drop), so the bootstrap comparisons use fund holdings only.
  estimatorPortfolio: [{ id: 'fund', name: 'Fonds', value: 100_000,
    holding: 'accumulating-equity-fund' as const,
    returnSeriesId: 'synthetic-equity-assumption-v1' }],
  retirementIncomeStreams: [pension({ amountMonthlyToday: 50, effectiveDeductionRate: 0.05 })],
  retirementInsurance: automaticInsurance({
    bridge: { status: 'unknown', circumstances: 'standard' },
    pension: { status: 'voluntary', circumstances: 'standard', drvSubsidy: 'confirmed' },
  }),
})
const settings = {
  portfolioComponents: createPortfolioComponentsFromBuckets(insured.estimatorPortfolio!),
  inflationSourceId: DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
  simulations: 5,
}

describe('insurance bootstrap and reference consistency', () => {
  it('keeps market seeds stable for insurance-only edits and repeats identical summaries', () => {
    const manual = { ...insured, retirementInsurance: automaticInsurance({
      capitalEstimator: insured.retirementInsurance!.capitalEstimator,
      bridge: { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 },
      pension: { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 },
    }) }
    expect(createHistoricalBootstrapSeed(insured, settings)).toBe(createHistoricalBootstrapSeed(manual, settings))
    expect(runHistoricalBootstrapSimulation(insured, settings)).toEqual(runHistoricalBootstrapSimulation(insured, settings))
    expect(simulateHistoricalBootstrapScenario(insured, settings).metadata.sampledYears)
      .toEqual(simulateHistoricalBootstrapScenario(manual, settings).metadata.sampledYears)
    expect(simulateHistoricalBootstrapScenario(insured, settings).retirementRows[0].gapWithdrawal)
      .toBeGreaterThan(simulateHistoricalBootstrapScenario(manual, settings).retirementRows[0].gapWithdrawal)
  })

  it('uses the same cashflow in bootstrap and reference ledgers, including costs above income', () => {
    const reference = simulateHistoricalBootstrapReferenceScenario(insured, settings)
    const bootstrap = simulateHistoricalBootstrapScenario(insured, settings)
    expect(reference.metadata.sampledYears).toEqual(bootstrap.metadata.sampledYears)
    // Modeled assessment path: insurance costs exceed the 570/yr pension income,
    // so available income is negative and the gap exceeds desired spending.
    for (const row of [...reference.retirementRows, ...bootstrap.retirementRows]) {
      expect(row.retirementIncomeNet).toBeLessThan(0)
      expect(row.gapWithdrawal).toBeGreaterThan(row.desiredSpending)
    }
    // Pension tax is capital-independent, so it matches exactly across return paths.
    for (const [index, row] of reference.retirementRows.entries()) {
      expect(row.pensionIncomeTax).toBe(bootstrap.retirementRows[index].pensionIncomeTax)
    }
    // Exact cashflow identity where insurance is return-independent (manual totals):
    // gaps then differ only by the funded capital-tax component.
    const manual = { ...insured, retirementInsurance: automaticInsurance({
      capitalEstimator: insured.retirementInsurance!.capitalEstimator,
      bridge: { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 },
      pension: { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 },
    }) }
    const manualReference = simulateHistoricalBootstrapReferenceScenario(manual, settings)
    const manualBootstrap = simulateHistoricalBootstrapScenario(manual, settings)
    for (const [index, row] of manualReference.retirementRows.entries()) {
      const sample = manualBootstrap.retirementRows[index]
      expect(row.retirementIncomeNet).toBe(sample.retirementIncomeNet)
      expect(row.healthInsurance).toBe(sample.healthInsurance)
      expect(row.careInsurance).toBe(sample.careInsurance)
      expect(row.gapWithdrawal - sample.gapWithdrawal).toBeCloseTo(
        (row.capitalIncomeTax ?? 0) - (sample.capitalIncomeTax ?? 0), 8)
    }
  })

  it('aggregates actual insured path ledgers into bootstrap percentiles', () => {
    const summary = runHistoricalBootstrapSimulation(insured, settings)
    const rng = createSeededRandom(summary.metadata.seed)
    const inflation = findInflationSourceOption(settings.inflationSourceId, insured.annualInflationRate)!
    const years = getValidHistoricalYears(settings.portfolioComponents, inflation)
    const horizon = insured.planningAge - insured.currentAge
    const paths = Array.from({ length: settings.simulations }, () => {
      const pathSeed = Math.floor(rng() * 4_294_967_296)
      const returnSeed = Math.floor(rng() * 4_294_967_296)
      const sampled = sampleHistoricalYearsForPath(settings.portfolioComponents, inflation, years, horizon, pathSeed)
      return simulateScenarioWithReturnPath(insured, [],
        generateHistoricalInflationPath(inflation, sampled),
        sampledBucketReturns(settings.portfolioComponents, inflation, sampled, createSeededRandom(returnSeed)))
    })
    for (const [index, row] of summary.rows.entries()) {
      const capital = paths.map((path) => path.rows[index].closingCapitalToday).sort((a, b) => a - b)
      expect(row.p10CapitalToday).toBe(capital[0])
      expect(row.p50CapitalToday).toBe(capital[2])
      expect(row.p90CapitalToday).toBe(capital[4])
      expect(row.depletionProbability).toBe(capital.filter((value) => value <= 0).length / settings.simulations)
    }
    expect(summary.successProbability).toBe(paths.filter((path) => path.summary.survivesUntilPlanningAge).length / settings.simulations)
  })
})
