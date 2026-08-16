import { useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import { DEFAULT_INPUT } from '../model/defaults'
import {
  DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
  DEFAULT_HISTORICAL_RETURN_SERIES_IDS,
  FIXED_INFLATION_SOURCE_ID,
  SYNTHETIC_RETURN_SERIES_IDS,
  findInflationSeries,
  findInflationSourceOption,
  getValidHistoricalYears,
  runHistoricalBootstrapSimulation,
  simulateHistoricalBootstrapReferenceScenario,
} from '../model/historicalReturns'
import { getFieldErrors, rentenlueckeInputSchema, type InputFieldName } from '../model/inputSchema'
import {
  calculatePortfolioExpectedReturn,
  createPortfolioComponents,
  DEFAULT_ASSET_ALLOCATION,
  DEFAULT_STOCHASTIC_SETTINGS,
  getAllocationValidationError,
  type AssetAllocation,
  type AssetClassKey,
} from '../model/stochasticReturns'
import type { RentenlueckeInput } from '../model/types'

const STORAGE_KEY = 'rentenlueckenrechner.scenario.v5'
const PREVIOUS_STORAGE_KEY = 'rentenlueckenrechner.scenario.v4'
const V3_STORAGE_KEY = 'rentenlueckenrechner.scenario.v3'
const V2_STORAGE_KEY = 'rentenlueckenrechner.scenario.v2'
const LEGACY_STORAGE_KEY = 'rentenlueckenrechner.scenario.v1'

const PROVISIONAL_RETURN_SERIES_ID_MIGRATIONS = {
  'fixture-global-equity-eur-provisional': DEFAULT_HISTORICAL_RETURN_SERIES_IDS.equity,
  'fixture-eur-bonds-provisional': DEFAULT_HISTORICAL_RETURN_SERIES_IDS.bond,
  'fixture-eur-cash-provisional': DEFAULT_HISTORICAL_RETURN_SERIES_IDS.cash,
} as const

const PROVISIONAL_INFLATION_SERIES_ID_MIGRATIONS = {
  'fixture-de-eur-inflation-provisional': DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
} as const

const assetAllocationSchema = z.object({
  equity: z.number().finite().min(0).max(1),
  bonds: z.number().finite().min(0).max(1),
  fixed: z.number().finite().min(0).max(1),
})

const persistedScenarioSchema = z.object({
  version: z.literal(5),
  input: rentenlueckeInputSchema,
  allocation: assetAllocationSchema,
  historical: z.object({
    returnSeriesIds: z.object({
      equity: z.string(),
      bond: z.string(),
      cash: z.string(),
    }),
    inflationSourceId: z.string(),
    manualCashRealReturn: z.number().finite().min(-0.5).max(0.5),
  }),
})

const v4PersistedScenarioSchema = z.object({
  version: z.literal(4),
  input: rentenlueckeInputSchema,
  allocation: assetAllocationSchema,
  historical: z.object({
    returnSeriesIds: z.object({
      equity: z.string(),
      bond: z.string(),
      cash: z.string(),
    }),
    inflationSeriesId: z.string(),
    manualCashRealReturn: z.number().finite().min(-0.5).max(0.5),
  }),
})

const v3PersistedScenarioSchema = z.object({
  version: z.literal(3),
  input: rentenlueckeInputSchema,
  allocation: assetAllocationSchema,
  returnModel: z.enum(['synthetic', 'historicalAnnualBootstrap']).optional(),
  historical: z
    .object({
      returnSeriesIds: z.object({
        equity: z.string(),
        bond: z.string(),
        cash: z.string(),
      }),
      inflationSeriesId: z.string(),
      manualCashRealReturn: z.number().finite().min(-0.5).max(0.5),
    })
    .optional(),
})

const v2PersistedScenarioSchema = z.object({
  version: z.literal(2),
  input: rentenlueckeInputSchema,
  allocation: assetAllocationSchema,
})

const legacyPersistedScenarioSchema = z.object({
  version: z.literal(1),
  input: rentenlueckeInputSchema,
})

export function useScenarioState() {
  const [state, setState] = useState(loadInitialState)
  const { input, allocation, historical } = state

  const parsedInput = useMemo(() => rentenlueckeInputSchema.safeParse(input), [input])
  const allocationError = useMemo(() => getAllocationValidationError(allocation), [allocation])
  const fieldErrors = useMemo<Partial<Record<InputFieldName, string>>>(() => {
    return parsedInput.success ? {} : getFieldErrors(parsedInput.error)
  }, [parsedInput])
  const isValid = parsedInput.success && !allocationError
  const historicalSettings = useMemo(
    () => ({
      portfolioComponents: createPortfolioComponents(allocation, historical.returnSeriesIds),
      inflationSourceId: historical.inflationSourceId,
      manualCashRealReturn: historical.manualCashRealReturn,
      simulations: DEFAULT_STOCHASTIC_SETTINGS.simulations,
    }),
    [allocation, historical],
  )
  const historicalValidYears = useMemo(() => {
    const inflationSource = findInflationSourceOption(historical.inflationSourceId, input.annualInflationRate)
    return inflationSource ? getValidHistoricalYears(historicalSettings.portfolioComponents, inflationSource) : []
  }, [historical.inflationSourceId, historicalSettings.portfolioComponents, input.annualInflationRate])
  const result = useMemo(() => {
    if (!isValid || !parsedInput.success) {
      return null
    }

    return simulateHistoricalBootstrapReferenceScenario(parsedInput.data, historicalSettings)
  }, [historicalSettings, isValid, parsedInput])
  const stochasticSummary = useMemo(() => {
    if (!isValid || !parsedInput.success) {
      return null
    }

    return runHistoricalBootstrapSimulation(parsedInput.data, historicalSettings)
  }, [historicalSettings, isValid, parsedInput])

  useEffect(() => {
    if (!isValid || !parsedInput.success) {
      return
    }

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 5, input: parsedInput.data, allocation, historical }),
    )
  }, [allocation, historical, isValid, parsedInput])

  const updateField = (field: InputFieldName, value: number) => {
    setState((current) => ({ ...current, input: { ...current.input, [field]: value } }))
  }

  const updateAllocation = (field: AssetClassKey, value: number) => {
    setState((current) => {
      const allocation = { ...current.allocation, [field]: value }
      const derivedReturn = calculatePortfolioExpectedReturn(allocation)

      return {
        ...current,
        allocation,
        input: withDeterministicPortfolioReturn(current.input, derivedReturn),
      }
    })
  }

  const updateHistoricalReturnSeries = (role: 'equity' | 'bond' | 'cash', seriesId: string) => {
    setState((current) => ({
      ...current,
      historical: {
        ...current.historical,
        returnSeriesIds: { ...current.historical.returnSeriesIds, [role]: seriesId },
      },
    }))
  }

  const updateManualCashRealReturn = (value: number) => {
    setState((current) => ({
      ...current,
      historical: { ...current.historical, manualCashRealReturn: value },
    }))
  }

  const updateInflationSource = (sourceId: string) => {
    setState((current) => ({
      ...current,
      historical: { ...current.historical, inflationSourceId: sourceId },
    }))
  }

  const reset = () => {
    const nextState = createDefaultState()
    setState(nextState)
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 5, ...nextState }))
  }

  return {
    input,
    allocation,
    historical,
    historicalSettings,
    historicalValidYears,
    fieldErrors,
    allocationError,
    isValid,
    result,
    stochasticSummary,
    updateField,
    updateAllocation,
    updateHistoricalReturnSeries,
    updateManualCashRealReturn,
    updateInflationSource,
    reset,
  }
}

