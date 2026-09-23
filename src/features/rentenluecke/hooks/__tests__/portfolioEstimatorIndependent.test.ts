// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { automaticInsurance, completedCoverage } from '../../model/__tests__/insuranceFixtures'
import { createDefaultState } from '../scenarioState/defaults'
import { parsePersistedScenarioState, serializeScenarioState, STORAGE_KEY } from '../scenarioState/persistence'
import { portfolioEstimatorReadiness } from '../../model/capitalIncome/portfolioEstimator'
import { useScenarioState } from '../useScenarioState'

beforeEach(() => {
  localStorage.clear()
})

function validManualState() {
  const state = createDefaultState()
  state.childrenAnswer = { kind: 'none' }
  state.insuranceCoverageAnswers = completedCoverage()
  state.retirementIncomeStreams[0].support = 'standard'
  state.input = {
    ...state.input,
    currentAge: 65,
    retirementAge: 65,
    planningAge: 66,
    retirementInsurance: automaticInsurance({
      bridge: { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 },
      pension: { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 },
    }),
  }
  state.portfolioEstimatorSettings = undefined
  return state
}

function automaticState() {
  const state = createDefaultState()
  state.childrenAnswer = { kind: 'none' }
  state.insuranceCoverageAnswers = completedCoverage()
  state.retirementIncomeStreams[0].support = 'standard'
  state.input = {
    ...state.input,
    currentAge: 65,
    retirementAge: 65,
    planningAge: 66,
    retirementInsurance: automaticInsurance({
      bridge: { status: 'voluntary', circumstances: 'standard', capitalMode: 'automatic' },
      pension: { status: 'voluntary', circumstances: 'standard', capitalMode: 'automatic', drvSubsidy: 'confirmed' },
    }),
  }
  return state
}

describe('independent portfolio estimator (PR F)', () => {
  it('unused incomplete setup permits results and keeps standalone readiness', () => {
    const state = validManualState()
    localStorage.setItem(STORAGE_KEY, serializeScenarioState(state))
    const { result } = renderHook(useScenarioState)
    expect(result.current.portfolioEstimatorReadiness.ready).toBe(false)
    expect(result.current.issues.some(i => i.fieldPath.startsWith('retirementInsurance.capitalEstimator') || i.fieldPath.startsWith('estimatorPortfolio'))).toBe(false)
    expect(result.current.isValid).toBe(true)
    expect(result.current.result).not.toBeNull()
  })

  it('required incomplete setup blocks with a Vermögen link', () => {
    const state = automaticState()
    state.portfolioEstimatorSettings = undefined
    localStorage.setItem(STORAGE_KEY, serializeScenarioState(state))
    const { result } = renderHook(useScenarioState)
    expect(result.current.portfolioEstimatorReadiness.ready).toBe(false)
    expect(result.current.isValid).toBe(false)
    expect(result.current.result).toBeNull()
    const estimatorIssue = result.current.issues.find(i => i.fieldPath.startsWith('retirementInsurance.capitalEstimator') || i.fieldPath.startsWith('estimatorPortfolio'))
    expect(estimatorIssue).toBeDefined()
    expect(estimatorIssue!.section).toBe('vermoegen')
    expect(estimatorIssue!.fieldId.startsWith('estimator-') || estimatorIssue!.fieldId.startsWith('portfolio-')).toBe(true)
  })

  it('insurance status/manual changes neither hide nor erase settings nor change standalone readiness', () => {
    const buckets = [{ id: 'fund', name: 'Depot', value: 100000, returnSeriesId: 'synthetic-equity-assumption-v1', holding: 'accumulating-equity-fund' as const }]
    const settings = { fundAcquisitionCost: 12345, projectedBasisRate: 0.032, scopeConfirmed: true, lossScopeConfirmed: true }
    const before = portfolioEstimatorReadiness(settings, buckets, 100000)
    const state = automaticState()
    state.portfolioBuckets = buckets as unknown as typeof state.portfolioBuckets
    state.portfolioEstimatorSettings = settings
    const serializedBefore = serializeScenarioState(state)
    state.input.retirementInsurance = automaticInsurance({
      bridge: { manual: true, kvMonthlyToday: 5, pvMonthlyToday: 2 },
      pension: { manual: true, kvMonthlyToday: 1, pvMonthlyToday: 1 },
    })
    const serializedManual = serializeScenarioState(state)
    expect(JSON.parse(serializedManual).input.retirementInsurance.capitalEstimator).toEqual(JSON.parse(serializedBefore).input.retirementInsurance.capitalEstimator)
    expect(parsePersistedScenarioState(serializedManual).portfolioEstimatorSettings).toEqual(settings)
    state.input.retirementInsurance = automaticInsurance({
      bridge: { status: 'voluntary', circumstances: 'standard', capitalMode: 'automatic' },
      pension: { status: 'voluntary', circumstances: 'standard', capitalMode: 'automatic', drvSubsidy: 'confirmed' },
    })
    const serializedAuto = serializeScenarioState(state)
    expect(parsePersistedScenarioState(serializedAuto).portfolioEstimatorSettings).toEqual(settings)
    expect(portfolioEstimatorReadiness(settings, buckets, 100000).ready).toBe(before.ready)
    expect(portfolioEstimatorReadiness(settings, buckets, 100000).issues).toEqual(before.issues)
  })

  it('edits round-trip v15 old representation including absent values and drafts', () => {
    const base = createDefaultState()
    base.portfolioEstimatorSettings = undefined
    let serialized = serializeScenarioState(base)
    expect(JSON.parse(serialized).input.retirementInsurance).not.toHaveProperty('capitalEstimator')
    expect(parsePersistedScenarioState(serialized).portfolioEstimatorSettings).toBeUndefined()

    base.portfolioEstimatorSettings = { fundAcquisitionCost: 0, projectedBasisRate: 0.032, scopeConfirmed: true, lossScopeConfirmed: true }
    serialized = serializeScenarioState(base)
    expect(JSON.parse(serialized).input.retirementInsurance.capitalEstimator.fundAcquisitionCost).toBe(0)
    expect(parsePersistedScenarioState(serialized).portfolioEstimatorSettings?.fundAcquisitionCost).toBe(0)

    base.portfolioEstimatorSettings = { fundAcquisitionCost: NaN, projectedBasisRate: NaN, scopeConfirmed: true, lossScopeConfirmed: false }
    serialized = serializeScenarioState(base)
    const raw = JSON.parse(serialized).input.retirementInsurance.capitalEstimator
    expect(raw.fundAcquisitionCost).toEqual({ draftNumber: 'NaN' })
    expect(raw.projectedBasisRate).toEqual({ draftNumber: 'NaN' })
    const restored = parsePersistedScenarioState(serialized)
    expect(restored.portfolioEstimatorSettings?.fundAcquisitionCost).toBeNaN()
    expect(restored.portfolioEstimatorSettings?.projectedBasisRate).toBeNaN()
    expect(Number.isNaN(restored.portfolioEstimatorSettings?.fundAcquisitionCost)).toBe(true)

    const legacy = JSON.parse(serializeScenarioState(createDefaultState()))
    legacy.input.retirementInsurance.capitalEstimator = { fundAcquisitionCost: 777, projectedBasisRate: 0.032, scopeConfirmed: true, lossScopeConfirmed: true }
    const fromLegacy = parsePersistedScenarioState(JSON.stringify(legacy))
    expect(fromLegacy.portfolioEstimatorSettings?.fundAcquisitionCost).toBe(777)
    expect(fromLegacy.input.retirementInsurance).not.toHaveProperty('capitalEstimator')
  })
})
