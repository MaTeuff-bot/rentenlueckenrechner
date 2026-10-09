import { applyCoverage, type InsuranceCoverageAnswers } from '../model/insuranceCoverage'
import { needsDetailedPortfolio } from '../model/capitalIncome/setup'
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
import { CASH_PLANNING_RATE_PROPOSAL, CASH_REAL_RATE_PROPOSAL } from '../model/historicalReturns/constants'
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
import { isSupportedAllocationEligibility, prefillAllocationDraft, validateAllocationDraft } from '../model/capitalIncome/allocationEvent'
import {
  calculatePortfolioExpectedReturn,
  DEFAULT_STOCHASTIC_SETTINGS,
  getAllocationValidationError,
} from '../model/stochasticReturns'
import { createDefaultState, withDeterministicPortfolioReturn } from './scenarioState/defaults'
import { dismissTagesgeldPlanningRateNotice, loadInitialState, serializeScenarioState, STORAGE_KEY } from './scenarioState/persistence'
import { adoptPlanningRateForBankBuckets, cashPlanningRateIssue, getConfirmedCashMode, getConfirmedCashPlanningRate, getConfirmedCashRealRate, getEffectiveCashMode, isConfirmedCashPlanningRate, isConfirmedCashRealRate, resolveBucketSourceForHoldingChange } from '../model/cashPlanningRate'
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
    const needsDetailed = needsDetailedPortfolio(probeInput as unknown as Parameters<typeof needsDetailedPortfolio>[0])
    const engineEstimator = engineCapitalEstimatorFromPortfolio(portfolioEstimatorSettings, needsDetailed)
    const engineInsurance = baseInsurance ? { ...baseInsurance, capitalEstimator: engineEstimator } : undefined
    // The engine sees the one-time allocation only when the draft is enabled,
    // explicitly accepted, and free of dangling destinations; otherwise the
    // ledger runs the drift baseline (absent means disabled).
    const allocationDraft = state.allocationAtRetirement
    const allocationClean = allocationDraft && validateAllocationDraft(portfolioBuckets, allocationDraft).clean
      ? allocationDraft : undefined
    const allocationEngineSpec = allocationDraft?.enabled && allocationDraft.accepted && allocationClean
      ? { enabled: true as const, accepted: true as const,
        fixedTargets: allocationDraft.fixedTargets.map(t => ({ bucketId: t.bucketId, amountToday: t.amountToday })),
        remainderWeights: { ...allocationDraft.remainderWeights } }
      : undefined
    return withDeterministicPortfolioReturn(clearHiddenInvalidInsuranceValues({
      ...state.input,
      retirementInsurance: engineInsurance,
      retirementIncomeStreams,
      estimatorPortfolio: portfolioBuckets,
      currentCapital: calculatePortfolioBucketTotal(portfolioBuckets),
      allocationAtRetirement: allocationEngineSpec,
    }), annualReturn)
  }, [allocation, portfolioBuckets, retirementIncomeStreams, state.input, state.childrenAnswer, state.explicitInsuranceTransition, state.insuranceCoverageAnswers, portfolioEstimatorSettings, state.allocationAtRetirement])

  const parsedInput = useMemo(() => rentenlueckeInputSchema.safeParse(input), [input])
  const portfolioBucketError = useMemo(() => validatePortfolioBuckets(portfolioBuckets), [portfolioBuckets])
  const allocationError = useMemo(() => getAllocationValidationError(allocation), [allocation])
  const fieldErrors = useMemo<Partial<Record<InputFieldName, string>>>(() => {
    return parsedInput.success ? {} : getFieldErrors(parsedInput.error)
  }, [parsedInput])
  const insuranceIssues = useMemo(() => insuranceSetupIssues(input), [input])
  const cashPlanningIssue = useMemo(() => cashPlanningRateIssue(portfolioBuckets, historical), [portfolioBuckets, historical])
  const cashPlanningError = cashPlanningIssue
  const issues = useMemo(() => scenarioIssues(input, state.childrenAnswer ?? { kind: 'missing' }, portfolioBuckets, parsedInput.success ? undefined : parsedInput.error, insuranceIssues, portfolioBucketError, allocationError, state.insuranceCoverageAnswers, cashPlanningIssue, historical.cashMode, state.allocationAtRetirement), [input, state.childrenAnswer, portfolioBuckets, parsedInput, insuranceIssues, portfolioBucketError, allocationError, state.insuranceCoverageAnswers, cashPlanningIssue, historical.cashMode, state.allocationAtRetirement])
  const blockingDraft = state.allocationAtRetirement
  const blockingValidation = validateAllocationDraft(portfolioBuckets, blockingDraft)
  const allocationBlocking = !!blockingDraft?.enabled && (!blockingDraft.accepted || !blockingValidation.clean)
  const isValid = !insuranceIssues.length && parsedInput.success && !portfolioBucketError && !allocationError && !cashPlanningError && !allocationBlocking
  const historicalSettings = useMemo(
    () => ({
      portfolioComponents: createPortfolioComponentsFromBuckets(portfolioBuckets),
      inflationSourceId: historical.inflationSourceId,
      simulations: historical.simulations ?? DEFAULT_STOCHASTIC_SETTINGS.simulations,
      cashPlanningRate: getConfirmedCashPlanningRate(historical),
      cashRealRate: getConfirmedCashRealRate(historical),
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
      return { result: null, stochasticSummary: null, calculationError: `Berechnung unvollständig: ${error instanceof Error ? error.message : String(error)} Detaillierte Kapitalbasis im Vermögen prüfen.` }
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

  // One-time allocation at Arbeitsende: explicit prefill creates an editable
  // draft (never enabled/accepted implicitly); accept validates and locks it;
  // reset removes the draft entirely (absent means disabled); the enabled flag
  // only engages when accepted and free of dangling destinations.
  const prefillAllocationAtRetirement = () => {
    setState((current) => ({ ...current, allocationAtRetirement: prefillAllocationDraft(current.portfolioBuckets) }))
  }
  const updateAllocationFixedTarget = (bucketId: string, amountToday: number) => {
    setState((current) => {
      const draft = current.allocationAtRetirement
      if (!draft) return current
      const exists = draft.fixedTargets.some(t => t.bucketId === bucketId)
      const fixedTargets = exists
        ? draft.fixedTargets.map(t => t.bucketId === bucketId ? { ...t, amountToday } : t)
        : [...draft.fixedTargets, { bucketId, amountToday }]
      return { ...current, allocationAtRetirement: { ...draft, fixedTargets, accepted: false } }
    })
  }
  const updateAllocationRemainderWeight = (bucketId: string, weight: number) => {
    setState((current) => {
      const draft = current.allocationAtRetirement
      if (!draft) return current
      return { ...current,
        allocationAtRetirement: { ...draft, remainderWeights: { ...draft.remainderWeights, [bucketId]: weight }, accepted: false } }
    })
  }
  const removeAllocationTarget = (bucketId: string) => {
    setState((current) => {
      const draft = current.allocationAtRetirement
      if (!draft) return current
      const remainderWeights = { ...draft.remainderWeights }
      delete remainderWeights[bucketId]
      return { ...current,
        allocationAtRetirement: { ...draft,
          fixedTargets: draft.fixedTargets.filter(t => t.bucketId !== bucketId),
          remainderWeights, accepted: false } }
    })
  }
  // Fixed-priority order is the engine array order: moving a fixed target
  // changes the sequential funding outcome, so it revokes acceptance until
  // explicit re-accept. Removing only the fixed amount keeps the remainder
  // weight (unlike removeAllocationTarget, which repairs dangling ids fully).
  const moveAllocationFixedTarget = (bucketId: string, direction: -1 | 1) => {
    setState((current) => {
      const draft = current.allocationAtRetirement
      if (!draft) return current
      const index = draft.fixedTargets.findIndex(target => target.bucketId === bucketId)
      const other = index + direction
      if (index < 0 || other < 0 || other >= draft.fixedTargets.length) return current
      const fixedTargets = [...draft.fixedTargets]
      const moved = fixedTargets[index]
      fixedTargets[index] = fixedTargets[other]
      fixedTargets[other] = moved
      return { ...current, allocationAtRetirement: { ...draft, fixedTargets, accepted: false } }
    })
  }
  const removeAllocationFixedTarget = (bucketId: string) => {
    setState((current) => {
      const draft = current.allocationAtRetirement
      if (!draft) return current
      if (!draft.fixedTargets.some(target => target.bucketId === bucketId)) return current
      return { ...current,
        allocationAtRetirement: { ...draft,
          fixedTargets: draft.fixedTargets.filter(target => target.bucketId !== bucketId),
          accepted: false } }
    })
  }
  const acceptAllocationAtRetirement = () => {
    setState((current) => {
      const draft = current.allocationAtRetirement
      if (!draft) return current
      if (!validateAllocationDraft(current.portfolioBuckets, draft).clean) return current
      return { ...current, allocationAtRetirement: { ...draft, accepted: true } }
    })
  }
  const resetAllocationAtRetirement = () => {
    setState((current) => ({ ...current, allocationAtRetirement: undefined }))
  }
  const setAllocationAtRetirementEnabled = (enabled: boolean) => {
    setState((current) => {
      const draft = current.allocationAtRetirement
      if (!draft) return current
      if (enabled && (!draft.accepted || !validateAllocationDraft(current.portfolioBuckets, draft).clean)) return current
      return { ...current, allocationAtRetirement: { ...draft, enabled } }
    })
  }

  const updatePortfolioBucket = (id: string, patch: Partial<Omit<PortfolioBucket, 'id'>>) => {
    setState((current) => {
      const confirmedMode = getConfirmedCashMode(current.historical)
      const confirmedRate = getConfirmedCashPlanningRate(current.historical) ?? getConfirmedCashRealRate(current.historical)
      const nextBuckets = current.portfolioBuckets.map((bucket) => {
        if (bucket.id !== id) return bucket
        const nextHolding = patch.holding !== undefined ? patch.holding : bucket.holding
        const nextSource = resolveBucketSourceForHoldingChange(
          bucket.returnSeriesId,
          bucket.holding,
          patch.holding,
          patch.returnSeriesId,
          confirmedMode !== undefined ? (confirmedRate ?? 0) : undefined,
          confirmedMode,
        )
        return { ...bucket, ...patch, holding: nextHolding, returnSeriesId: nextSource }
      })
      // Ordinary holding edits (value, name, cost, source) preserve accepted
      // targets. Any reclassification that changes the supported-destination set
      // (in either direction) keeps the entries as dangling choices where needed
      // and revokes acceptance until explicit repair plus accept (or
      // reset/disable); nothing is silently redistributed or dropped.
      const draft = current.allocationAtRetirement
      const wasSupported = isSupportedAllocationEligibility(
        current.portfolioBuckets.find(b => b.id === id)?.holding)
      const nowSupported = isSupportedAllocationEligibility(
        nextBuckets.find(b => b.id === id)?.holding)
      const nextDraft = draft && patch.holding !== undefined && wasSupported !== nowSupported
        ? { ...draft, accepted: false }
        : draft
      return { ...current, portfolioBuckets: nextBuckets, allocationAtRetirement: nextDraft }
    })
  }

  const addPortfolioBucket = () => {
    setState((current) => {
      let id: string
      do {
        id = `portfolio-${Date.now()}-${nextPortfolioBucketId++}`
      } while (current.portfolioBuckets.some((bucket) => bucket.id === id))
      // New buckets join with zero participation: no fixed target and no weight
      // entry. New buckets start unclassified (no supported holding), so an
      // explicit zero entry would dangle and dirty the draft; unlisted buckets
      // default to a zero remainder share while other weights exist. The
      // destination set changed, so a previously accepted draft must be
      // re-accepted explicitly — otherwise a new supported bucket could slip
      // into the all-zero equal split under previously accepted targets.
      // When the draft relied on the equal fallback (undefined or all-zero
      // weights), freeze the previously accepted equal recipients to explicit
      // positive weights before the new bucket enters, so re-accept keeps the
      // new destination at zero instead of silently redistributing.
      const draft = current.allocationAtRetirement
      let nextDraft = draft
      if (draft && (draft.accepted || draft.enabled)) {
        const weights = draft.remainderWeights ?? {}
        const positive = Object.values(weights).reduce((sum, value) =>
          sum + (Number.isFinite(value) && (value as number) > 0 ? (value as number) : 0), 0)
        const usesEqualFallback = draft.remainderWeights === undefined || positive <= 0
        if (usesEqualFallback) {
          const frozen: Record<string, number> = {}
          for (const bucket of current.portfolioBuckets) {
            if (isSupportedAllocationEligibility(bucket.holding)) frozen[bucket.id] = 1
          }
          nextDraft = { ...draft, accepted: false, remainderWeights: frozen }
        } else {
          nextDraft = { ...draft, accepted: false }
        }
      }
      return {
        ...current,
        portfolioBuckets: [
          ...current.portfolioBuckets,
          { id, name: 'Neue Anlage', value: 0, returnSeriesId: getDefaultReturnSeriesId('equity'), annualCostRate: 0 },
        ],
        allocationAtRetirement: nextDraft,
      }
    })
  }

  const removePortfolioBucket = (id: string) => {
    setState((current) => ({
      ...current,
      portfolioBuckets: current.portfolioBuckets.filter((bucket) => bucket.id !== id),
      // Deleted destinations stay preserved as dangling choices and revoke
      // acceptance until explicit repair plus accept (or reset/disable).
      allocationAtRetirement: current.allocationAtRetirement
        ? { ...current.allocationAtRetirement, accepted: false }
        : current.allocationAtRetirement,
    }))
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

  const updateSimulations = (simulations: number) => {
    setState((current) => ({
      ...current,
      historical: { ...current.historical, simulations },
    }))
  }

  const updateCashPlanningRate = (cashPlanningRate: number | undefined) => {
    setState((current) => ({
      ...current,
      historical: { ...current.historical, cashPlanningRate },
    }))
  }

  const updateCashRealRate = (cashRealRate: number | undefined) => {
    setState((current) => ({
      ...current,
      historical: { ...current.historical, cashRealRate },
    }))
  }

  const updateCashMode = (cashMode: string) => {
    setState((current) => {
      if (current.historical.cashMode === cashMode) return current
      return {
        ...current,
        historical: { ...current.historical, cashMode, cashPlanningRateConfirmed: false },
      }
    })
  }

  const updateCashPlanningRateConfirmed = (cashPlanningRateConfirmed: boolean) => {
    if (!cashPlanningRateConfirmed) {
      setState((current) => ({
        ...current,
        historical: { ...current.historical, cashPlanningRateConfirmed: false },
      }))
      return
    }
    // Explicit confirmation adopts the displayed proposal when the field was
    // never edited (prefill-in-progress is display-only until confirmed).
    // A valid explicit confirmation also establishes the common bank source
    // for all declared ordinary-bank-deposit buckets. An invalid effective
    // rate must not persist confirmation: the user corrects the rate and
    // confirms explicitly again. Undefined still accepts the proposal.
    setState((current) => {
      const mode = getEffectiveCashMode(current.historical)
      if (mode === undefined) {
        return {
          ...current,
          historical: { ...current.historical, cashPlanningRateConfirmed: false },
        }
      }
      if (mode === 'real-assumption-zero-floor') {
        const effectiveRealRate = current.historical.cashRealRate ?? CASH_REAL_RATE_PROPOSAL
        if (!isConfirmedCashRealRate(effectiveRealRate)) {
          return {
            ...current,
            historical: { ...current.historical, cashPlanningRateConfirmed: false },
          }
        }
        dismissTagesgeldPlanningRateNotice()
        const nextHistorical = {
          ...current.historical,
          cashRealRate: effectiveRealRate,
          cashPlanningRateConfirmed: true,
        }
        const nextBuckets = adoptPlanningRateForBankBuckets(current.portfolioBuckets, nextHistorical)
        return { ...current, historical: nextHistorical, portfolioBuckets: nextBuckets }
      }
      if (mode === 'historical-zero-floor') {
        dismissTagesgeldPlanningRateNotice()
        const nextHistorical = { ...current.historical, cashPlanningRateConfirmed: true }
        const nextBuckets = adoptPlanningRateForBankBuckets(current.portfolioBuckets, nextHistorical)
        return { ...current, historical: nextHistorical, portfolioBuckets: nextBuckets }
      }
      const effectiveRate = current.historical.cashPlanningRate ?? CASH_PLANNING_RATE_PROPOSAL
      if (!isConfirmedCashPlanningRate(effectiveRate)) {
        return {
          ...current,
          historical: { ...current.historical, cashPlanningRateConfirmed: false },
        }
      }
      dismissTagesgeldPlanningRateNotice()
      const nextHistorical = {
        ...current.historical,
        cashPlanningRate: effectiveRate,
        cashPlanningRateConfirmed: true,
      }
      const nextBuckets = adoptPlanningRateForBankBuckets(current.portfolioBuckets, nextHistorical)
      return { ...current, historical: nextHistorical, portfolioBuckets: nextBuckets }
    })
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
    allocationAtRetirement: state.allocationAtRetirement,
    prefillAllocationAtRetirement,
    updateAllocationFixedTarget,
    updateAllocationRemainderWeight,
    removeAllocationTarget,
    moveAllocationFixedTarget,
    removeAllocationFixedTarget,
    acceptAllocationAtRetirement,
    resetAllocationAtRetirement,
    setAllocationAtRetirementEnabled,
    updatePortfolioBucket,
    addPortfolioBucket,
    removePortfolioBucket,
    updateRetirementIncomeStream,
    addRetirementIncomeStream,
    removeRetirementIncomeStream,
    updateInflationSource,
    updateSimulations,
    updateCashPlanningRate,
    updateCashRealRate,
    updateCashMode,
    updateCashPlanningRateConfirmed,
    cashPlanningIssue,
    cashPlanningError,
    reset,
  }
}
