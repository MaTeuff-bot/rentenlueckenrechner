import { applyCoverage } from '../../model/insuranceCoverage'
// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { automaticInsurance, completedCoverage } from '../../model/__tests__/insuranceFixtures'
import { SYNTHETIC_RETURN_SERIES_IDS } from '../../model/historicalReturns'
import { createDefaultState, createSyntheticHistoricalState } from '../scenarioState/defaults'
import { loadInitialState, parsePersistedScenarioState, serializeScenarioState, STORAGE_KEY, RESET_NOTICE_KEY, MANDATORY_CAPITAL_NOTICE_KEY } from '../scenarioState/persistence'
import { useScenarioState } from '../useScenarioState'

beforeEach(() => localStorage.clear())

describe('guided insurance persistence and app-owned reset', () => {
  it('discards every owned old scenario version, preserves unrelated storage and records one reset notice', () => {
    for (let version = 1; version <= 14; version++) localStorage.setItem(`rentenlueckenrechner.scenario.v${version}`, 'old')
    localStorage.setItem('another-app.scenario.v12', 'keep')
    localStorage.setItem('rentenlueckenrechner.preferences', 'keep')
    localStorage.setItem('rentenlueckenrechner.scenario.v16', 'future')
    expect(loadInitialState()).toEqual(createDefaultState())
    expect(Object.keys(localStorage).sort()).toEqual(['another-app.scenario.v12', 'rentenlueckenrechner.preferences', 'rentenlueckenrechner.scenario.v16', RESET_NOTICE_KEY].sort())
    expect(localStorage.getItem(RESET_NOTICE_KEY)).toBe('1')
    localStorage.removeItem(RESET_NOTICE_KEY)
    loadInitialState()
    expect(localStorage.getItem(RESET_NOTICE_KEY)).toBeNull()
  })
  it('preserves v15 when old keys coexist and roundtrips phase bases, family, gross/rental and shared rate overrides', () => {
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
    const { capitalMonthlyToday: _legacyCapital, ...expectedPension } = state.input.retirementInsurance!.pension
    void _legacyCapital
    expect(loaded.input.retirementInsurance).toEqual(applyCoverage({ ...state.input.retirementInsurance!, pension: expectedPension } as typeof state.input.retirementInsurance, state.insuranceCoverageAnswers))
    expect(JSON.parse(serializeScenarioState(loaded)).input.retirementInsurance.pension).not.toHaveProperty('capitalMonthlyToday')
    expect(loaded.retirementIncomeStreams).toEqual(state.retirementIncomeStreams)
    expect(JSON.parse(serializeScenarioState(loaded)).version).toBe(15)
  })
  it('roundtrips unanswered fields without fabricating confirmed zeros', () => {
    const state = createDefaultState()
    const loaded = parsePersistedScenarioState(serializeScenarioState(state))
    expect(loaded.input.retirementInsurance?.pension).toEqual({})
    expect(loaded.input.retirementInsurance?.insurerAdditionalRate).toBe(0.029)
    expect(loaded.retirementIncomeStreams[0]).toMatchObject({ kind: 'gesetzliche-rente', support: 'standard' })
    expect(parsePersistedScenarioState('{broken')).toEqual(state)
  })
  it('fills a missing insurer additional rate from legacy states with the 2026 average', () => {
    const state = createDefaultState()
    const raw = JSON.parse(serializeScenarioState(state))
    delete raw.input.retirementInsurance.insurerAdditionalRate
    expect(parsePersistedScenarioState(JSON.stringify(raw)).input.retirementInsurance?.insurerAdditionalRate).toBe(0.029)
  })
  it('fills a missing life table sex from legacy states with the conservative display', () => {
    const state = createDefaultState()
    expect(state.input.lifeTableSex).toBe('conservative')
    const raw = JSON.parse(serializeScenarioState(state))
    expect(raw.version).toBe(15)
    delete raw.input.lifeTableSex
    expect(parsePersistedScenarioState(JSON.stringify(raw)).input.lifeTableSex).toBe('conservative')
    const male = { ...state, input: { ...state.input, lifeTableSex: 'male' as const } }
    expect(parsePersistedScenarioState(serializeScenarioState(male)).input.lifeTableSex).toBe('male')
  })
  it('persists valid incomplete transitions and hides results, then restores the completed forecast', () => {
    const state = createDefaultState()
    state.input = { ...state.input, currentAge: 65, retirementAge: 65, planningAge: 68 }
    state.historical = createSyntheticHistoricalState()
    state.portfolioBuckets = [{ id: 'fund', name: 'Fonds', value: 50000, returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.equity, holding: 'accumulating-equity-fund' }]
    state.portfolioEstimatorSettings = { fundAcquisitionCost: 0, projectedBasisRate: 0.032, scopeConfirmed: true, lossScopeConfirmed: true }
    localStorage.setItem(STORAGE_KEY, serializeScenarioState(state))
    const { result, unmount } = renderHook(useScenarioState)
    expect(result.current.isValid).toBe(false)
    act(() => result.current.updateRetirementIncomeStream('statutory-pension', { support: 'standard' }))
    act(() => result.current.updateChildrenAnswer({ kind: 'children', rows: [{ id: 'older', year: 1980 }] }))
    act(() => result.current.updateInsuranceCoverage(completedCoverage()))
    act(() => result.current.updateRetirementInsurance(automaticInsurance()))
    expect(result.current.isValid).toBe(true)
    const complete = result.current.result
    act(() => result.current.updateRetirementInsurance(automaticInsurance({ pension: { circumstances: 'standard' } })))
    expect(result.current.result).toBeNull()
    expect(parsePersistedScenarioState(localStorage.getItem(STORAGE_KEY)).input.retirementInsurance?.pension.status).toBeUndefined()
    unmount()
    const reloaded = renderHook(useScenarioState)
    expect(reloaded.result.current.result).toBeNull()
    act(() => reloaded.result.current.updateRetirementInsurance(automaticInsurance()))
    expect(reloaded.result.current.result).toEqual(complete)
    const validStored = localStorage.getItem(STORAGE_KEY)
    act(() => reloaded.result.current.updateRetirementInsurance(automaticInsurance({ insurerAdditionalRate: NaN })))
    expect(reloaded.result.current.isValid).toBe(false)
    expect(localStorage.getItem(STORAGE_KEY)).not.toBe(validStored)
    expect(parsePersistedScenarioState(localStorage.getItem(STORAGE_KEY)).input.retirementInsurance?.insurerAdditionalRate).toBeNaN()
    act(() => reloaded.result.current.reset())
    expect(reloaded.result.current.result).toBeNull()
    expect(reloaded.result.current.input.retirementInsurance?.pension).toEqual({})
  })
})

