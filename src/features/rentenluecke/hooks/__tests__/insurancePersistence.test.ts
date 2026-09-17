import { applyCoverage } from '../../model/insuranceCoverage'
// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { automaticInsurance, completedCoverage } from '../../model/__tests__/insuranceFixtures'
import { createDefaultState } from '../scenarioState/defaults'
import { createInitialLifecycleMilestones } from '../../model/lifecycleDraft'
import { LIFECYCLE_RESET_NOTICE_KEY, loadInitialState, parsePersistedScenarioState, serializeScenarioState, STORAGE_KEY, RESET_NOTICE_KEY } from '../scenarioState/persistence'
import { useScenarioState } from '../useScenarioState'

beforeEach(() => localStorage.clear())

describe('guided insurance persistence and app-owned reset', () => {
  it('discards every owned old scenario version, preserves unrelated storage and records one reset notice', () => {
    for (let version = 1; version <= 15; version++) localStorage.setItem(`rentenlueckenrechner.scenario.v${version}`, 'old')
    localStorage.setItem('another-app.scenario.v12', 'keep')
    localStorage.setItem('rentenlueckenrechner.preferences', 'keep')
    localStorage.setItem('rentenlueckenrechner.scenario.v17', 'future')
    expect(loadInitialState()).toEqual(createDefaultState())
    expect(Object.keys(localStorage).sort()).toEqual(['another-app.scenario.v12', 'rentenlueckenrechner.preferences', 'rentenlueckenrechner.scenario.v17', RESET_NOTICE_KEY, LIFECYCLE_RESET_NOTICE_KEY].sort())
    expect(localStorage.getItem(RESET_NOTICE_KEY)).toBe('1')
    expect(localStorage.getItem(LIFECYCLE_RESET_NOTICE_KEY)).toBe('1')
    localStorage.removeItem(RESET_NOTICE_KEY)
    localStorage.removeItem(LIFECYCLE_RESET_NOTICE_KEY)
    loadInitialState()
    expect(localStorage.getItem(RESET_NOTICE_KEY)).toBeNull()
    expect(localStorage.getItem(LIFECYCLE_RESET_NOTICE_KEY)).toBeNull()
  })
  it('preserves v16 when old keys coexist and roundtrips phase bases, family, gross/rental and shared rate overrides', () => {
    const state = createDefaultState()
    state.childrenAnswer = { kind: 'children', rows: [{ id: 'one', year: 2002 }, { id: 'two', year: 2002 }] }
    state.insuranceCoverageAnswers = completedCoverage()
    state.input.retirementInsurance = automaticInsurance({ childBirthYears: [2002, 2002], rates: { kvGeneralRate: 0, kvReducedRate: 0.15, pvBaseRate: 0.04 },
      bridge: { status: 'unsupported', kvMonthlyToday: 200, pvMonthlyToday: 0 },
      pension: { status: 'unknown', circumstances: 'standard', capitalMonthlyToday: 600, drvSubsidy: 'not-received' },
    })
    state.retirementIncomeStreams[0] = { ...state.retirementIncomeStreams[0], support: 'standard', effectiveDeductionRate: 0.15 }
    state.retirementIncomeStreams.push({ ...state.retirementIncomeStreams[0], id: 'rent', kind: 'rental-income', rentalAssessmentMonthlyToday: 123 })
    localStorage.setItem(STORAGE_KEY, serializeScenarioState(state))
    localStorage.setItem('rentenlueckenrechner.scenario.v12', 'old')
    const loaded = loadInitialState()
    expect(loaded.input.retirementInsurance).toEqual(applyCoverage(state.input.retirementInsurance!, state.insuranceCoverageAnswers))
    expect(loaded.retirementIncomeStreams).toEqual(state.retirementIncomeStreams)
    expect(JSON.parse(serializeScenarioState(loaded)).version).toBe(16)
  })
  it('roundtrips unanswered fields without fabricating confirmed zeros', () => {
    const state = createDefaultState()
    const loaded = parsePersistedScenarioState(serializeScenarioState(state))
    expect(loaded.input.retirementInsurance?.pension).toEqual({})
    expect(loaded.input.retirementInsurance?.insurerAdditionalRate).toBeUndefined()
    expect(loaded.retirementIncomeStreams[0].support).toBeUndefined()
    expect(parsePersistedScenarioState('{broken')).toEqual(state)
  })
  it('persists valid incomplete transitions and hides lifecycle results, then restores the completed forecast', () => {
    const state = createDefaultState()
    state.input = { ...state.input, currentAge: 65, planningAge: 70 }
    localStorage.setItem(STORAGE_KEY, serializeScenarioState(state))
    const { result, unmount } = renderHook(useScenarioState)
    expect(result.current.lifecycleValid).toBe(false)
    expect(result.current.lifecycleRun).toBeNull()
    act(() => result.current.updateRetirementIncomeStream('statutory-pension', { support: 'standard' }))
    act(() => result.current.updateChildrenAnswer({ kind: 'children', rows: [{ id: 'older', year: 1980 }] }))
    act(() => result.current.updateInsuranceCoverage(completedCoverage()))
    act(() => result.current.updateRetirementInsurance(automaticInsurance()))
    act(() => result.current.updateLifecycleClassification('equity', 'equityFund'))
    act(() => result.current.updateLifecycleClassification('bonds', 'bondFund'))
    act(() => result.current.updateLifecycleClassification('fixed', 'deposit'))
    act(() => result.current.updateLifecycleAcquisitionCost('equity', 0))
    act(() => result.current.updateLifecycleAcquisitionCost('bonds', 0))
    act(() => result.current.updateLifecycleTaxCashId('fixed'))
    act(() => result.current.initLifecycleMilestones())
    expect(result.current.lifecycleValid).toBe(true)
    expect(result.current.lifecycleRun).not.toBeNull()
    const complete = result.current.lifecycleRun
    act(() => result.current.updateRetirementInsurance(automaticInsurance({ insurerAdditionalRate: undefined })))
    expect(result.current.lifecycleRun).toBeNull()
    expect(parsePersistedScenarioState(localStorage.getItem(STORAGE_KEY)).input.retirementInsurance?.insurerAdditionalRate).toBeUndefined()
    unmount()
    const reloaded = renderHook(useScenarioState)
    expect(reloaded.result.current.lifecycleRun).toBeNull()
    act(() => reloaded.result.current.updateRetirementInsurance(automaticInsurance()))
    expect(reloaded.result.current.lifecycleRun).toEqual(complete)
    const validStored = localStorage.getItem(STORAGE_KEY)
    act(() => reloaded.result.current.updateRetirementInsurance(automaticInsurance({ insurerAdditionalRate: NaN })))
    expect(reloaded.result.current.lifecycleValid).toBe(false)
    expect(localStorage.getItem(STORAGE_KEY)).not.toBe(validStored)
    expect(parsePersistedScenarioState(localStorage.getItem(STORAGE_KEY)).input.retirementInsurance?.insurerAdditionalRate).toBeNaN()
    act(() => reloaded.result.current.reset())
    expect(reloaded.result.current.lifecycleRun).toBeNull()
    expect(reloaded.result.current.input.retirementInsurance?.pension).toEqual({})
  }, 20000)
})

