import { applyCoverage, type InsuranceCoverageAnswers } from '../model/insuranceCoverage'
import { scenarioIssues } from '../model/scenarioIssues'
import { childrenEngineFields, type ChildrenAnswer } from '../model/childrenAnswer'
import { timelineBoundary, transitionAfterStreamsChange } from '../model/scenarioTimeline'
import { clearHiddenInvalidInsuranceValues, insuranceSetupIssuesWithoutEstimator, type RetirementInsurance } from '../model/retirementInsurance'
import { useEffect, useMemo, useState } from 'react'
import {
  findInflationSourceOption,
  getValidHistoricalYears,
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
import type { RetirementIncomeStream } from '../model/types'
import {
  basisIssues,
  buildLifecycleBuckets,
  classificationIssues,
  createInitialLifecycleMilestones,
  rePrefillLifecycleMilestones as rePrefillLifecycleMilestonesFromHoldings,
  taxCashIssues,
  validateLifecycleMilestones,
  validateLifecycleTaxSettings,
} from '../model/lifecycleDraft.js'
import type { LifecycleClassification } from './scenarioState/types.js'
import type { LifecycleTaxSettings } from './scenarioState/types.js'
import { runLifecycleBootstrap, runLifecycleScenario } from '../model/lifecycleScenario.js'
import { capitalMode } from '../model/capitalIncome/setup.js'
import { phaseManualReasons, phaseStreams } from '../model/retirementInsurance.js'

export { parsePersistedScenarioState } from './scenarioState/persistence'

export function stableStringifyLifecycleKey(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringifyLifecycleKey).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringifyLifecycleKey(v)}`).join(',')}}`;
}

function canonicalizeLifecycleKeyValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeLifecycleKeyValue);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // The insurance phase flag is truthiness-checked everywhere downstream
      // (phaseManualReasons and its callers), so false and absent are identical inputs.
      if (k === 'manual' && v === false) continue;
      out[k] = canonicalizeLifecycleKeyValue(v);
    }
    return out;
  }
  return value;
}

export function lifecycleCalculationCacheKey(args: {
  parsedData: unknown;
  streams: unknown;
  portfolioBuckets: unknown;
  classification: unknown;
  acquisitionCost: unknown;
  milestones: unknown;
  transitions: unknown;
  taxCashId: unknown;
  taxSettings: unknown;
  historicalSettings: unknown;
  firstCalendarYear: unknown;
}): string {
  return stableStringifyLifecycleKey(canonicalizeLifecycleKeyValue(args));
}

type LifecycleCalculationResult = { lifecycleRun: unknown; lifecycleBootstrap: unknown; lifecycleError: string | null };
const lifecycleCalculationCache = new Map<string, LifecycleCalculationResult>();
const LIFECYCLE_CALCULATION_CACHE_LIMIT = 10;

export function getCachedLifecycleCalculation(key: string): LifecycleCalculationResult | undefined {
  return lifecycleCalculationCache.get(key);
}

export function setCachedLifecycleCalculation(key: string, value: LifecycleCalculationResult): void {
  if (lifecycleCalculationCache.has(key)) lifecycleCalculationCache.delete(key);
  lifecycleCalculationCache.set(key, value);
  while (lifecycleCalculationCache.size > LIFECYCLE_CALCULATION_CACHE_LIMIT) {
    const oldest = lifecycleCalculationCache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    lifecycleCalculationCache.delete(oldest);
  }
}

export function clearLifecycleCalculationCache(): void {
  lifecycleCalculationCache.clear();
}

let nextPortfolioBucketId = 1
let nextRetirementIncomeStreamId = 1

