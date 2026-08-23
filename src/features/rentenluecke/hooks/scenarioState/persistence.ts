import { z } from 'zod'
import { rentenlueckeInputSchema } from '../../model/inputSchema'
import { getReturnSeriesCategory } from '../../model/historicalReturns'
import { calculateAllocationFromBuckets, calculatePortfolioBucketTotal } from '../../model/portfolioBuckets'
import { calculatePortfolioExpectedReturn } from '../../model/stochasticReturns'
import { createDefaultState, withDeterministicPortfolioReturn } from './defaults'
import { normalizeHistoricalState } from './migrations'
import type { PersistedHistoricalState, ScenarioState } from './types'

export const STORAGE_KEY = 'rentenlueckenrechner.scenario.v9'
const portfolioBucketSchema = z.object({
  id: z.string(),
  name: z.string(),
  value: z.number().finite().min(0),
  returnSeriesId: z.string().refine((id) => getReturnSeriesCategory(id) !== undefined),
})

const persistedScenarioFields = {
  input: rentenlueckeInputSchema,
  portfolioBuckets: z.array(portfolioBucketSchema),
  historical: z.object({
    inflationSourceId: z.string(),
  }),
}
const persistedScenarioSchema = z.object({ version: z.literal(9), ...persistedScenarioFields })
export function loadInitialState(): ScenarioState {
  if (typeof localStorage === 'undefined') return createDefaultState()
  const stored = localStorage.getItem(STORAGE_KEY)
  return parsePersistedScenarioState(stored)
}

export function serializeScenarioState(state: ScenarioState): string {
  const allocation = calculateAllocationFromBuckets(state.portfolioBuckets)
  const input = withDeterministicPortfolioReturn(
    { ...state.input, currentCapital: calculatePortfolioBucketTotal(state.portfolioBuckets) },
    calculatePortfolioExpectedReturn(allocation),
  )
  return JSON.stringify({ version: 9, ...state, input })
}

export function parsePersistedScenarioState(stored: string | null): ScenarioState {
  if (!stored) return createDefaultState()
  try {
    const parsed: unknown = JSON.parse(stored)
    const persisted = persistedScenarioSchema.safeParse(parsed)
    if (persisted.success) return stateWithDerivedReturn(persisted.data)
    return createDefaultState()
  } catch {
    return createDefaultState()
  }
}

function stateWithDerivedReturn(persisted: {
  input: ScenarioState['input']
  portfolioBuckets: ScenarioState['portfolioBuckets']
  historical: PersistedHistoricalState
}): ScenarioState {
  const allocation = calculateAllocationFromBuckets(persisted.portfolioBuckets)
  return {
    input: withDeterministicPortfolioReturn(
      { ...persisted.input, currentCapital: calculatePortfolioBucketTotal(persisted.portfolioBuckets) },
      calculatePortfolioExpectedReturn(allocation),
    ),
    portfolioBuckets: persisted.portfolioBuckets,
    historical: normalizeHistoricalState(persisted.historical),
  }
}
