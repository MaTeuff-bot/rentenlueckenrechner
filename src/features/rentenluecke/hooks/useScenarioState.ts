import { applyCoverage, type InsuranceCoverageAnswers } from '../model/insuranceCoverage'
import { needsEstimator } from '../model/capitalIncome/setup'
import { engineCapitalEstimatorFromPortfolio, portfolioEstimatorReadiness, type PortfolioEstimatorSettings } from '../model/capitalIncome/portfolioEstimator'
import { scenarioIssues } from '../model/scenarioIssues'
import { childrenEngineFields, type ChildrenAnswer } from '../model/childrenAnswer'
import { timelineBoundary, transitionAfterStreamsChange } from '../model/scenarioTimeline'
import { clearHiddenInvalidInsuranceValues, insuranceSetupIssues, type RetirementInsurance } from '../model/retirementInsurance'
import { useEffect, useMemo, useState } from 'react'
import {
  findInflationSourceOption,
  getValidHistoricalYears,
  runHistoricalBootstrapSimulation,
  simulateHistoricalBootstrapReferenceScenario,
} from '../model/historicalReturns'
import { getFieldErrors, rentenlueckeInputSchema, type InputFieldName } from '../model/inputSchema'
import type { LifeTableSex } from '../mortality/mortality'
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
import type { RetirementIncomeStream } from '../model/types'

export { parsePersistedScenarioState } from './scenarioState/persistence'

let nextPortfolioBucketId = 1
let nextRetirementIncomeStreamId = 1

