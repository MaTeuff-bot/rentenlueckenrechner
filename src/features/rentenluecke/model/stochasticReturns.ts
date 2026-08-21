import { deriveSummary } from './deriveSummary'
import { rentenlueckeInputSchema } from './inputSchema'
import { normalizeInput } from './normalizeInput'
import { calculateRequiredCapitalAtRetirement } from './requiredCapital'
import { simulateAccumulationRows } from './simulateAccumulation'
import { simulateRetirementRows } from './simulateRetirement'
import { simulateScenario } from './simulateScenario'
import type { RentenlueckeInput, SimulationResult } from './types'

export type AssetClassKey = 'equity' | 'bonds' | 'fixed'
export type PortfolioComponentRole = 'equity' | 'bond' | 'cash' | 'other'

export type PortfolioComponent = {
  id: string
  label: string
  role: PortfolioComponentRole
  weight: number
  returnSeriesId?: string
}

export type AssetClassAssumption = {
  key: AssetClassKey
  label: string
  expectedAnnualReturn: number
  annualVolatility: number
}

export type AssetAllocation = Record<AssetClassKey, number>

export type StochasticSettings = {
  allocation: AssetAllocation
  simulations: number
  seed: number
}

export type StochasticPercentileRow = {
  ageStart: number
  ageEnd: number
  planCapitalToday: number
  p10CapitalToday: number
  p50CapitalToday: number
  p90CapitalToday: number
  depletionProbability: number
}

export type StochasticSimulationSummary = {
  simulations: number
  successProbability: number
  rows: StochasticPercentileRow[]
}

export const ASSET_CLASS_ASSUMPTIONS: AssetClassAssumption[] = [
  { key: 'equity', label: 'Aktien', expectedAnnualReturn: 0.07, annualVolatility: 0.18 },
  { key: 'bonds', label: 'Anleihen', expectedAnnualReturn: 0.03, annualVolatility: 0.07 },
  { key: 'fixed', label: 'Cash', expectedAnnualReturn: 0.02, annualVolatility: 0.01 },
]

export const DEFAULT_ASSET_ALLOCATION: AssetAllocation = {
  equity: 0.7,
  bonds: 0.2,
  fixed: 0.1,
}

export const DEFAULT_STOCHASTIC_SETTINGS: StochasticSettings = {
  allocation: DEFAULT_ASSET_ALLOCATION,
  simulations: 1_000,
  seed: 24_681_357,
}

export function createPortfolioComponents(
  allocation: AssetAllocation,
  returnSeriesIds: Partial<Record<PortfolioComponentRole, string>> = {},
): PortfolioComponent[] {
  return [
    {
      id: 'equity',
      label: 'Aktien',
      role: 'equity',
      weight: allocation.equity,
      returnSeriesId: returnSeriesIds.equity,
    },
    {
      id: 'bonds',
      label: 'Anleihen',
      role: 'bond',
      weight: allocation.bonds,
      returnSeriesId: returnSeriesIds.bond,
    },
    {
      id: 'fixed',
      label: 'Cash',
      role: 'cash',
      weight: allocation.fixed,
      returnSeriesId: returnSeriesIds.cash,
    },
  ]
}

export const ALLOCATION_RANGE_ERROR = 'Die Aufteilung muss je Anlageklasse zwischen 0 % und 100 % liegen.'
export const ALLOCATION_SUM_ERROR = 'Die Aufteilung muss zusammen 100 % ergeben.'

const ALLOCATION_TOLERANCE = 0.000_001

export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0

  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }
}

export function sampleNormal(rng: () => number, mean: number, volatility: number): number {
  if (volatility === 0) {
    return mean
  }

  const u1 = Math.max(rng(), Number.EPSILON)
  const u2 = rng()
  const standardNormal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)

  return mean + standardNormal * volatility
}

export function calculatePortfolioExpectedReturn(
  allocation: AssetAllocation,
  assumptions: AssetClassAssumption[] = ASSET_CLASS_ASSUMPTIONS,
): number {
  return assumptions.reduce((sum, assumption) => {
    return sum + allocation[assumption.key] * assumption.expectedAnnualReturn
  }, 0)
}

