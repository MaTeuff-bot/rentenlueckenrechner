import { z } from 'zod'
import { rentenlueckeInputSchema } from '../../model/inputSchema'
import { calculateAllocationFromBuckets, calculatePortfolioBucketTotal } from '../../model/portfolioBuckets'
import { calculatePortfolioExpectedReturn } from '../../model/stochasticReturns'
import { createDefaultState, withDeterministicPortfolioReturn } from './defaults'
import { normalizeHistoricalState } from './migrations'
import type { PersistedHistoricalState, ScenarioState } from './types'

export const STORAGE_KEY = 'rentenlueckenrechner.scenario.v7'
const V6_STORAGE_KEY = 'rentenlueckenrechner.scenario.v6'
const V5_STORAGE_KEY = 'rentenlueckenrechner.scenario.v5'
const V4_STORAGE_KEY = 'rentenlueckenrechner.scenario.v4'
const V3_STORAGE_KEY = 'rentenlueckenrechner.scenario.v3'
const V2_STORAGE_KEY = 'rentenlueckenrechner.scenario.v2'
const LEGACY_STORAGE_KEY = 'rentenlueckenrechner.scenario.v1'

const returnSeriesIdsSchema = z.object({ equity: z.string(), bond: z.string(), cash: z.string() })
const manualCashRealReturnSchema = z.number().finite().min(-0.5).max(0.5)
const portfolioBucketSchema = z.object({
  id: z.string(),
  name: z.string(),
  value: z.number().finite().min(0),
  role: z.enum(['equity', 'bond', 'cash']),
})

const persistedScenarioFields = {
  input: rentenlueckeInputSchema,
  portfolioBuckets: z.array(portfolioBucketSchema),
  historical: z.object({
    returnSeriesIds: returnSeriesIdsSchema,
    inflationSourceId: z.string(),
    manualCashRealReturn: manualCashRealReturnSchema,
  }),
}
const persistedScenarioSchema = z.object({ version: z.literal(7), ...persistedScenarioFields })
const persistedV6ScenarioSchema = z.object({
  version: z.literal(6),
  ...persistedScenarioFields,
  allocation: z.unknown().optional(),
})
export function loadInitialState(): ScenarioState {
  if (typeof localStorage === 'undefined') return createDefaultState()
  const stored = localStorage.getItem(STORAGE_KEY)
    ?? localStorage.getItem(V6_STORAGE_KEY)
    ?? localStorage.getItem(V5_STORAGE_KEY)
    ?? localStorage.getItem(V4_STORAGE_KEY)
    ?? localStorage.getItem(V3_STORAGE_KEY)
    ?? localStorage.getItem(V2_STORAGE_KEY)
    ?? localStorage.getItem(LEGACY_STORAGE_KEY)
  return parsePersistedScenarioState(stored)
}

export function serializeScenarioState(state: ScenarioState): string {
  const allocation = calculateAllocationFromBuckets(state.portfolioBuckets)
  const input = withDeterministicPortfolioReturn(
    { ...state.input, currentCapital: calculatePortfolioBucketTotal(state.portfolioBuckets) },
    calculatePortfolioExpectedReturn(allocation),
  )
  return JSON.stringify({ version: 7, ...state, input })
}

export function parsePersistedScenarioState(stored: string | null): ScenarioState {
  if (!stored) return createDefaultState()
  try {
    const parsed: unknown = JSON.parse(stored)
    const persisted = persistedScenarioSchema.safeParse(parsed)
    if (persisted.success) return stateWithDerivedReturn(persisted.data)
    const persistedV6 = persistedV6ScenarioSchema.safeParse(parsed)
    if (persistedV6.success) return stateWithDerivedReturn(persistedV6.data)

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
