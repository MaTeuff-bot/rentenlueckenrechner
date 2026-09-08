import { generateHistoricalInflationPath, sampleHistoricalYearsForPath } from '../historicalReturns/bootstrapSampling'
import { describe, expect, it } from 'vitest'
import { DEFAULT_INPUT } from '../defaults'
import { createDefaultRetirementInsurance } from '../retirementInsurance'
import { createDefaultRetirementIncomeStreams } from '../retirementIncomeStreams'
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
const legacy: RentenlueckeInput = {
  ...DEFAULT_INPUT, currentAge: 66, retirementAge: 67, planningAge: 71,
  retirementIncomeStreams: createDefaultRetirementIncomeStreams(DEFAULT_INPUT).map((stream) => ({ ...stream, effectiveDeductionRate: 0.2 })),
}
const insured: RentenlueckeInput = {
  ...legacy,
  retirementInsurance: { ...createDefaultRetirementInsurance(), enabled: true, status: 'kvdr', portfolioBaseMonthlyToday: 20_000 },
  retirementIncomeStreams: legacy.retirementIncomeStreams!.map((stream) => ({ ...stream, separateDeductions: { otherRate: 0.05 } })),
}

describe('insurance bootstrap and reference consistency', () => {
  it('preserves legacy seeds, reference rows and distributions while disabled', () => {
    const disabled: RentenlueckeInput = { ...insured, retirementInsurance: { ...insured.retirementInsurance!, enabled: false } }
    expect(createHistoricalBootstrapSeed(disabled, settings)).toBe(createHistoricalBootstrapSeed(legacy, settings))
    expect(simulateHistoricalBootstrapReferenceScenario(disabled, settings)).toEqual(simulateHistoricalBootstrapReferenceScenario(legacy, settings))
    expect(runHistoricalBootstrapSimulation(disabled, settings)).toEqual(runHistoricalBootstrapSimulation(legacy, settings))
    // Unreviewed combined haircuts also stay untouched after opt-in.
    const unreviewed = { ...legacy, retirementInsurance: { ...insured.retirementInsurance!, portfolioBaseMonthlyToday: 0 } }
    expect(simulateHistoricalBootstrapReferenceScenario(unreviewed, settings)).toEqual(simulateHistoricalBootstrapReferenceScenario(legacy, settings))
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