export function getAllocationValidationError(allocation: AssetAllocation): string | null {
  const values = [allocation.equity, allocation.bonds, allocation.fixed]
  if (values.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) {
    return ALLOCATION_RANGE_ERROR
  }

  const total = allocation.equity + allocation.bonds + allocation.fixed

  return Math.abs(total - 1) <= ALLOCATION_TOLERANCE ? null : ALLOCATION_SUM_ERROR
}

export function generatePortfolioReturnPath(
  years: number,
  allocation: AssetAllocation,
  assumptions: AssetClassAssumption[] = ASSET_CLASS_ASSUMPTIONS,
  rng: () => number,
): number[] {
  return Array.from({ length: years }, () => {
    return assumptions.reduce((portfolioReturn, assumption) => {
      const assetReturn = Math.max(
        -1,
        sampleNormal(rng, assumption.expectedAnnualReturn, assumption.annualVolatility),
      )

      return portfolioReturn + allocation[assumption.key] * assetReturn
    }, 0)
  })
}

export function simulateScenarioWithReturnPath(
  input: RentenlueckeInput,
  returnPath: number[],
  inflationPath?: number[],
): SimulationResult {
  const parsed = rentenlueckeInputSchema.parse(input)
  const scenario = normalizeInput(parsed)
  const getAnnualReturn = (yearIndex: number, phase: 'accumulation' | 'retirement') =>
    returnPath[yearIndex] ?? (phase === 'accumulation' ? scenario.annualReturnBeforeRetirement : scenario.annualReturnInRetirement)
  const getAnnualInflation = inflationPath
    ? (yearIndex: number) => inflationPath[yearIndex] ?? scenario.annualInflationRate
    : undefined
  const accumulationRows = simulateAccumulationRows(scenario, getAnnualReturn, getAnnualInflation)
  const projectedCapitalAtRetirement = accumulationRows.at(-1)?.closingCapital ?? scenario.currentCapital
  const retirementRows = simulateRetirementRows(scenario, projectedCapitalAtRetirement, getAnnualReturn, getAnnualInflation)
  const requiredCapitalAtRetirement = calculateRequiredCapitalAtRetirement(
    scenario,
    undefined,
    getAnnualInflation,
  )
  const summary = deriveSummary(
    scenario,
    projectedCapitalAtRetirement,
    requiredCapitalAtRetirement,
    retirementRows,
  )

  return {
    rows: [...accumulationRows, ...retirementRows],
    accumulationRows,
    retirementRows,
    summary,
  }
}

export function runStochasticSimulation(
  input: RentenlueckeInput,
  settings: StochasticSettings,
  assumptions: AssetClassAssumption[] = ASSET_CLASS_ASSUMPTIONS,
): StochasticSimulationSummary {
  const allocationError = getAllocationValidationError(settings.allocation)
  if (allocationError) {
    throw new Error(allocationError)
  }

  const deterministicResult = simulateScenario(input)
  const years = deterministicResult.rows.length
  const rng = createSeededRandom(settings.seed)
  const pathResults = Array.from({ length: settings.simulations }, () => {
    const returnPath = generatePortfolioReturnPath(years, settings.allocation, assumptions, rng)
    return simulateScenarioWithReturnPath(input, returnPath)
  })
  const successfulPaths = pathResults.filter((result) => result.summary.survivesUntilPlanningAge).length
  const rows = deterministicResult.rows.map((deterministicRow, rowIndex) => {
    const capitalValues = pathResults.map((result) => result.rows[rowIndex]?.closingCapitalToday ?? 0).sort((a, b) => a - b)
    const depletedCount = capitalValues.filter((value) => value <= 0).length

    return {
      ageStart: deterministicRow.ageStart,
      ageEnd: deterministicRow.ageEnd,
      planCapitalToday: deterministicRow.closingCapitalToday,
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
  }
}

function percentile(sortedValues: number[], percentileValue: number): number {
  if (sortedValues.length === 0) {
    return 0
  }

  const index = Math.round((sortedValues.length - 1) * percentileValue)
  return sortedValues[index]
}
