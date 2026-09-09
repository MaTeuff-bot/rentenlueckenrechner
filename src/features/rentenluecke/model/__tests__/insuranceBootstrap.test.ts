import { generateHistoricalInflationPath, sampleHistoricalYearsForPath } from '../historicalReturns/bootstrapSampling'
import { describe, expect, it } from 'vitest'
import { automaticInsurance, insuredInput, pension } from './insuranceFixtures'
import { createPortfolioComponents, createSeededRandom, simulateScenarioWithReturnPath } from '../stochasticReturns'
import { createHistoricalBootstrapSeed, DEFAULT_HISTORICAL_INFLATION_SERIES_ID, DEFAULT_HISTORICAL_RETURN_SERIES_IDS,
  findInflationSourceOption, generateHistoricalReturnPath, getValidHistoricalYears,
  runHistoricalBootstrapSimulation, simulateHistoricalBootstrapReferenceScenario, simulateHistoricalBootstrapScenario } from '../historicalReturns'
import type { RentenlueckeInput } from '../types'

const settings = {
  portfolioComponents: createPortfolioComponents({ equity: 0.7, bonds: 0.2, fixed: 0.1 }, DEFAULT_HISTORICAL_RETURN_SERIES_IDS),
  inflationSourceId: DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
  simulations: 5,
}
const insured: RentenlueckeInput = insuredInput({
  currentAge: 66, retirementAge: 66, planningAge: 71,
  retirementIncomeStreams: [pension({ amountMonthlyToday: 50, effectiveDeductionRate: 0.05 })],
  retirementInsurance: automaticInsurance({
    bridge: { status: 'unknown', circumstances: 'standard', capitalMonthlyToday: 20000 },
    pension: { status: 'voluntary', circumstances: 'standard', capitalMonthlyToday: 20000, drvSubsidy: 'confirmed' },
  }),
})

describe('insurance bootstrap and reference consistency', () => {
  it('keeps market seeds stable for insurance-only edits and repeats identical summaries', () => {
    const manual = { ...insured, retirementInsurance: automaticInsurance({
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
    for (const [index, row] of reference.retirementRows.entries()) {
      const sample = bootstrap.retirementRows[index]
      expect(row.retirementIncomeNet).toBe(sample.retirementIncomeNet)
      expect(row.healthInsurance).toBe(sample.healthInsurance)
      expect(row.careInsurance).toBe(sample.careInsurance)
      expect(row.gapWithdrawal).toBe(sample.gapWithdrawal)
      expect(row.retirementIncomeNet).toBeLessThan(0)
      expect(row.gapWithdrawal).toBeGreaterThan(row.desiredSpending)
    }
    expect(reference.summary.requiredCapitalAtRetirement).toBe(bootstrap.summary.requiredCapitalAtRetirement)
  })

  it('aggregates actual insured path ledgers into bootstrap percentiles', () => {
    const summary = runHistoricalBootstrapSimulation(insured, settings)
    const rng = createSeededRandom(summary.metadata.seed)
    const inflation = findInflationSourceOption(settings.inflationSourceId, insured.annualInflationRate)!
    const years = getValidHistoricalYears(settings.portfolioComponents, inflation)
    const paths = Array.from({ length: settings.simulations }, () => {
      const pathSeed = Math.floor(rng() * 4_294_967_296)
      const returnSeed = Math.floor(rng() * 4_294_967_296)
      const sampled = sampleHistoricalYearsForPath(settings.portfolioComponents, inflation, years, 5, pathSeed)
      return simulateScenarioWithReturnPath(insured,
        generateHistoricalReturnPath(settings.portfolioComponents, inflation, sampled, createSeededRandom(returnSeed)),
        generateHistoricalInflationPath(inflation, sampled))
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