describe('additive insurance estimator persistence', () => {
  it('keeps legacy manual amounts and unrelated state without a new reset', () => {
    const state = createDefaultState()
    state.childrenAnswer = { kind: 'children', rows: [{ id: 'one', year: 2002 }, { id: 'two', year: 2002 }] }
    state.insuranceCoverageAnswers = completedCoverage()
    state.input.retirementInsurance = automaticInsurance({ childBirthYears: [2002, 2002],
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
    state.childrenAnswer = { kind: 'children', rows: [{ id: 'one', year: 2002 }, { id: 'two', year: 2002 }] }
    state.insuranceCoverageAnswers = completedCoverage()
    state.input.retirementInsurance = automaticInsurance({ childBirthYears: [2002, 2002],
      capitalEstimator: { fundAcquisitionCost: 0, projectedBasisRate: .032, scopeConfirmed: true, lossScopeConfirmed: true },
      bridge: { status: 'voluntary', circumstances: 'standard', capitalMode: 'automatic', capitalMonthlyToday: 123 },
      pension: { status: 'unknown', circumstances: 'standard', capitalMode: 'manual', capitalMonthlyToday: 456, drvSubsidy: 'not-received' },
    })
    const loaded = parsePersistedScenarioState(serializeScenarioState(state))
    expect(loaded.input.retirementInsurance).toEqual(applyCoverage(state.input.retirementInsurance!, state.insuranceCoverageAnswers))
    expect(loaded.portfolioBuckets).toEqual(state.portfolioBuckets)
    delete state.input.retirementInsurance.capitalEstimator!.fundAcquisitionCost
    expect(parsePersistedScenarioState(serializeScenarioState(state)).input.retirementInsurance!.capitalEstimator!.fundAcquisitionCost).toBeUndefined()
  })
})

it('resets a fully populated previous-version scenario, not just its insurance fields', () => {
  const old = createDefaultState()
  old.input = { ...old.input, currentAge: 55, retirementAge: 61, planningAge: 99, monthlyContributionToday: 987, monthlyDesiredSpendingToday: 4321, annualInflationRate: .08, retirementInsurance: automaticInsurance({ insurerAdditionalRate: .09 }) }
  old.childrenAnswer = { kind: 'children', rows: [{ id: 'child', year: 2005 }] }
  old.insuranceCoverageAnswers = completedCoverage()
  old.portfolioBuckets = [{ id: 'old', name: 'Old portfolio', value: 123456, returnSeriesId: 'synthetic-equity-assumption-v1', holding: 'accumulating-equity-fund' }]
  old.retirementIncomeStreams[0].amountMonthlyToday = 7890
  old.historical.inflationSourceId = 'fixed-manual'
  old.explicitInsuranceTransition = 66
  const previous = JSON.parse(serializeScenarioState(old))
  previous.version = 14
  delete previous.insuranceCoverageAnswers // actual preceding version had no canonical coverage field
  localStorage.setItem('rentenlueckenrechner.scenario.v14', JSON.stringify(previous))
  localStorage.setItem('foreign', 'keep')
  expect(loadInitialState()).toEqual(createDefaultState())
  expect(localStorage.getItem('rentenlueckenrechner.scenario.v14')).toBeNull()
  expect(localStorage.getItem(RESET_NOTICE_KEY)).toBe('1')
  expect(localStorage.getItem('foreign')).toBe('keep')
})

it('retains valid lifecycle assumptions across reload, then clears only the manual preference', () => {
  const state = createDefaultState()
  state.input = { ...state.input, currentAge: 65, planningAge: 70, retirementInsurance: automaticInsurance({
    pension: { status: 'voluntary', circumstances: 'standard', capitalMode: 'manual', capitalMonthlyToday: 123, drvSubsidy: 'confirmed', kvMonthlyToday: 0, pvMonthlyToday: 0 },
  }) }
  state.childrenAnswer = { kind: 'none' }
  state.insuranceCoverageAnswers = completedCoverage()
  state.retirementIncomeStreams[0].support = 'standard'
  state.lifecycleClassification = { equity: 'equityFund', bonds: 'bondFund', fixed: 'deposit' }
  state.lifecycleAcquisitionCost = { equity: 45678, bonds: 0 }
  state.lifecycleTaxCashId = 'fixed'
  const created = createInitialLifecycleMilestones(65, state.input.retirementAge, state.portfolioBuckets, state.lifecycleClassification)
  state.lifecycleMilestones = created.milestones
  state.lifecycleTransitions = created.transitions
  localStorage.setItem(STORAGE_KEY, serializeScenarioState(state))
  const first = renderHook(useScenarioState)
  const original = first.result.current.lifecycleRun
  expect(original).not.toBeNull()
  expect(first.result.current.lifecycleValid).toBe(true)
  act(() => first.result.current.updateRetirementInsurance({ ...first.result.current.input.retirementInsurance!, pension: { ...first.result.current.input.retirementInsurance!.pension, manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 } }))
  expect(first.result.current.lifecycleRun).not.toBeNull()
  const manualRun = first.result.current.lifecycleRun
  expect(manualRun).not.toEqual(original)
  const retiredManual = manualRun?.years.find((y) => y.age === first.result.current.input.retirementAge)
  expect(retiredManual?.insurance.manual).toMatchObject({ kvMonthly: 0, pvMonthly: 0 })
  first.unmount()
  const restored = renderHook(useScenarioState)
  const retained = restored.result.current.input.retirementInsurance!
  expect(retained.pension).toMatchObject({ manual: true, capitalMonthlyToday: 123, drvSubsidy: 'confirmed', kvMonthlyToday: 0, pvMonthlyToday: 0 })
  expect(restored.result.current.lifecycleAcquisitionCost).toMatchObject({ equity: 45678 })
  expect(retained.insurerAdditionalRate).toBe(.029)
  expect(restored.result.current.lifecycleRun).toEqual(manualRun)
  act(() => restored.result.current.updateRetirementInsurance({ ...retained, pension: { ...retained.pension, manual: false } }))
  expect(restored.result.current.lifecycleRun).toEqual(original)
  const retiredAutomatic = restored.result.current.lifecycleRun?.years.find((y) => y.age === restored.result.current.input.retirementAge)
  expect(retiredAutomatic?.insurance.manual).toBeNull()
  expect(parsePersistedScenarioState(localStorage.getItem(STORAGE_KEY)).input.retirementInsurance!.pension.manual).toBe(false)
  // Reopening automatic coverage cannot infer a previously missing answer or consume retained totals.
  act(() => restored.result.current.updateInsuranceCoverage({ ...completedCoverage(), pension: { common: { kind: 'missing' } } }))
  expect(restored.result.current.lifecycleRun).toBeNull()
  expect(restored.result.current.issues.some(issue => issue.fieldPath === 'insuranceCoverageAnswers.pension.common')).toBe(true)
})
