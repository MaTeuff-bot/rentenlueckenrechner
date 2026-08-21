import { useEffect, useMemo, useState } from 'react'
import {
  findInflationSourceOption,
  getValidHistoricalYears,
  runHistoricalBootstrapSimulation,
  simulateHistoricalBootstrapReferenceScenario,
} from '../model/historicalReturns'
import { getFieldErrors, rentenlueckeInputSchema, type InputFieldName } from '../model/inputSchema'
import {
  calculatePortfolioExpectedReturn,
  createPortfolioComponents,
  DEFAULT_STOCHASTIC_SETTINGS,
  getAllocationValidationError,
  type AssetClassKey,
} from '../model/stochasticReturns'
import { createDefaultState, withDeterministicPortfolioReturn } from './scenarioState/defaults'
import { loadInitialState, serializeScenarioState, STORAGE_KEY } from './scenarioState/persistence'

export { parsePersistedScenarioState } from './scenarioState/persistence'

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
    if (!isValid || !parsedInput.success) return null
    return simulateHistoricalBootstrapReferenceScenario(parsedInput.data, historicalSettings)
  }, [historicalSettings, isValid, parsedInput])
  const stochasticSummary = useMemo(() => {
    if (!isValid || !parsedInput.success) return null
    return runHistoricalBootstrapSimulation(parsedInput.data, historicalSettings)
  }, [historicalSettings, isValid, parsedInput])

  useEffect(() => {
    if (!isValid || !parsedInput.success) return
    localStorage.setItem(STORAGE_KEY, serializeScenarioState({ input: parsedInput.data, allocation, historical }))
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
    localStorage.setItem(STORAGE_KEY, serializeScenarioState(nextState))
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