export function useScenarioState() {
  const [state, setState] = useState(loadInitialState)
  const { portfolioBuckets, retirementIncomeStreams, historical } = state
  const allocation = useMemo(() => calculateAllocationFromBuckets(portfolioBuckets), [portfolioBuckets])
  const portfolioEstimatorSettings = state.portfolioEstimatorSettings ?? state.input.retirementInsurance?.capitalEstimator
  const portfolioEstimatorReadinessValue = useMemo(
    () => portfolioEstimatorReadiness(portfolioEstimatorSettings, portfolioBuckets, calculatePortfolioBucketTotal(portfolioBuckets)),
    [portfolioEstimatorSettings, portfolioBuckets],
  )
  const input = useMemo(() => {
    const annualReturn = calculatePortfolioExpectedReturn(allocation)
    const strippedStoredInsurance = (() => {
      if (!state.input.retirementInsurance) return undefined
      const copy = { ...state.input.retirementInsurance } as Record<string, unknown>
      delete copy.capitalEstimator
      return copy as unknown as typeof state.input.retirementInsurance
    })()
    const baseInsurance = strippedStoredInsurance ? { ...applyCoverage(strippedStoredInsurance, state.insuranceCoverageAnswers), pensionAge: timelineBoundary(retirementIncomeStreams, state.explicitInsuranceTransition), ...childrenEngineFields(state.childrenAnswer ?? { kind: 'missing' }) } : undefined
    const probeInput = {
      ...state.input,
      retirementInsurance: baseInsurance,
      retirementIncomeStreams,
      estimatorPortfolio: portfolioBuckets,
      currentCapital: calculatePortfolioBucketTotal(portfolioBuckets),
    }
    const needsAutomatic = needsEstimator(probeInput)
    const engineEstimator = engineCapitalEstimatorFromPortfolio(portfolioEstimatorSettings, needsAutomatic)
    const engineInsurance = baseInsurance ? { ...baseInsurance, capitalEstimator: engineEstimator } : undefined
    return withDeterministicPortfolioReturn(clearHiddenInvalidInsuranceValues({
      ...state.input,
      retirementInsurance: engineInsurance,
      retirementIncomeStreams,
      estimatorPortfolio: portfolioBuckets,
      currentCapital: calculatePortfolioBucketTotal(portfolioBuckets),
    }), annualReturn)
  }, [allocation, portfolioBuckets, retirementIncomeStreams, state.input, state.childrenAnswer, state.explicitInsuranceTransition, state.insuranceCoverageAnswers, portfolioEstimatorSettings])

  const parsedInput = useMemo(() => rentenlueckeInputSchema.safeParse(input), [input])
  const portfolioBucketError = useMemo(() => validatePortfolioBuckets(portfolioBuckets), [portfolioBuckets])
  const allocationError = useMemo(() => getAllocationValidationError(allocation), [allocation])
  const fieldErrors = useMemo<Partial<Record<InputFieldName, string>>>(() => {
    return parsedInput.success ? {} : getFieldErrors(parsedInput.error)
  }, [parsedInput])
  const insuranceIssues = useMemo(() => insuranceSetupIssues(input), [input])
  const issues = useMemo(() => scenarioIssues(input, state.childrenAnswer ?? { kind: 'missing' }, portfolioBuckets, parsedInput.success ? undefined : parsedInput.error, insuranceIssues, portfolioBucketError, allocationError, state.insuranceCoverageAnswers), [input, state.childrenAnswer, portfolioBuckets, parsedInput, insuranceIssues, portfolioBucketError, allocationError, state.insuranceCoverageAnswers])
  const isValid = !insuranceIssues.length && parsedInput.success && !portfolioBucketError && !allocationError
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
  const calculation = useMemo(() => {
    if (!isValid || !parsedInput.success) return { result: null, stochasticSummary: null, calculationError: null }
    try {
      const result = simulateHistoricalBootstrapReferenceScenario(parsedInput.data, historicalSettings)
      return { result, stochasticSummary: runHistoricalBootstrapSimulation(parsedInput.data, historicalSettings), calculationError: null }
    } catch (error) {
      return { result: null, stochasticSummary: null, calculationError: `Berechnung unvollständig: ${error instanceof Error ? error.message : String(error)} Automatische Kapitalbasis prüfen oder ausdrücklich manuelle Kapitalertragsschätzung wählen.` }
    }
  }, [historicalSettings, isValid, parsedInput])
  const { result, stochasticSummary, calculationError } = calculation

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, serializeScenarioState(state))
  }, [state])

  const updateInsuranceCoverage = (insuranceCoverageAnswers: InsuranceCoverageAnswers) => setState(current => ({ ...current, insuranceCoverageAnswers }))
  const updateChildrenAnswer = (childrenAnswer: ChildrenAnswer) => setState(current => ({ ...current, childrenAnswer }))
  const updateInsuranceTransition = (explicitInsuranceTransition: number | undefined) => setState(current => ({ ...current, explicitInsuranceTransition }))

  const updateLifeTableSex = (lifeTableSex: LifeTableSex) => {
    setState((current) => ({ ...current, input: { ...current.input, lifeTableSex } }))
  }

  const updateField = (field: InputFieldName, value: number) => {
    setState((current) => ({
      ...current,
      input: { ...current.input, [field]: value },
      portfolioBuckets: field === 'currentCapital'
        ? scalePortfolioBucketValuesToTotal(current.portfolioBuckets, value)
        : current.portfolioBuckets,
    }))
  }

  const updateRetirementInsurance = (retirementInsurance: RetirementInsurance) => {
    setState((current) => {
      const copy = { ...retirementInsurance } as Record<string, unknown>
      delete copy.capitalEstimator
      return { ...current, input: { ...current.input, retirementInsurance: copy as unknown as RetirementInsurance } }
    })
  }

  const updatePortfolioEstimatorSettings = (portfolioEstimator: PortfolioEstimatorSettings | undefined) => {
    setState((current) => ({ ...current, portfolioEstimatorSettings: portfolioEstimator }))
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

  const updateRetirementIncomeStream = (id: string, patch: Partial<Omit<RetirementIncomeStream, 'id'>>) => {
    setState(current => {
      const next = current.retirementIncomeStreams.map(stream => stream.id === id ? { ...stream, ...patch } : stream)
      return { ...current, retirementIncomeStreams: next, explicitInsuranceTransition: transitionAfterStreamsChange(current.retirementIncomeStreams, next, current.explicitInsuranceTransition) }
    })
  }

  const addRetirementIncomeStream = () => {
    setState((current) => ({
      ...current,
      retirementIncomeStreams: [...current.retirementIncomeStreams, {
        id: `retirement-income-${Date.now()}-${nextRetirementIncomeStreamId++}`,
        name: 'Gesetzliche Rente',
        kind: 'gesetzliche-rente',
        support: 'standard',
        amountMonthlyToday: 0,
        startAge: current.input.retirementAge,
        endAge: null,
        amountBasis: 'gross',
        deductionMode: 'effectiveHaircut',
        effectiveDeductionRate: 0,
      }],
    }))
  }

  const removeRetirementIncomeStream = (id: string) => {
    setState(current => {
      const next = current.retirementIncomeStreams.filter(stream => stream.id !== id)
      return { ...current, retirementIncomeStreams: next, explicitInsuranceTransition: transitionAfterStreamsChange(current.retirementIncomeStreams, next, current.explicitInsuranceTransition) }
    })
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
    portfolioEstimatorSettings,
    portfolioEstimatorReadiness: portfolioEstimatorReadinessValue,
    updatePortfolioEstimatorSettings,
    childrenAnswer: state.childrenAnswer ?? { kind: 'missing' } as ChildrenAnswer,
    insuranceCoverageAnswers: state.insuranceCoverageAnswers,
    updateInsuranceCoverage,
    updateChildrenAnswer,
    updateInsuranceTransition,
    insuranceIssues,
    issues,
    calculationError,
    allocation,
    portfolioBuckets,
    retirementIncomeStreams,
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
    updateLifeTableSex,
    updateRetirementInsurance,
    updatePortfolioBucket,
    addPortfolioBucket,
    removePortfolioBucket,
    updateRetirementIncomeStream,
    addRetirementIncomeStream,
    removeRetirementIncomeStream,
    updateInflationSource,
    reset,
  }
}
