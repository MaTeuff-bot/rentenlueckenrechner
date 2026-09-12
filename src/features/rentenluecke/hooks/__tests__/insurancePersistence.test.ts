// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { automaticInsurance } from '../../model/__tests__/insuranceFixtures'
import { createDefaultState } from '../scenarioState/defaults'
import { loadInitialState, parsePersistedScenarioState, serializeScenarioState, STORAGE_KEY, RESET_NOTICE_KEY } from '../scenarioState/persistence'
import { useScenarioState } from '../useScenarioState'

beforeEach(() => localStorage.clear())

describe('guided insurance persistence and app-owned reset', () => {
  it('discards every owned old scenario version, preserves unrelated storage and records one reset notice', () => {
    for (let version = 1; version <= 12; version++) localStorage.setItem(`rentenlueckenrechner.scenario.v${version}`, 'old')
    localStorage.setItem('another-app.scenario.v12', 'keep')
    localStorage.setItem('rentenlueckenrechner.preferences', 'keep')
    localStorage.setItem('rentenlueckenrechner.scenario.v14', 'future')
    expect(loadInitialState()).toEqual(createDefaultState())
    expect(Object.keys(localStorage).sort()).toEqual(['another-app.scenario.v12', 'rentenlueckenrechner.preferences', 'rentenlueckenrechner.scenario.v14', RESET_NOTICE_KEY].sort())
    expect(localStorage.getItem(RESET_NOTICE_KEY)).toBe('1')
    localStorage.removeItem(RESET_NOTICE_KEY)
    loadInitialState()
    expect(localStorage.getItem(RESET_NOTICE_KEY)).toBeNull()
  })
  it('preserves v13 when old keys coexist and roundtrips phase bases, family, gross/rental and shared rate overrides', () => {
    const state = createDefaultState()
    state.input.retirementInsurance = automaticInsurance({ childBirthYears: [2002, 2002], rates: { kvGeneralRate: 0, kvReducedRate: 0.15, pvBaseRate: 0.04 },
      bridge: { status: 'unsupported', kvMonthlyToday: 200, pvMonthlyToday: 0 },
      pension: { status: 'unknown', circumstances: 'standard', capitalMonthlyToday: 600, drvSubsidy: 'not-received' },
    })
    state.retirementIncomeStreams[0] = { ...state.retirementIncomeStreams[0], support: 'standard', effectiveDeductionRate: 0.15 }
    state.retirementIncomeStreams.push({ ...state.retirementIncomeStreams[0], id: 'rent', kind: 'rental-income', rentalAssessmentMonthlyToday: 123 })
    localStorage.setItem(STORAGE_KEY, serializeScenarioState(state))
    localStorage.setItem('rentenlueckenrechner.scenario.v12', 'old')
    const loaded = loadInitialState()
    expect(loaded.input.retirementInsurance).toEqual(state.input.retirementInsurance)
    expect(loaded.retirementIncomeStreams).toEqual(state.retirementIncomeStreams)
    expect(JSON.parse(serializeScenarioState(loaded)).version).toBe(13)
  })
  it('roundtrips unanswered fields without fabricating confirmed zeros', () => {
    const state = createDefaultState()
    const loaded = parsePersistedScenarioState(serializeScenarioState(state))
    expect(loaded.input.retirementInsurance?.pension).toEqual({})
    expect(loaded.input.retirementInsurance?.insurerAdditionalRate).toBeUndefined()
    expect(loaded.retirementIncomeStreams[0].support).toBeUndefined()
    expect(parsePersistedScenarioState('{broken')).toEqual(state)
  })
  it('persists valid incomplete transitions and hides results, then restores the completed forecast', () => {
    const state = createDefaultState()
    state.input = { ...state.input, currentAge: 65, planningAge: 70 }
    localStorage.setItem(STORAGE_KEY, serializeScenarioState(state))
    const { result, unmount } = renderHook(useScenarioState)
    expect(result.current.isValid).toBe(false)
    act(() => result.current.updateRetirementIncomeStream('statutory-pension', { support: 'standard' }))
    act(() => result.current.updateRetirementInsurance(automaticInsurance()))
    expect(result.current.isValid).toBe(true)
    const complete = result.current.result
    act(() => result.current.updateRetirementInsurance(automaticInsurance({ insurerAdditionalRate: undefined })))
    expect(result.current.result).toBeNull()
    expect(parsePersistedScenarioState(localStorage.getItem(STORAGE_KEY)).input.retirementInsurance?.insurerAdditionalRate).toBeUndefined()
    unmount()
    const reloaded = renderHook(useScenarioState)
    expect(reloaded.result.current.result).toBeNull()
    act(() => reloaded.result.current.updateRetirementInsurance(automaticInsurance()))
    expect(reloaded.result.current.result).toEqual(complete)
    const validStored = localStorage.getItem(STORAGE_KEY)
    act(() => reloaded.result.current.updateRetirementInsurance(automaticInsurance({ insurerAdditionalRate: NaN })))
    expect(reloaded.result.current.isValid).toBe(false)
    expect(localStorage.getItem(STORAGE_KEY)).toBe(validStored)
    act(() => reloaded.result.current.reset())
    expect(reloaded.result.current.result).toBeNull()
    expect(reloaded.result.current.input.retirementInsurance?.pension).toEqual({})
  }, 20000)
})

describe('additive insurance estimator persistence', () => {
  it('keeps legacy manual amounts and unrelated state without a new reset', () => {
    const state = createDefaultState()
    state.input.retirementInsurance = automaticInsurance({
      pension: { status: 'voluntary', circumstances: 'standard', capitalMonthlyToday: 321, drvSubsidy: 'not-received' },
    })
    localStorage.setItem(STORAGE_KEY, serializeScenarioState(state))
    localStorage.setItem('unrelated', 'keep')
    const loaded = loadInitialState()
    expect(loaded.input.retirementInsurance!.pension.capitalMonthlyToday).toBe(321)
    expect(loaded.input.retirementInsurance!.pension.capitalMode).toBeUndefined()
    expect(loaded.portfolioBuckets).toEqual(state.portfolioBuckets)
    expect(loaded.historical).toEqual(state.historical)
    expect(localStorage.getItem('unrelated')).toBe('keep')
    expect(localStorage.getItem(RESET_NOTICE_KEY)).toBeNull()
  })
  it('roundtrips classifications, confirmed zero cost, projected rate and independent phase modes', () => {
    const state = createDefaultState()
    state.portfolioBuckets[0].holding = 'accumulating-equity-fund'
    state.input.retirementInsurance = automaticInsurance({
      capitalEstimator: { fundAcquisitionCost: 0, projectedBasisRate: .032, scopeConfirmed: true, lossScopeConfirmed: true },
      bridge: { status: 'voluntary', circumstances: 'standard', capitalMode: 'automatic', capitalMonthlyToday: 123 },
      pension: { status: 'unknown', circumstances: 'standard', capitalMode: 'manual', capitalMonthlyToday: 456, drvSubsidy: 'not-received' },
    })
    const loaded = parsePersistedScenarioState(serializeScenarioState(state))
    expect(loaded.input.retirementInsurance).toEqual(state.input.retirementInsurance)
    expect(loaded.portfolioBuckets).toEqual(state.portfolioBuckets)
    delete state.input.retirementInsurance.capitalEstimator!.fundAcquisitionCost
    expect(parsePersistedScenarioState(serializeScenarioState(state)).input.retirementInsurance!.capitalEstimator!.fundAcquisitionCost).toBeUndefined()
  })
})
