import { describe, expect, it } from 'vitest'
import { createDefaultState } from '../scenarioState/defaults.js'
import { createInitialLifecycleMilestones } from '../../model/lifecycleDraft.js'
import { automaticInsurance, completedCoverage } from '../../model/__tests__/insuranceFixtures.js'
import { createPortfolioComponentsFromBuckets } from '../../model/portfolioBuckets.js'
import { runLifecycleBootstrap, runLifecycleScenario } from '../../model/lifecycleScenario.js'
import { clearLifecycleCalculationCache, getCachedLifecycleCalculation, lifecycleCalculationCacheKey, setCachedLifecycleCalculation } from '../useScenarioState.js'

function smallFixture() {
  const state = createDefaultState()
  state.insuranceCoverageAnswers = completedCoverage()
  state.childrenAnswer = { kind: 'children', rows: [{ id: 'older', year: 1980 }] } as never
  state.input = { ...state.input, currentAge: 65, planningAge: 67, retirementInsurance: automaticInsurance() }
  state.retirementIncomeStreams = state.retirementIncomeStreams.map((s) => ({ ...s, support: 'standard' as const }))
  state.lifecycleClassification = { equity: 'equityFund', bonds: 'bondFund', fixed: 'deposit' } as never
  state.lifecycleAcquisitionCost = { equity: 0, bonds: 0 } as never
  state.lifecycleTaxCashId = 'fixed'
  state.historical.inflationSourceId = 'fixed-manual'
  const created = createInitialLifecycleMilestones(65, state.input.retirementAge, state.portfolioBuckets, state.lifecycleClassification as never)
  state.lifecycleMilestones = created.milestones as never
  state.lifecycleTransitions = created.transitions as never
  return state
}

describe('lifecycle dedup parity', () => {
  it('stable keys ignore object key order and cache returns byte-identical results', () => {
    clearLifecycleCalculationCache()
    const state = smallFixture()
    const firstCalendarYear = (state.input.retirementInsurance as { referenceYear?: number })?.referenceYear ?? 2026
    const tax = { allowanceAnnualToday: 0, churchRate: 0 as const, basisRate: 0.032 }
    const historicalSettings = {
      portfolioComponents: createPortfolioComponentsFromBuckets(state.portfolioBuckets),
      inflationSourceId: state.historical.inflationSourceId,
      simulations: 10,
    }
    const keyArgs = {
      parsedData: state.input,
      streams: state.retirementIncomeStreams,
      portfolioBuckets: state.portfolioBuckets,
      classification: state.lifecycleClassification,
      acquisitionCost: state.lifecycleAcquisitionCost,
      milestones: state.lifecycleMilestones ?? [],
      transitions: state.lifecycleTransitions ?? [],
      taxCashId: state.lifecycleTaxCashId ?? '',
      taxSettings: state.lifecycleTaxSettings,
      historicalSettings,
      firstCalendarYear,
    }
    const k1 = lifecycleCalculationCacheKey(keyArgs)
    const shuffled = { ...keyArgs, taxCashId: keyArgs.taxCashId }
    const k2 = lifecycleCalculationCacheKey({ ...shuffled })
    expect(k1).toBe(k2)
    const base = runLifecycleScenario({
      input: state.input,
      streams: state.retirementIncomeStreams,
      portfolioBuckets: state.portfolioBuckets,
      classification: state.lifecycleClassification as never,
      acquisitionCost: state.lifecycleAcquisitionCost as never,
      milestones: state.lifecycleMilestones as never,
      transitions: state.lifecycleTransitions as never,
      taxCashId: state.lifecycleTaxCashId ?? '',
      tax,
      historicalSettings: historicalSettings as never,
      firstCalendarYear,
    })
    const bootstrap = runLifecycleBootstrap(base, {
      input: state.input,
      streams: state.retirementIncomeStreams,
      portfolioBuckets: state.portfolioBuckets,
      classification: state.lifecycleClassification as never,
      historicalSettings: historicalSettings as never,
      tax,
      firstCalendarYear,
    })
    const full = { lifecycleRun: { ...base, bootstrap }, lifecycleBootstrap: bootstrap, lifecycleError: null as string | null }
    setCachedLifecycleCalculation(k1, full as never)
    const hit = getCachedLifecycleCalculation(k1)
    expect(hit).toBeDefined()
    expect(JSON.stringify(hit)).toBe(JSON.stringify(full))
    expect(getCachedLifecycleCalculation('missing')).toBeUndefined()
    clearLifecycleCalculationCache()
    expect(getCachedLifecycleCalculation(k1)).toBeUndefined()
  })
})

