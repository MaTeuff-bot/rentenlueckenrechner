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
  createPortfolioComponentsFromBuckets,
  getDefaultReturnSeriesId,
  scalePortfolioBucketValuesToTotal,
  validatePortfolioBuckets,
  type PortfolioBucket,
} from '../model/portfolioBuckets'
import {
  calculatePortfolioExpectedReturn,
  DEFAULT_STOCHASTIC_SETTINGS,
  getAllocationValidationError,
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
      portfolioComponents: createPortfolioComponentsFromBuckets(portfolioBuckets),
      inflationSourceId: historical.inflationSourceId,
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
      serializeScenarioState({ input: parsedInput.data, portfolioBuckets, historical }),
    )
  }, [historical, isValid, parsedInput, portfolioBuckets])

  const updateField = (field: InputFieldName, value: number) => {
    setState((current) => ({
      ...current,
      input: { ...current.input, [field]: value },
      portfolioBuckets: field === 'currentCapital'
        ? scalePortfolioBucketValuesToTotal(current.portfolioBuckets, value)
        : current.portfolioBuckets,
    }))
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
          { id, name: 'Neue Anlage', value: 0, returnSeriesId: getDefaultReturnSeriesId('equity'), annualCostRate: 0 },
        ],
      }
    })
  }

  const removePortfolioBucket = (id: string) => {
    setState((current) => ({ ...current, portfolioBuckets: current.portfolioBuckets.filter((bucket) => bucket.id !== id) }))
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
    updatePortfolioBucket,
    addPortfolioBucket,
    removePortfolioBucket,
    updateInflationSource,
    reset,
  }
}
