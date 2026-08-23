import { simulateScenario } from '../simulateScenario'
import { createSeededRandom, simulateScenarioWithReturnPath } from '../stochasticReturns'
import type { RentenlueckeInput } from '../types'
import {
  generateHistoricalInflationPath,
  generateHistoricalReturnPath,
  sampleHistoricalYearsForPath,
} from './bootstrapSampling'
import { calculateExpectedAnnualReturnForSelection } from './expectedReturns'
import { createHistoricalBootstrapSeed } from './seed'
import { getRequiredInflationSource, getValidHistoricalYears } from './sourceOptions'
import type {
  HistoricalBootstrapScenarioResult,
  HistoricalBootstrapSettings,
  HistoricalBootstrapSimulationSummary,
} from './types'

export function simulateHistoricalBootstrapScenario(
  input: RentenlueckeInput,
  settings: HistoricalBootstrapSettings,
): HistoricalBootstrapScenarioResult {
  const inflationSource = getRequiredInflationSource(settings.inflationSourceId, input.annualInflationRate)
  const validYears = getValidHistoricalYears(settings.portfolioComponents, inflationSource)
  const baseline = simulateScenarioWithReturnPath(input, [])
  const seed = createHistoricalBootstrapSeed(input, { ...settings, simulations: 1 })
  const sampledYears = sampleHistoricalYearsForPath(settings.portfolioComponents, inflationSource, validYears, baseline.rows.length, seed)
  const returnPath = generateHistoricalReturnPath(
    settings.portfolioComponents,
    inflationSource,
    sampledYears,
    createSeededRandom(seed),
  )
  const inflationPath = generateHistoricalInflationPath(inflationSource, sampledYears)

  return {
    ...simulateScenarioWithReturnPath(input, returnPath, inflationPath),
    metadata: { validYears, sampledYears, seed },
  }
}

export function simulateHistoricalBootstrapReferenceScenario(
  input: RentenlueckeInput,
  settings: HistoricalBootstrapSettings,
): HistoricalBootstrapScenarioResult {
  const inflationSource = getRequiredInflationSource(settings.inflationSourceId, input.annualInflationRate)
  const baseline = simulateScenario(input)
  const validYears = getValidHistoricalYears(settings.portfolioComponents, inflationSource)
  const seed = createHistoricalBootstrapSeed(input, { ...settings, simulations: 1 })
  const sampledYears = sampleHistoricalYearsForPath(
    settings.portfolioComponents,
    inflationSource,
    validYears,
    baseline.rows.length,
    seed,
  )

  const expectedAnnualReturn = calculateExpectedAnnualReturnForSelection(input, settings)
  const expectedReturnPath = Array.from({ length: baseline.rows.length }, () => expectedAnnualReturn)

  return {
    ...simulateScenarioWithReturnPath(input, expectedReturnPath, generateHistoricalInflationPath(inflationSource, sampledYears)),
    metadata: { validYears, sampledYears, seed },
  }
}

export function runHistoricalBootstrapSimulation(
  input: RentenlueckeInput,
  settings: HistoricalBootstrapSettings,
): HistoricalBootstrapSimulationSummary {
  const inflationSource = getRequiredInflationSource(settings.inflationSourceId, input.annualInflationRate)
  const baseline = simulateScenario(input)
  const validYears = getValidHistoricalYears(settings.portfolioComponents, inflationSource)
  const years = baseline.rows.length
  const seed = createHistoricalBootstrapSeed(input, settings)
  const rng = createSeededRandom(seed)
  const referenceSampledYears = sampleHistoricalYearsForPath(
    settings.portfolioComponents,
    inflationSource,
    validYears,
    years,
    createHistoricalBootstrapSeed(input, { ...settings, simulations: 1 }),
  )
  const referenceResult = simulateHistoricalBootstrapReferenceScenario(input, settings)
  const pathResults = Array.from({ length: settings.simulations }, () => {
    const pathSeed = Math.floor(rng() * 4_294_967_296)
    const returnSeed = Math.floor(rng() * 4_294_967_296)
    const sampledYears = sampleHistoricalYearsForPath(settings.portfolioComponents, inflationSource, validYears, years, pathSeed)
    const returnPath = generateHistoricalReturnPath(
      settings.portfolioComponents,
      inflationSource,
      sampledYears,
      createSeededRandom(returnSeed),
    )
    const inflationPath = generateHistoricalInflationPath(inflationSource, sampledYears)

    return simulateScenarioWithReturnPath(input, returnPath, inflationPath)
  })
  const successfulPaths = pathResults.filter((result) => result.summary.survivesUntilPlanningAge).length
  const rows = referenceResult.rows.map((referenceRow, rowIndex) => {
    const capitalValues = pathResults.map((result) => result.rows[rowIndex]?.closingCapitalToday ?? 0).sort((a, b) => a - b)
    const depletedCount = capitalValues.filter((value) => value <= 0).length

    return {
      ageStart: referenceRow.ageStart,
      ageEnd: referenceRow.ageEnd,
      planCapitalToday: referenceRow.closingCapitalToday,
      p10CapitalToday: percentile(capitalValues, 0.1),
      p50CapitalToday: percentile(capitalValues, 0.5),
      p90CapitalToday: percentile(capitalValues, 0.9),
      depletionProbability: depletedCount / settings.simulations,
    }
  })

  return {
    simulations: settings.simulations,
    successProbability: successfulPaths / settings.simulations,
    rows,
    metadata: {
      validYears,
      sampledYears: referenceSampledYears,
      seed,
    },
  }
}

function percentile(sortedValues: number[], percentileValue: number): number {
  if (sortedValues.length === 0) {
    return 0
  }

  const index = Math.round((sortedValues.length - 1) * percentileValue)
  return sortedValues[index]
}