export function useScenarioState() {
  const [state, setState] = useState(loadInitialState)
  const { portfolioBuckets, retirementIncomeStreams, historical } = state
  const allocation = useMemo(() => calculateAllocationFromBuckets(portfolioBuckets), [portfolioBuckets])
  const input = useMemo(() => {
    const annualReturn = calculatePortfolioExpectedReturn(allocation)
    return withDeterministicPortfolioReturn(clearHiddenInvalidInsuranceValues({
      ...state.input,
      retirementInsurance: state.input.retirementInsurance ? { ...applyCoverage(state.input.retirementInsurance, state.insuranceCoverageAnswers), pensionAge: timelineBoundary(retirementIncomeStreams, state.explicitInsuranceTransition), ...childrenEngineFields(state.childrenAnswer ?? { kind: 'missing' }) } : undefined,
      retirementIncomeStreams,
      estimatorPortfolio: portfolioBuckets,
      currentCapital: calculatePortfolioBucketTotal(portfolioBuckets),
    }), annualReturn)
  }, [allocation, portfolioBuckets, retirementIncomeStreams, state.input, state.childrenAnswer, state.explicitInsuranceTransition, state.insuranceCoverageAnswers])

  const parsedInput = useMemo(() => rentenlueckeInputSchema.safeParse(input), [input])
  const portfolioBucketError = useMemo(() => validatePortfolioBuckets(portfolioBuckets), [portfolioBuckets])
  const allocationError = useMemo(() => getAllocationValidationError(allocation), [allocation])
  const fieldErrors = useMemo<Partial<Record<InputFieldName, string>>>(() => {
    return parsedInput.success ? {} : getFieldErrors(parsedInput.error)
  }, [parsedInput])
  const insuranceIssues = useMemo(() => insuranceSetupIssuesWithoutEstimator(input), [input])
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
  const calculationError: string | null = null
  const result = null
  const stochasticSummary = null

  const lifecycleClassification = state.lifecycleClassification ?? {}
  const lifecycleAcquisitionCost = state.lifecycleAcquisitionCost ?? {}
  const lifecycleTaxCashId = state.lifecycleTaxCashId
  const lifecycleTaxSettings = state.lifecycleTaxSettings ?? { allowanceAnnualToday: 1000, churchRate: 0 as const, basisRate: 0.032 }
  const lifecycleMilestones = state.lifecycleMilestones
  const lifecycleTransitions = state.lifecycleTransitions

  const lifecycleIssues = useMemo(() => {
    const list: string[] = []
    list.push(...classificationIssues(portfolioBuckets, lifecycleClassification))
    list.push(...basisIssues(portfolioBuckets, lifecycleClassification, lifecycleAcquisitionCost))
    list.push(...taxCashIssues(portfolioBuckets, lifecycleClassification, lifecycleTaxCashId))
    const taxError = validateLifecycleTaxSettings(lifecycleTaxSettings)
    if (taxError) list.push(taxError)
    try {
      const buckets = buildLifecycleBuckets(portfolioBuckets, lifecycleClassification)
      const milestoneError = validateLifecycleMilestones(lifecycleMilestones, lifecycleTransitions, buckets, lifecycleTaxCashId)
      if (milestoneError) list.push(milestoneError)
    } catch (error) {
      list.push(error instanceof Error ? error.message : String(error))
    }
    const unsupported = portfolioBuckets.some((b) => b.holding === 'unsupported' || !b.holding)
    if (unsupported && input.retirementInsurance) {
      const insurance = input.retirementInsurance
      const phases: ('bridge' | 'pension')[] = ['bridge', 'pension']
      for (const phase of phases) {
        const p = insurance[phase]
        if (!p) continue
        const relevant = phaseStreams(input.retirementIncomeStreams ?? [], insurance, phase, input.retirementAge, input.planningAge)
        const manual = phaseManualReasons(insurance, phase, relevant).length > 0
        if (!manual && (p.status === 'voluntary' || p.status === 'unknown') && capitalMode(p) === 'automatic') {
          list.push('Nicht unterstützte Anlagen erhalten keine teilweise automatische Abdeckung: manuelle Kapitalertragsbasis oder eigene Gesamtannahme wählen.')
          break
        }
      }
    }
    return list
  }, [portfolioBuckets, lifecycleClassification, lifecycleAcquisitionCost, lifecycleTaxCashId, lifecycleTaxSettings, lifecycleMilestones, lifecycleTransitions, input])

  const lifecycleValid = isValid && lifecycleIssues.length === 0 && parsedInput.success

  const lifecycleCalculation = useMemo(() => {
    if (!lifecycleValid || !parsedInput.success) return { lifecycleRun: null, lifecycleBootstrap: null, lifecycleError: null as string | null }
    try {
      const firstCalendarYear = input.retirementInsurance?.referenceYear ?? new Date().getFullYear()
      const tax = {
        allowanceAnnualToday: lifecycleTaxSettings.allowanceAnnualToday ?? 0,
        churchRate: lifecycleTaxSettings.churchRate ?? 0,
        basisRate: lifecycleTaxSettings.basisRate ?? 0.032,
        expenseAllowanceAnnualToday: lifecycleTaxSettings.expenseAllowanceAnnualToday,
      }
      const cacheKey = lifecycleCalculationCacheKey({
        parsedData: parsedInput.data,
        streams: retirementIncomeStreams,
        portfolioBuckets,
        classification: lifecycleClassification,
        acquisitionCost: lifecycleAcquisitionCost,
        milestones: lifecycleMilestones ?? [],
        transitions: lifecycleTransitions ?? [],
        taxCashId: lifecycleTaxCashId ?? '',
        taxSettings: lifecycleTaxSettings,
        historicalSettings,
        firstCalendarYear,
      })
      const cached = getCachedLifecycleCalculation(cacheKey)
      if (cached) return cached as { lifecycleRun: never; lifecycleBootstrap: never; lifecycleError: string | null }
      const base = runLifecycleScenario({
        input: parsedInput.data,
        streams: retirementIncomeStreams,
        portfolioBuckets,
        classification: lifecycleClassification,
        acquisitionCost: lifecycleAcquisitionCost,
        milestones: lifecycleMilestones ?? [],
        transitions: lifecycleTransitions ?? [],
        taxCashId: lifecycleTaxCashId ?? '',
        tax,
        historicalSettings,
        firstCalendarYear,
      })
      let bootstrap = null
      try {
        bootstrap = runLifecycleBootstrap(base, {
          input: parsedInput.data,
          streams: retirementIncomeStreams,
          portfolioBuckets,
          classification: lifecycleClassification,
          historicalSettings,
          tax,
          firstCalendarYear,
        })
      } catch (error) {
        const partial = { lifecycleRun: base, lifecycleBootstrap: null, lifecycleError: `Bootstrap unvollständig: ${error instanceof Error ? error.message : String(error)}` }
        setCachedLifecycleCalculation(cacheKey, partial as LifecycleCalculationResult)
        return partial
      }
      const full = { lifecycleRun: { ...base, bootstrap }, lifecycleBootstrap: bootstrap, lifecycleError: null as string | null }
      setCachedLifecycleCalculation(cacheKey, full as unknown as LifecycleCalculationResult)
      return full
    } catch (error) {
      return { lifecycleRun: null, lifecycleBootstrap: null, lifecycleError: `Lebenszyklus-Berechnung unvollständig: ${error instanceof Error ? error.message : String(error)}` }
    }
  }, [lifecycleValid, parsedInput, input, retirementIncomeStreams, portfolioBuckets, lifecycleClassification, lifecycleAcquisitionCost, lifecycleMilestones, lifecycleTransitions, lifecycleTaxCashId, lifecycleTaxSettings, historicalSettings])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, serializeScenarioState(state))
  }, [state])

  const updateInsuranceCoverage = (insuranceCoverageAnswers: InsuranceCoverageAnswers) => setState(current => ({ ...current, insuranceCoverageAnswers }))
  const updateChildrenAnswer = (childrenAnswer: ChildrenAnswer) => setState(current => ({ ...current, childrenAnswer }))
  const updateInsuranceTransition = (explicitInsuranceTransition: number | undefined) => setState(current => ({ ...current, explicitInsuranceTransition }))

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
    setState((current) => ({ ...current, input: { ...current.input, retirementInsurance } }))
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
    setState((current) => {
      const nextClassification = { ...current.lifecycleClassification }
      delete nextClassification[id]
      const nextCosts = { ...current.lifecycleAcquisitionCost }
      delete nextCosts[id]
      return {
        ...current,
        portfolioBuckets: current.portfolioBuckets.filter((bucket) => bucket.id !== id),
        lifecycleClassification: nextClassification,
        lifecycleAcquisitionCost: nextCosts,
        lifecycleTaxCashId: current.lifecycleTaxCashId === id ? undefined : current.lifecycleTaxCashId,
      }
    })
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
        name: 'Weiteres Einkommen',
        kind: 'other',
        amountMonthlyToday: 0,
        startAge: current.input.retirementAge,
        endAge: null,
        amountBasis: 'net',
        deductionMode: 'none',
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

  const updateLifecycleClassification = (id: string, kind: LifecycleClassification | undefined) => {
    setState((current) => ({ ...current, lifecycleClassification: { ...current.lifecycleClassification, [id]: kind } }))
  }
  const updateLifecycleAcquisitionCost = (id: string, cost: number | undefined) => {
    setState((current) => ({ ...current, lifecycleAcquisitionCost: { ...current.lifecycleAcquisitionCost, [id]: cost } }))
  }
  const updateLifecycleTaxCashId = (id: string | undefined) => {
    setState((current) => ({ ...current, lifecycleTaxCashId: id }))
  }
  const updateLifecycleTaxSettings = (patch: Partial<LifecycleTaxSettings>) => {
    setState((current) => ({ ...current, lifecycleTaxSettings: { ...current.lifecycleTaxSettings, ...patch } }))
  }
  const initLifecycleMilestones = () => {
    setState((current) => {
      const created = createInitialLifecycleMilestones(current.input.currentAge, current.input.retirementAge, current.portfolioBuckets, current.lifecycleClassification ?? {})
      return { ...current, lifecycleMilestones: created.milestones, lifecycleTransitions: created.transitions }
    })
  }
  const rePrefillLifecycleMilestones = () => {
    setState((current) => {
      if (!current.lifecycleMilestones) return current
      try {
        const next = rePrefillLifecycleMilestonesFromHoldings(current.lifecycleMilestones, current.portfolioBuckets, current.lifecycleClassification ?? {})
        return { ...current, lifecycleMilestones: next }
      } catch {
        return current
      }
    })
  }
  const updateLifecycleMilestone = (index: number, patch: Partial<{ name: string; startAge: number }>) => {
    setState((current) => {
      if (!current.lifecycleMilestones) return current
      const next = current.lifecycleMilestones.map((m, i) => (i === index ? { ...m, ...patch } : m))
      return { ...current, lifecycleMilestones: next }
    })
  }
  const updateLifecycleTarget = (milestoneIndex: number, bucketId: string, target: { role: 'fixedReserve'; amountToday: number } | { role: 'percent'; share: number }) => {
    setState((current) => {
      if (!current.lifecycleMilestones) return current
      const next = current.lifecycleMilestones.map((m, i) => {
        if (i !== milestoneIndex) return m
        return { ...m, targets: { ...m.targets, [bucketId]: target } }
      })
      return { ...current, lifecycleMilestones: next }
    })
  }
  const addLifecycleTransition = () => {
    setState((current) => {
      const milestones = current.lifecycleMilestones ?? []
      const transitions = current.lifecycleTransitions ?? []
      if (!milestones.length) return current
      const last = milestones[milestones.length - 1]
      if (!last) return current
      const nextAge = Math.min(current.input.planningAge, last.startAge + 5)
      const name = `Etappe ${milestones.length + 1}`
      const targets: typeof last.targets = {}
      for (const bucket of current.portfolioBuckets) {
        const existing = last.targets[bucket.id]
        targets[bucket.id] = existing ?? { role: 'percent' as const, share: 0 }
      }
      return {
        ...current,
        lifecycleMilestones: [...milestones, { name, startAge: nextAge, targets }],
        lifecycleTransitions: [...transitions, { fromMilestone: last.name, toMilestone: name, startAge: nextAge, durationYears: 0 }],
      }
    })
  }
  const updateLifecycleTransition = (index: number, patch: Partial<{ startAge: number; durationYears: number }>) => {
    setState((current) => {
      if (!current.lifecycleTransitions) return current
      const next = current.lifecycleTransitions.map((t, i) => (i === index ? { ...t, ...patch } : t))
      return { ...current, lifecycleTransitions: next }
    })
  }

  const reset = () => {
    const nextState = createDefaultState()
    setState(nextState)
    localStorage.setItem(STORAGE_KEY, serializeScenarioState(nextState))
  }

  return {
    input,
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
    lifecycleClassification,
    lifecycleAcquisitionCost,
    lifecycleTaxCashId,
    lifecycleTaxSettings,
    lifecycleMilestones,
    lifecycleTransitions,
    lifecycleIssues,
    lifecycleValid,
    lifecycleRun: lifecycleCalculation.lifecycleRun,
    lifecycleBootstrap: lifecycleCalculation.lifecycleBootstrap,
    lifecycleError: lifecycleCalculation.lifecycleError,
    updateLifecycleClassification,
    updateLifecycleAcquisitionCost,
    updateLifecycleTaxCashId,
    updateLifecycleTaxSettings,
    initLifecycleMilestones,
    rePrefillLifecycleMilestones,
    updateLifecycleMilestone,
    updateLifecycleTarget,
    addLifecycleTransition,
    updateLifecycleTransition,
    updateField,
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