describe('additive insurance estimator persistence', () => {
  it('tolerates legacy manual estimates on load, keeps unrelated state and raises the honest change notice', () => {
    const state = createDefaultState()
    state.childrenAnswer = { kind: 'children', rows: [{ id: 'one', year: 2002 }, { id: 'two', year: 2002 }] }
    state.insuranceCoverageAnswers = completedCoverage()
    state.input.retirementInsurance = automaticInsurance({ childBirthYears: [2002, 2002],
      pension: { status: 'voluntary', circumstances: 'standard', drvSubsidy: 'not-received' },
    })
    // Pre-change storage still carries per-phase manual capital estimates;
    // current serialization never writes them, so re-inject them raw.
    const raw = JSON.parse(serializeScenarioState(state))
    expect(raw.input.retirementInsurance.pension).not.toHaveProperty('capitalMonthlyToday')
    raw.input.retirementInsurance.bridge.capitalMode = 'manual'
    raw.input.retirementInsurance.bridge.capitalMonthlyToday = 100
    raw.input.retirementInsurance.pension.capitalMonthlyToday = 321
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw))
    localStorage.setItem('unrelated', 'keep')
    const loaded = loadInitialState()
    expect(loaded.input.retirementInsurance!.bridge.capitalMonthlyToday).toBe(100)
    expect(loaded.input.retirementInsurance!.pension.capitalMonthlyToday).toBe(321)
    expect(loaded.portfolioBuckets).toEqual(state.portfolioBuckets)
    expect(loaded.historical).toEqual(state.historical)
    expect(localStorage.getItem('unrelated')).toBe('keep')
    expect(localStorage.getItem(RESET_NOTICE_KEY)).toBeNull()
    expect(localStorage.getItem(MANDATORY_CAPITAL_NOTICE_KEY)).toBe('pending')
    // Re-saving drops the retired engine meaning while retaining holdings and settings.
    const resaved = JSON.parse(serializeScenarioState(loaded))
    expect(resaved.input.retirementInsurance.bridge).not.toHaveProperty('capitalMonthlyToday')
    expect(resaved.input.retirementInsurance.bridge).not.toHaveProperty('capitalMode')
    expect(resaved.input.retirementInsurance.pension).not.toHaveProperty('capitalMonthlyToday')
    expect(loaded.input.retirementInsurance!.pension).toMatchObject({ status: 'voluntary', circumstances: 'standard', drvSubsidy: 'not-received' })
  })
  it('roundtrips classifications, confirmed zero cost, projected rate and independent phase modes', () => {
    const state = createDefaultState()
    state.portfolioBuckets[0].holding = 'accumulating-equity-fund'
    state.childrenAnswer = { kind: 'children', rows: [{ id: 'one', year: 2002 }, { id: 'two', year: 2002 }] }
    state.insuranceCoverageAnswers = completedCoverage()
    state.portfolioEstimatorSettings = { fundAcquisitionCost: 0, projectedBasisRate: .032, scopeConfirmed: true, lossScopeConfirmed: true }
    state.input.retirementInsurance = automaticInsurance({ childBirthYears: [2002, 2002],
      bridge: { status: 'voluntary', circumstances: 'standard', capitalMode: 'automatic', capitalMonthlyToday: 123 },
      pension: { status: 'unknown', circumstances: 'standard', capitalMode: 'manual', capitalMonthlyToday: 456, drvSubsidy: 'not-received' },
    })
    const serialized = serializeScenarioState(state)
    expect(JSON.parse(serialized).input.retirementInsurance.capitalEstimator).toEqual({ fundAcquisitionCost: 0, projectedBasisRate: .032, scopeConfirmed: true, lossScopeConfirmed: true })
    expect(JSON.parse(serialized)).not.toHaveProperty('portfolioEstimatorSettings')
    expect(JSON.parse(serialized).input.retirementInsurance.bridge).not.toHaveProperty('capitalMonthlyToday')
    expect(JSON.parse(serialized).input.retirementInsurance.bridge).not.toHaveProperty('capitalMode')
    expect(JSON.parse(serialized).input.retirementInsurance.pension).not.toHaveProperty('capitalMonthlyToday')
    expect(JSON.parse(serialized).input.retirementInsurance.pension).not.toHaveProperty('capitalMode')
    const loaded = parsePersistedScenarioState(serialized)
    const { capitalEstimator: _dropped, bridge: _bridge, pension: _pension, ...expectedRest } = state.input.retirementInsurance!
    void _dropped
    const { capitalMode: _bMode, capitalMonthlyToday: _bCapital, ...expectedBridge } = _bridge
    void _bMode
    void _bCapital
    const { capitalMode: _pMode, capitalMonthlyToday: _pCapital, ...expectedPension } = _pension
    void _pMode
    void _pCapital
    expect(loaded.input.retirementInsurance).toEqual(applyCoverage({ ...expectedRest, bridge: expectedBridge, pension: expectedPension } as import('../../model/retirementInsurance').RetirementInsurance, state.insuranceCoverageAnswers))
    expect(loaded.portfolioEstimatorSettings).toEqual({ fundAcquisitionCost: 0, projectedBasisRate: .032, scopeConfirmed: true, lossScopeConfirmed: true })
    expect(loaded.portfolioBuckets).toEqual(state.portfolioBuckets)
    delete state.portfolioEstimatorSettings!.fundAcquisitionCost
    expect(parsePersistedScenarioState(serializeScenarioState(state)).portfolioEstimatorSettings?.fundAcquisitionCost).toBeUndefined()
    expect(JSON.parse(serializeScenarioState(state)).input.retirementInsurance.capitalEstimator).not.toHaveProperty('fundAcquisitionCost')
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

it('ignores legacy per-phase capital estimates, retains portfolio settings and an honest notice across reload', () => {
  const state = createDefaultState()
  state.portfolioEstimatorSettings = { fundAcquisitionCost: 45678, projectedBasisRate: .032, scopeConfirmed: true, lossScopeConfirmed: true }
  state.input = { ...state.input, currentAge: 67, retirementAge: 67, planningAge: 68, retirementInsurance: automaticInsurance({
    pension: { status: 'unknown', circumstances: 'standard', drvSubsidy: 'confirmed', kvMonthlyToday: 0, pvMonthlyToday: 0 },
  }) }
  state.childrenAnswer = { kind: 'none' }
  state.insuranceCoverageAnswers = completedCoverage()
  state.retirementIncomeStreams[0].support = 'standard'
  state.historical = createSyntheticHistoricalState()
  state.portfolioBuckets = [{ id: 'fund', name: 'Fonds', value: 100000, returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.equity, holding: 'accumulating-equity-fund' }]
  // Pre-change storage still carries the retired per-phase estimate; current
  // serialization never writes it, so re-inject it raw before storing.
  const raw = JSON.parse(serializeScenarioState(state))
  expect(raw.input.retirementInsurance.pension).not.toHaveProperty('capitalMonthlyToday')
  raw.input.retirementInsurance.pension.capitalMode = 'manual'
  raw.input.retirementInsurance.pension.capitalMonthlyToday = 123
  expect(localStorage.getItem(MANDATORY_CAPITAL_NOTICE_KEY)).toBeNull()
  localStorage.setItem(STORAGE_KEY, JSON.stringify(raw))
  const first = renderHook(useScenarioState)
  // Tolerated on load, never reinterpreted as a tax/income fact or eligibility.
  expect(first.result.current.input.retirementInsurance!.pension.capitalMonthlyToday).toBe(123)
  expect(localStorage.getItem(MANDATORY_CAPITAL_NOTICE_KEY)).toBe('pending')
  expect(localStorage.getItem(RESET_NOTICE_KEY)).toBeNull()
  expect(first.result.current.portfolioEstimatorSettings?.fundAcquisitionCost).toBe(45678)
  expect(first.result.current.portfolioEstimatorReadiness.ready).toBe(true)
  const original = first.result.current.result
  expect(original).not.toBeNull()
  // Dropping the tolerated legacy fields changes nothing: the engine never read them.
  const pension = first.result.current.input.retirementInsurance!.pension
  act(() => first.result.current.updateRetirementInsurance({ ...first.result.current.input.retirementInsurance!,
    pension: { status: pension.status, circumstances: pension.circumstances, drvSubsidy: pension.drvSubsidy, kvMonthlyToday: pension.kvMonthlyToday, pvMonthlyToday: pension.pvMonthlyToday } }))
  expect(first.result.current.result).toEqual(original)
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).input.retirementInsurance.pension).not.toHaveProperty('capitalMonthlyToday')
  // Whole-phase manual totals still work independently of the retired estimate.
  // Single-year pension horizon keeps the bootstrap cheap; the manual pension phase starts at 67.
  const pensionRow = () => first.result.current.result!.retirementRows.find(row => row.ageStart === 67)!
  expect(pensionRow().healthInsurance).toBeGreaterThan(0)
  act(() => first.result.current.updateRetirementInsurance({ ...first.result.current.input.retirementInsurance!, pension: { ...first.result.current.input.retirementInsurance!.pension, manual: true } }))
  expect(pensionRow().healthInsurance).toBe(0)
  expect(pensionRow().careInsurance).toBe(0)
  first.unmount()
  const restored = renderHook(useScenarioState)
  const retained = restored.result.current.input.retirementInsurance!
  expect(retained.pension).toMatchObject({ manual: true, drvSubsidy: 'confirmed', kvMonthlyToday: 0, pvMonthlyToday: 0 })
  expect(retained.pension).not.toHaveProperty('capitalMonthlyToday')
  expect(restored.result.current.portfolioEstimatorSettings?.fundAcquisitionCost).toBe(45678)
  expect(restored.result.current.portfolioEstimatorReadiness.ready).toBe(true)
  expect(localStorage.getItem(MANDATORY_CAPITAL_NOTICE_KEY)).toBe('pending')
  expect(retained.insurerAdditionalRate).toBe(.029)
  act(() => restored.result.current.updateRetirementInsurance({ ...retained, pension: { ...retained.pension, manual: false } }))
  expect(restored.result.current.result).toEqual(original)
  expect(restored.result.current.result!.retirementRows.find(row => row.ageStart === 67)!.healthInsurance).toBeGreaterThan(0)
  expect(parsePersistedScenarioState(localStorage.getItem(STORAGE_KEY)).input.retirementInsurance!.pension.manual).toBe(false)
  // Reopening automatic coverage cannot infer a previously missing answer or consume retained totals.
  act(() => restored.result.current.updateInsuranceCoverage({ ...completedCoverage(), pension: { common: { kind: 'missing' } } }))
  expect(restored.result.current.result).toBeNull()
  expect(restored.result.current.issues.some(issue => issue.fieldPath === 'insuranceCoverageAnswers.pension.common')).toBe(true)
})

it('updates and persists the life table sex selection', () => {
  const { result } = renderHook(useScenarioState)
  expect(result.current.input.lifeTableSex).toBe('conservative')
  act(() => result.current.updateLifeTableSex('male'))
  expect(result.current.input.lifeTableSex).toBe('male')
  expect(parsePersistedScenarioState(localStorage.getItem(STORAGE_KEY)).input.lifeTableSex).toBe('male')
})