describe('lifecycle manual-flag key parity', () => {
  it('manual:false shares the cache key with an absent flag and computes byte-identical runs', () => {
    clearLifecycleCalculationCache()
    const state = smallFixture()
    state.input = { ...state.input, retirementInsurance: automaticInsurance({
      pension: { status: 'voluntary', circumstances: 'standard', capitalMode: 'manual', capitalMonthlyToday: 123, drvSubsidy: 'confirmed', kvMonthlyToday: 0, pvMonthlyToday: 0 },
    }) }
    const firstCalendarYear = (state.input.retirementInsurance as { referenceYear?: number })?.referenceYear ?? 2026
    const tax = { allowanceAnnualToday: 0, churchRate: 0 as const, basisRate: 0.032 }
    const historicalSettings = {
      portfolioComponents: createPortfolioComponentsFromBuckets(state.portfolioBuckets),
      inflationSourceId: state.historical.inflationSourceId,
      simulations: 10,
    }
    const keyArgs = (input: unknown) => ({
      parsedData: input,
      streams: state.retirementIncomeStreams,
      portfolioBuckets: state.portfolioBuckets,
      classification: state.lifecycleClassification,
      acquisitionCost: state.lifecycleAcquisitionCost,
      milestones: state.lifecycleMilestones ?? [],
      transitions: state.lifecycleTransitions ?? [],
      taxCashId: state.lifecycleTaxCashId ?? '',
      taxSettings: state.lifecycleTaxSettings,
      historicalSettings,
      firstCalendarYear,
    })
    const pensioned = (manual: boolean | undefined) => ({
      ...(state.input as { retirementInsurance: { pension: Record<string, unknown> } }).retirementInsurance,
      pension: { ...(state.input as { retirementInsurance: { pension: Record<string, unknown> } }).retirementInsurance.pension, ...(manual === undefined ? {} : { manual }) },
    })
    const runFor = (manual: boolean | undefined) => {
      const input = { ...state.input, retirementInsurance: pensioned(manual) }
      const base = runLifecycleScenario({
        input: input as never,
        streams: state.retirementIncomeStreams,
        portfolioBuckets: state.portfolioBuckets,
        classification: state.lifecycleClassification as never,
        acquisitionCost: state.lifecycleAcquisitionCost as never,
        milestones: state.lifecycleMilestones as never,
        transitions: state.lifecycleTransitions as never,
        taxCashId: state.lifecycleTaxCashId ?? '',
        tax,
        historicalSettings: historicalSettings as never,
        firstCalendarYear,
      })
      const bootstrap = runLifecycleBootstrap(base, {
        input: input as never,
        streams: state.retirementIncomeStreams,
        portfolioBuckets: state.portfolioBuckets,
        classification: state.lifecycleClassification as never,
        historicalSettings: historicalSettings as never,
        tax,
        firstCalendarYear,
      })
      return { ...base, bootstrap }
    }
    const { manual: _dropped, ...pensionWithoutFlag } = (pensioned(false) as { pension: Record<string, unknown> }).pension as Record<string, unknown>
    void _dropped
    const inputWithFalse = { ...state.input, retirementInsurance: pensioned(false) }
    const inputWithTrue = { ...state.input, retirementInsurance: pensioned(true) }
    const inputWithoutFlag = { ...state.input, retirementInsurance: { ...pensioned(false), pension: pensionWithoutFlag } }
    expect(lifecycleCalculationCacheKey(keyArgs(inputWithFalse))).toBe(lifecycleCalculationCacheKey(keyArgs(inputWithoutFlag)))
    expect(lifecycleCalculationCacheKey(keyArgs(inputWithTrue))).not.toBe(lifecycleCalculationCacheKey(keyArgs(inputWithoutFlag)))
    expect(JSON.stringify(runFor(false))).toBe(JSON.stringify(runFor(undefined)))
    clearLifecycleCalculationCache()
  })
})