type ScenarioState = {
  input: RentenlueckeInput
  allocation: AssetAllocation
  historical: {
    returnSeriesIds: {
      equity: string
      bond: string
      cash: string
    }
    inflationSourceId: string
    manualCashRealReturn: number
  }
}

type PersistedHistoricalState = {
  returnSeriesIds: {
    equity: string
    bond: string
    cash: string
  }
  inflationSourceId?: string
  inflationSeriesId?: string
  manualCashRealReturn: number
}

function loadInitialState(): ScenarioState {
  if (typeof localStorage === 'undefined') {
    return createDefaultState()
  }

  const stored =
    localStorage.getItem(STORAGE_KEY) ??
    localStorage.getItem(PREVIOUS_STORAGE_KEY) ??
    localStorage.getItem(V3_STORAGE_KEY) ??
    localStorage.getItem(V2_STORAGE_KEY) ??
    localStorage.getItem(LEGACY_STORAGE_KEY)
  if (!stored) {
    return createDefaultState()
  }

  try {
    const parsed = JSON.parse(stored)
    const persisted = persistedScenarioSchema.safeParse(parsed)
    if (persisted.success) {
      const derivedReturn = calculatePortfolioExpectedReturn(persisted.data.allocation)
      return {
        input: withDeterministicPortfolioReturn(persisted.data.input, derivedReturn),
        allocation: persisted.data.allocation,
        historical: normalizeHistoricalState(persisted.data.historical),
      }
    }

    const v4Persisted = v4PersistedScenarioSchema.safeParse(parsed)
    if (v4Persisted.success) {
      const derivedReturn = calculatePortfolioExpectedReturn(v4Persisted.data.allocation)
      return {
        input: withDeterministicPortfolioReturn(v4Persisted.data.input, derivedReturn),
        allocation: v4Persisted.data.allocation,
        historical: normalizeHistoricalState(v4Persisted.data.historical),
      }
    }

    const v3Persisted = v3PersistedScenarioSchema.safeParse(parsed)
    if (v3Persisted.success) {
      const derivedReturn = calculatePortfolioExpectedReturn(v3Persisted.data.allocation)
      return {
        input: withDeterministicPortfolioReturn(v3Persisted.data.input, derivedReturn),
        allocation: v3Persisted.data.allocation,
        historical:
          v3Persisted.data.returnModel === 'synthetic'
            ? createSyntheticHistoricalState()
            : normalizeHistoricalState(v3Persisted.data.historical),
      }
    }

    const v2Persisted = v2PersistedScenarioSchema.safeParse(parsed)
    if (v2Persisted.success) {
      const derivedReturn = calculatePortfolioExpectedReturn(v2Persisted.data.allocation)
      return {
        input: withDeterministicPortfolioReturn(v2Persisted.data.input, derivedReturn),
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

function createDefaultState(): ScenarioState {
  return {
    input: withDeterministicPortfolioReturn(DEFAULT_INPUT, calculatePortfolioExpectedReturn(DEFAULT_ASSET_ALLOCATION)),
    allocation: DEFAULT_ASSET_ALLOCATION,
    historical: createDefaultHistoricalState(),
  }
}

function createDefaultHistoricalState(): ScenarioState['historical'] {
  return {
    returnSeriesIds: DEFAULT_HISTORICAL_RETURN_SERIES_IDS,
    inflationSourceId: DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
    manualCashRealReturn: 0,
  }
}

function createSyntheticHistoricalState(): ScenarioState['historical'] {
  return {
    returnSeriesIds: SYNTHETIC_RETURN_SERIES_IDS,
    inflationSourceId: FIXED_INFLATION_SOURCE_ID,
    manualCashRealReturn: 0,
  }
}

function normalizeHistoricalState(historical: PersistedHistoricalState | undefined): ScenarioState['historical'] {
  if (!historical) {
    return createDefaultHistoricalState()
  }

  return {
    ...historical,
    returnSeriesIds: {
      equity: migrateProvisionalReturnSeriesId('equity', historical.returnSeriesIds.equity),
      bond: migrateProvisionalReturnSeriesId('bond', historical.returnSeriesIds.bond),
      cash: migrateProvisionalReturnSeriesId('cash', historical.returnSeriesIds.cash),
    },
    inflationSourceId: normalizeInflationSourceId(
      historical.inflationSourceId ?? historical.inflationSeriesId ?? DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
    ),
  }
}

function migrateProvisionalReturnSeriesId(role: 'equity' | 'bond' | 'cash', id: string): string {
  return id in PROVISIONAL_RETURN_SERIES_ID_MIGRATIONS ? DEFAULT_HISTORICAL_RETURN_SERIES_IDS[role] : id
}

function migrateProvisionalInflationSeriesId(id: string): string {
  return PROVISIONAL_INFLATION_SERIES_ID_MIGRATIONS[id as keyof typeof PROVISIONAL_INFLATION_SERIES_ID_MIGRATIONS] ?? id
}

function normalizeInflationSourceId(id: string): string {
  const migratedId = migrateProvisionalInflationSeriesId(id)

  return migratedId === FIXED_INFLATION_SOURCE_ID || findInflationSeries(migratedId)
    ? migratedId
    : DEFAULT_HISTORICAL_INFLATION_SERIES_ID
}

function withDeterministicPortfolioReturn(input: RentenlueckeInput, annualReturn: number): RentenlueckeInput {
  return {
    ...input,
    annualReturnBeforeRetirement: annualReturn,
    annualReturnInRetirement: annualReturn,
  }
}
