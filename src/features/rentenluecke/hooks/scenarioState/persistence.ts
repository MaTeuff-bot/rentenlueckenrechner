import { holdingSchema } from '../../model/capitalIncome/schema'
import { z } from 'zod'
import { rentenlueckeInputSchema } from '../../model/inputSchema'
import { getReturnSeriesCategory } from '../../model/historicalReturns'
import { calculateAllocationFromBuckets, calculatePortfolioBucketTotal } from '../../model/portfolioBuckets'
import { calculatePortfolioExpectedReturn } from '../../model/stochasticReturns'
import { normalizeRetirementIncomeStreamKinds } from '../../model/retirementIncomeStreams'
import { createDefaultState, withDeterministicPortfolioReturn } from './defaults'
import { normalizeHistoricalState } from './migrations'
import type { PersistedHistoricalState, ScenarioState } from './types'

export const STORAGE_KEY = 'rentenlueckenrechner.scenario.v13'
export const RESET_NOTICE_KEY = 'rentenlueckenrechner.gkv-v2-reset-notice'
const portfolioBucketSchema = z.object({
  holding: holdingSchema.optional(),
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
const persistedScenarioSchema = z.object({ version: z.literal(13), ...persistedScenarioFields })
export function loadInitialState(): ScenarioState {
  if (typeof localStorage === 'undefined') return createDefaultState()
  const oldKeys = Object.keys(localStorage).filter(key => /^rentenlueckenrechner\.scenario\.v(?:[1-9]|1[0-2])$/.test(key))
  if (oldKeys.length) {
    oldKeys.forEach(key => localStorage.removeItem(key))
    localStorage.setItem(RESET_NOTICE_KEY, '1')
  }
  return parsePersistedScenarioState(localStorage.getItem(STORAGE_KEY))
}

export function serializeScenarioState(state: ScenarioState): string {
  const allocation = calculateAllocationFromBuckets(state.portfolioBuckets)
  const input = withDeterministicPortfolioReturn(
    { ...state.input, retirementIncomeStreams: state.retirementIncomeStreams, currentCapital: calculatePortfolioBucketTotal(state.portfolioBuckets) },
    calculatePortfolioExpectedReturn(allocation),
  )
  return JSON.stringify({ version: 13, ...state, input })
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
  retirementIncomeStreams: ScenarioState['retirementIncomeStreams']
  historical: PersistedHistoricalState
}): ScenarioState {
  const allocation = calculateAllocationFromBuckets(persisted.portfolioBuckets)
  return {
    input: withDeterministicPortfolioReturn(
      { ...persisted.input, retirementIncomeStreams: normalizeRetirementIncomeStreamKinds(persisted.retirementIncomeStreams), currentCapital: calculatePortfolioBucketTotal(persisted.portfolioBuckets) },
      calculatePortfolioExpectedReturn(allocation),
    ),
    portfolioBuckets: persisted.portfolioBuckets,
    retirementIncomeStreams: normalizeRetirementIncomeStreamKinds(persisted.retirementIncomeStreams),
    historical: normalizeHistoricalState(persisted.historical),
  }
}
