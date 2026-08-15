import { useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import { DEFAULT_INPUT } from '../model/defaults'
import {
  DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
  DEFAULT_HISTORICAL_RETURN_SERIES_IDS,
  findInflationSeries,
  getValidHistoricalYears,
  runHistoricalBootstrapSimulation,
  simulateHistoricalBootstrapScenario,
  type ReturnModel,
} from '../model/historicalReturns'
import { getFieldErrors, rentenlueckeInputSchema, type InputFieldName } from '../model/inputSchema'
import { simulateScenario } from '../model/simulateScenario'
import {
  calculatePortfolioExpectedReturn,
  createPortfolioComponents,
  DEFAULT_ASSET_ALLOCATION,
  DEFAULT_STOCHASTIC_SETTINGS,
  getAllocationValidationError,
  runStochasticSimulation,
  type AssetAllocation,
  type AssetClassKey,
} from '../model/stochasticReturns'
import type { RentenlueckeInput } from '../model/types'

const STORAGE_KEY = 'rentenlueckenrechner.scenario.v3'
const PREVIOUS_STORAGE_KEY = 'rentenlueckenrechner.scenario.v2'
const LEGACY_STORAGE_KEY = 'rentenlueckenrechner.scenario.v1'

const assetAllocationSchema = z.object({
  equity: z.number().finite().min(0).max(1),
  bonds: z.number().finite().min(0).max(1),
  fixed: z.number().finite().min(0).max(1),
})

const persistedScenarioSchema = z.object({
  version: z.literal(3),
  input: rentenlueckeInputSchema,
  allocation: assetAllocationSchema,
  returnModel: z.enum(['synthetic', 'historicalAnnualBootstrap']),
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

const previousPersistedScenarioSchema = z.object({
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
  const { input, allocation, returnModel, historical } = state

  const parsedInput = useMemo(() => rentenlueckeInputSchema.safeParse(input), [input])
  const allocationError = useMemo(() => getAllocationValidationError(allocation), [allocation])
  const fieldErrors = useMemo<Partial<Record<InputFieldName, string>>>(() => {
    return parsedInput.success ? {} : getFieldErrors(parsedInput.error)
  }, [parsedInput])
  const isValid = parsedInput.success && !allocationError
  const historicalSettings = useMemo(
    () => ({
      portfolioComponents: createPortfolioComponents(allocation, historical.returnSeriesIds),
      inflationSeriesId: historical.inflationSeriesId,
      manualCashRealReturn: historical.manualCashRealReturn,
      simulations: DEFAULT_STOCHASTIC_SETTINGS.simulations,
    }),
    [allocation, historical],
  )
  const historicalValidYears = useMemo(() => {
    const inflationSeries = findInflationSeries(historical.inflationSeriesId)
    return inflationSeries ? getValidHistoricalYears(historicalSettings.portfolioComponents, inflationSeries) : []
  }, [historical.inflationSeriesId, historicalSettings.portfolioComponents])
  const result = useMemo(() => {
    if (!isValid || !parsedInput.success) {
      return null
    }

    return returnModel === 'historicalAnnualBootstrap'
      ? simulateHistoricalBootstrapScenario(parsedInput.data, historicalSettings)
      : simulateScenario(parsedInput.data)
  }, [historicalSettings, isValid, parsedInput, returnModel])
  const stochasticSummary = useMemo(() => {
    if (!isValid || !parsedInput.success) {
      return null
    }

    return returnModel === 'historicalAnnualBootstrap'
      ? runHistoricalBootstrapSimulation(parsedInput.data, historicalSettings)
      : runStochasticSimulation(parsedInput.data, {
          ...DEFAULT_STOCHASTIC_SETTINGS,
          allocation,
        })
  }, [allocation, historicalSettings, isValid, parsedInput, returnModel])

  useEffect(() => {
    if (!isValid || !parsedInput.success) {
      return
    }

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 3, input: parsedInput.data, allocation, returnModel, historical }),
    )
  }, [allocation, historical, isValid, parsedInput, returnModel])

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

  const updateReturnModel = (nextReturnModel: ReturnModel) => {
    setState((current) => ({ ...current, returnModel: nextReturnModel }))
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

  const reset = () => {
    const nextState = createDefaultState()
    setState(nextState)
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 3, ...nextState }))
  }

  return {
    input,
    allocation,
    returnModel,
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
    updateReturnModel,
    updateHistoricalReturnSeries,
    updateManualCashRealReturn,
    reset,
  }
}

type ScenarioState = {
  input: RentenlueckeInput
  allocation: AssetAllocation
  returnModel: ReturnModel
  historical: {
    returnSeriesIds: {
      equity: string
      bond: string
      cash: string
    }
    inflationSeriesId: string
    manualCashRealReturn: number
  }
}

function loadInitialState(): ScenarioState {
  if (typeof localStorage === 'undefined') {
    return createDefaultState()
  }

  const stored =
    localStorage.getItem(STORAGE_KEY) ??
    localStorage.getItem(PREVIOUS_STORAGE_KEY) ??
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
        returnModel: persisted.data.returnModel,
        historical: persisted.data.historical,
      }
    }

    const previousPersisted = previousPersistedScenarioSchema.safeParse(parsed)
    if (previousPersisted.success) {
      const derivedReturn = calculatePortfolioExpectedReturn(previousPersisted.data.allocation)
      return {
        input: withDeterministicPortfolioReturn(previousPersisted.data.input, derivedReturn),
        allocation: previousPersisted.data.allocation,
        returnModel: 'synthetic',
        historical: createDefaultHistoricalState(),
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
        returnModel: 'synthetic',
        historical: createDefaultHistoricalState(),
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
    returnModel: 'synthetic',
    historical: createDefaultHistoricalState(),
  }
}

function createDefaultHistoricalState(): ScenarioState['historical'] {
  return {
    returnSeriesIds: DEFAULT_HISTORICAL_RETURN_SERIES_IDS,
    inflationSeriesId: DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
    manualCashRealReturn: 0,
  }
}

function withDeterministicPortfolioReturn(input: RentenlueckeInput, annualReturn: number): RentenlueckeInput {
  return {
    ...input,
    annualReturnBeforeRetirement: annualReturn,
    annualReturnInRetirement: annualReturn,
  }
}
