import { z } from 'zod'
import { rentenlueckeInputSchema } from '../../model/inputSchema'
import { getReturnSeriesCategory } from '../../model/historicalReturns'
import { calculateAllocationFromBuckets, calculatePortfolioBucketTotal } from '../../model/portfolioBuckets'
import { calculatePortfolioExpectedReturn } from '../../model/stochasticReturns'
import { normalizeRetirementIncomeStreamKinds } from '../../model/retirementIncomeStreams'
import { createDefaultState, withDeterministicPortfolioReturn } from './defaults'
import { migrateV10RetirementIncome, normalizeHistoricalState } from './migrations'
import type { PersistedHistoricalState, ScenarioState } from './types'

export const STORAGE_KEY = 'rentenlueckenrechner.scenario.v12'
export const PREVIOUS_STORAGE_KEY = 'rentenlueckenrechner.scenario.v11'
export const LEGACY_STORAGE_KEY = 'rentenlueckenrechner.scenario.v10'
const portfolioBucketSchema = z.object({
  id: z.string(),
  name: z.string(),
  value: z.number().finite().min(0),
  returnSeriesId: z.string().refine((id) => getReturnSeriesCategory(id) !== undefined),
  annualCostRate: z.number().finite().min(0).max(1).default(0),
})

const persistedScenarioFields = {
  input: rentenlueckeInputSchema,
  retirementIncomeStreams: rentenlueckeInputSchema.shape.retirementIncomeStreams.unwrap(),
  portfolioBuckets: z.array(portfolioBucketSchema),
  historical: z.object({
    inflationSourceId: z.string(),
  }),
}
const persistedScenarioSchema = z.object({ version: z.literal(12), ...persistedScenarioFields })
const persistedV11ScenarioSchema = z.object({ version: z.literal(11), ...persistedScenarioFields })
const persistedV10ScenarioSchema = z.object({
  version: z.literal(10),
  input: rentenlueckeInputSchema,
  portfolioBuckets: z.array(portfolioBucketSchema),
  historical: z.object({ inflationSourceId: z.string().optional(), inflationSeriesId: z.string().optional() }),
})
export function loadInitialState(): ScenarioState {
  if (typeof localStorage === 'undefined') return createDefaultState()
  const stored = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(PREVIOUS_STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY)
  return parsePersistedScenarioState(stored)
}

export function serializeScenarioState(state: ScenarioState): string {
  const allocation = calculateAllocationFromBuckets(state.portfolioBuckets)
  const input = withDeterministicPortfolioReturn(
    { ...state.input, currentCapital: calculatePortfolioBucketTotal(state.portfolioBuckets) },
    calculatePortfolioExpectedReturn(allocation),
  )
  return JSON.stringify({ version: 12, ...state, input })
}

export function parsePersistedScenarioState(stored: string | null): ScenarioState {
  if (!stored) return createDefaultState()
  try {
    const parsed: unknown = JSON.parse(stored)
    const persisted = persistedScenarioSchema.safeParse(parsed)
    if (persisted.success) return stateWithDerivedReturn(persisted.data)
    const previous = persistedV11ScenarioSchema.safeParse(parsed)
    // Additive migration: absence of insurance remains disabled; all-in haircuts retain their meaning.
    if (previous.success) return stateWithDerivedReturn(previous.data)
    const legacy = persistedV10ScenarioSchema.safeParse(parsed)
    if (legacy.success) return stateWithDerivedReturn({
      ...legacy.data,
      retirementIncomeStreams: migrateV10RetirementIncome(legacy.data.input),
    })
    return createDefaultState()
  } catch {
    return createDefaultState()
  }
}

function stateWithDerivedReturn(persisted: {
  input: ScenarioState['input']
  portfolioBuckets: ScenarioState['portfolioBuckets']
  retirementIncomeStreams: ScenarioState['retirementIncomeStreams']
  historical: PersistedHistoricalState
}): ScenarioState {
  const allocation = calculateAllocationFromBuckets(persisted.portfolioBuckets)
  return {
    input: withDeterministicPortfolioReturn(
      { ...persisted.input, currentCapital: calculatePortfolioBucketTotal(persisted.portfolioBuckets) },
      calculatePortfolioExpectedReturn(allocation),
    ),
    portfolioBuckets: persisted.portfolioBuckets,
    retirementIncomeStreams: normalizeRetirementIncomeStreamKinds(persisted.retirementIncomeStreams),
    historical: normalizeHistoricalState(persisted.historical),
  }
}
