import { useEffect, useMemo, useState } from 'react'
import {
  findInflationSourceOption,
  getValidHistoricalYears,
  runHistoricalBootstrapSimulation,
  simulateHistoricalBootstrapReferenceScenario,
} from '../model/historicalReturns'
import { getFieldErrors, rentenlueckeInputSchema, type InputFieldName } from '../model/inputSchema'
import {
  calculateAllocationFromBuckets,
  calculatePortfolioBucketTotal,
  createDefaultPortfolioBuckets,
  createPortfolioComponentsFromBuckets,
  validatePortfolioBuckets,
  type PortfolioBucket,
} from '../model/portfolioBuckets'
import {
  calculatePortfolioExpectedReturn,
  DEFAULT_STOCHASTIC_SETTINGS,
  getAllocationValidationError,
  type AssetClassKey,
} from '../model/stochasticReturns'
import { createDefaultState, withDeterministicPortfolioReturn } from './scenarioState/defaults'
import { loadInitialState, serializeScenarioState, STORAGE_KEY } from './scenarioState/persistence'

export { parsePersistedScenarioState } from './scenarioState/persistence'

let nextPortfolioBucketId = 1

export function useScenarioState() {
  const [state, setState] = useState(loadInitialState)
  const { portfolioBuckets, historical } = state
  const allocation = useMemo(() => calculateAllocationFromBuckets(portfolioBuckets), [portfolioBuckets])
  const input = useMemo(() => {
    const annualReturn = calculatePortfolioExpectedReturn(allocation)
    return withDeterministicPortfolioReturn({
      ...state.input,
      currentCapital: calculatePortfolioBucketTotal(portfolioBuckets),
    }, annualReturn)
  }, [allocation, portfolioBuckets, state.input])

  const parsedInput = useMemo(() => rentenlueckeInputSchema.safeParse(input), [input])
  const portfolioBucketError = useMemo(() => validatePortfolioBuckets(portfolioBuckets), [portfolioBuckets])
  const allocationError = useMemo(() => getAllocationValidationError(allocation), [allocation])
  const fieldErrors = useMemo<Partial<Record<InputFieldName, string>>>(() => {
    return parsedInput.success ? {} : getFieldErrors(parsedInput.error)
  }, [parsedInput])
  const isValid = parsedInput.success && !portfolioBucketError && !allocationError
  const historicalSettings = useMemo(
    () => ({
      portfolioComponents: createPortfolioComponentsFromBuckets(portfolioBuckets, historical.returnSeriesIds),
      inflationSourceId: historical.inflationSourceId,
      manualCashRealReturn: historical.manualCashRealReturn,
      simulations: DEFAULT_STOCHASTIC_SETTINGS.simulations,
    }),
    [historical, portfolioBuckets],
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
    localStorage.setItem(
      STORAGE_KEY,
      serializeScenarioState({ input: parsedInput.data, allocation, portfolioBuckets, historical }),
    )
  }, [allocation, historical, isValid, parsedInput, portfolioBuckets])

  const updateField = (field: InputFieldName, value: number) => {
    setState((current) => ({
      ...current,
      input: { ...current.input, [field]: value },
      portfolioBuckets: field === 'currentCapital'
        ? createDefaultPortfolioBuckets(value, calculateAllocationFromBuckets(current.portfolioBuckets))
        : current.portfolioBuckets,
    }))
  }

  const updateAllocation = (field: AssetClassKey, value: number) => {
    setState((current) => {
      const currentAllocation = calculateAllocationFromBuckets(current.portfolioBuckets)
      const allocation = { ...currentAllocation, [field]: value }
      const derivedReturn = calculatePortfolioExpectedReturn(allocation)
      const currentCapital = calculatePortfolioBucketTotal(current.portfolioBuckets)
      return {
        ...current,
        allocation,
        portfolioBuckets: createDefaultPortfolioBuckets(currentCapital, allocation),
        input: withDeterministicPortfolioReturn(current.input, derivedReturn),
      }
    })
  }

  const updatePortfolioBucket = (id: string, patch: Partial<Omit<PortfolioBucket, 'id'>>) => {
    setState((current) => ({
      ...current,
      portfolioBuckets: current.portfolioBuckets.map((bucket) =>
        bucket.id === id ? { ...bucket, ...patch } : bucket,
      ),
    }))
  }

  const addPortfolioBucket = () => {
    setState((current) => {
      let id: string
      do {
        id = `portfolio-${Date.now()}-${nextPortfolioBucketId++}`
      } while (current.portfolioBuckets.some((bucket) => bucket.id === id))
      return {
        ...current,
        portfolioBuckets: [
          ...current.portfolioBuckets,
          { id, name: 'Neue Anlage', value: 0, role: 'equity' },
        ],
      }
    })
  }

  const removePortfolioBucket = (id: string) => {
    setState((current) => ({ ...current, portfolioBuckets: current.portfolioBuckets.filter((bucket) => bucket.id !== id) }))
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
    portfolioBuckets,
    historical,
    historicalSettings,
    historicalValidYears,
    fieldErrors,
    allocationError,
    portfolioBucketError,
    isValid,
    result,
    stochasticSummary,
    updateField,
    updateAllocation,
    updatePortfolioBucket,
    addPortfolioBucket,
    removePortfolioBucket,
    updateHistoricalReturnSeries,
    updateManualCashRealReturn,
    updateInflationSource,
    reset,
  }
}
