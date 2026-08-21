import { z } from 'zod'
import { rentenlueckeInputSchema } from '../../model/inputSchema'
import { calculatePortfolioExpectedReturn, DEFAULT_ASSET_ALLOCATION } from '../../model/stochasticReturns'
import { createDefaultState, createSyntheticHistoricalState, withDeterministicPortfolioReturn } from './defaults'
import { normalizeHistoricalState } from './migrations'
import type { PersistedHistoricalState, ScenarioState } from './types'

export const STORAGE_KEY = 'rentenlueckenrechner.scenario.v5'
const PREVIOUS_STORAGE_KEY = 'rentenlueckenrechner.scenario.v4'
const V3_STORAGE_KEY = 'rentenlueckenrechner.scenario.v3'
const V2_STORAGE_KEY = 'rentenlueckenrechner.scenario.v2'
const LEGACY_STORAGE_KEY = 'rentenlueckenrechner.scenario.v1'

const assetAllocationSchema = z.object({
  equity: z.number().finite().min(0).max(1),
  bonds: z.number().finite().min(0).max(1),
  fixed: z.number().finite().min(0).max(1),
})
const returnSeriesIdsSchema = z.object({ equity: z.string(), bond: z.string(), cash: z.string() })
const manualCashRealReturnSchema = z.number().finite().min(-0.5).max(0.5)

const persistedScenarioSchema = z.object({
  version: z.literal(5),
  input: rentenlueckeInputSchema,
  allocation: assetAllocationSchema,
  historical: z.object({
    returnSeriesIds: returnSeriesIdsSchema,
    inflationSourceId: z.string(),
    manualCashRealReturn: manualCashRealReturnSchema,
  }),
})
const v4PersistedScenarioSchema = z.object({
  version: z.literal(4),
  input: rentenlueckeInputSchema,
  allocation: assetAllocationSchema,
  historical: z.object({
    returnSeriesIds: returnSeriesIdsSchema,
    inflationSeriesId: z.string(),
    manualCashRealReturn: manualCashRealReturnSchema,
  }),
})
const v3PersistedScenarioSchema = z.object({
  version: z.literal(3),
  input: rentenlueckeInputSchema,
  allocation: assetAllocationSchema,
  returnModel: z.enum(['synthetic', 'historicalAnnualBootstrap']).optional(),
  historical: z
    .object({
      returnSeriesIds: returnSeriesIdsSchema,
      inflationSeriesId: z.string(),
      manualCashRealReturn: manualCashRealReturnSchema,
    })
    .optional(),
})
const v2PersistedScenarioSchema = z.object({
  version: z.literal(2),
  input: rentenlueckeInputSchema,
  allocation: assetAllocationSchema,
})
const legacyPersistedScenarioSchema = z.object({ version: z.literal(1), input: rentenlueckeInputSchema })

export function loadInitialState(): ScenarioState {
  if (typeof localStorage === 'undefined') return createDefaultState()
  const stored = localStorage.getItem(STORAGE_KEY)
    ?? localStorage.getItem(PREVIOUS_STORAGE_KEY)
    ?? localStorage.getItem(V3_STORAGE_KEY)
    ?? localStorage.getItem(V2_STORAGE_KEY)
    ?? localStorage.getItem(LEGACY_STORAGE_KEY)
  return parsePersistedScenarioState(stored)
}

export function serializeScenarioState(state: ScenarioState): string {
  return JSON.stringify({ version: 5, ...state })
}

export function parsePersistedScenarioState(stored: string | null): ScenarioState {
  if (!stored) return createDefaultState()
  try {
    const parsed: unknown = JSON.parse(stored)
    const persisted = persistedScenarioSchema.safeParse(parsed)
    if (persisted.success) return stateWithDerivedReturn(persisted.data)

    const v4Persisted = v4PersistedScenarioSchema.safeParse(parsed)
    if (v4Persisted.success) return stateWithDerivedReturn(v4Persisted.data)

    const v3Persisted = v3PersistedScenarioSchema.safeParse(parsed)
    if (v3Persisted.success) {
      return {
        input: withDeterministicPortfolioReturn(
          v3Persisted.data.input,
          calculatePortfolioExpectedReturn(v3Persisted.data.allocation),
        ),
        allocation: v3Persisted.data.allocation,
        historical: v3Persisted.data.returnModel === 'synthetic'
          ? createSyntheticHistoricalState()
          : normalizeHistoricalState(v3Persisted.data.historical),
      }
    }

    const v2Persisted = v2PersistedScenarioSchema.safeParse(parsed)
    if (v2Persisted.success) {
      return {
        input: withDeterministicPortfolioReturn(
          v2Persisted.data.input,
          calculatePortfolioExpectedReturn(v2Persisted.data.allocation),
        ),
        allocation: v2Persisted.data.allocation,
        historical: createSyntheticHistoricalState(),
      }
    }

    const legacyPersisted = legacyPersistedScenarioSchema.safeParse(parsed)
    if (legacyPersisted.success) {
      return {
        input: withDeterministicPortfolioReturn(
          legacyPersisted.data.input,
          calculatePortfolioExpectedReturn(DEFAULT_ASSET_ALLOCATION),
        ),
        allocation: DEFAULT_ASSET_ALLOCATION,
        historical: createSyntheticHistoricalState(),
      }
    }
    return createDefaultState()
  } catch {
    return createDefaultState()
  }
}

function stateWithDerivedReturn(persisted: {
  input: ScenarioState['input']
  allocation: ScenarioState['allocation']
  historical: PersistedHistoricalState
}): ScenarioState {
  return {
    input: withDeterministicPortfolioReturn(
      persisted.input,
      calculatePortfolioExpectedReturn(persisted.allocation),
    ),
    allocation: persisted.allocation,
    historical: normalizeHistoricalState(persisted.historical),
  }
}
