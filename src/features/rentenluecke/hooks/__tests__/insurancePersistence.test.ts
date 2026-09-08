// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDefaultRetirementInsurance } from '../../model/retirementInsurance'
import { simulateScenario } from '../../model/simulateScenario'
import { simulateHistoricalBootstrapReferenceScenario, DEFAULT_HISTORICAL_RETURN_SERIES_IDS } from '../../model/historicalReturns'
import { createPortfolioComponents } from '../../model/stochasticReturns'
import { createDefaultState } from '../scenarioState/defaults'
import { loadInitialState, parsePersistedScenarioState, serializeScenarioState, STORAGE_KEY } from '../scenarioState/persistence'
import { useScenarioState } from '../useScenarioState'
import legacyResults from './fixtures/insuranceLegacyResults.json'
import { runHistoricalBootstrapSimulation } from '../../model/historicalReturns'
import type { HistoricalBootstrapSettings } from '../../model/historicalReturns'

beforeEach(() => localStorage.clear())

function oldState() {
  const state = createDefaultState()
  state.input = { ...state.input, currentAge: 67, retirementAge: 67, planningAge: 70 }
  state.retirementIncomeStreams = [
    { ...state.retirementIncomeStreams[0], amountMonthlyToday: 1234.56, effectiveDeductionRate: 0.2345 },
    { ...state.retirementIncomeStreams[0], id: 'second', name: 'Second', amountMonthlyToday: 789.12, effectiveDeductionRate: 0.175 },
    { ...state.retirementIncomeStreams[0], id: 'net', name: 'Net', amountMonthlyToday: 333.33, amountBasis: 'net' },
  ]
  state.input.retirementIncomeStreams = state.retirementIncomeStreams
  return state
}

describe('insurance persistence and migration', () => {
  // Captured by running HEAD d15baba86468cfc6210956a55e59687c9242e982 before the insurance changes, not by
  // comparing two inputs through the new implementation.
  it.each(legacyResults)('preserves the pre-insurance v$stored.version results and seeds exactly', (fixture) => {
    const state = parsePersistedScenarioState(JSON.stringify(fixture.stored))
    const input = { ...state.input, retirementIncomeStreams: state.retirementIncomeStreams }
    const settings = fixture.settings as HistoricalBootstrapSettings
    expect(simulateScenario(input)).toMatchObject(fixture.deterministic)
    expect(simulateHistoricalBootstrapReferenceScenario(input, settings)).toMatchObject(fixture.reference)
    expect(runHistoricalBootstrapSimulation(input, settings)).toEqual(fixture.bootstrap)
  })

  it('migrates v11 without changing numeric ledgers, capital search or sampled reference results', () => {
    const old = oldState()
    const legacyInput = { ...old.input, retirementIncomeStreams: old.retirementIncomeStreams }
    const settings = { portfolioComponents: createPortfolioComponents({ equity: 0.7, bonds: 0.2, fixed: 0.1 }, DEFAULT_HISTORICAL_RETURN_SERIES_IDS), inflationSourceId: old.historical.inflationSourceId, simulations: 3 }
    const before = simulateScenario(legacyInput)
    localStorage.setItem('rentenlueckenrechner.scenario.v11', JSON.stringify({ version: 11, ...old }))
    const migrated = loadInitialState()
    expect(migrated.retirementIncomeStreams).toEqual(old.retirementIncomeStreams)
    expect(migrated.input.retirementInsurance).toBeUndefined()
    const afterInput = { ...migrated.input, retirementIncomeStreams: migrated.retirementIncomeStreams }
    expect(simulateScenario(afterInput)).toEqual(before)
    expect(simulateHistoricalBootstrapReferenceScenario(afterInput, settings)).toEqual(simulateHistoricalBootstrapReferenceScenario(legacyInput, settings))
    for (const row of before.retirementRows) {
      // Independent legacy arithmetic: preserve per-stream rounding and summation order.
      const expectedNet = old.retirementIncomeStreams.reduce((sum, stream) => {
        const amount = stream.amountMonthlyToday * 12 * row.inflationFactor
        return sum + (stream.amountBasis === 'net' ? amount : amount - amount * stream.effectiveDeductionRate)
      }, 0)
      expect(row.retirementIncomeNet).toBe(expectedNet)
      expect(row.healthInsurance).toBe(0)
      expect(row.careInsurance).toBe(0)
      expect(row.retirementIncomeOtherDeductions).toBe(0)
    }
    const saved = serializeScenarioState(migrated)
    expect(JSON.parse(saved).version).toBe(12)
    expect(parsePersistedScenarioState(saved)).toEqual(migrated)
  })

  it('roundtrips rates, zero overrides, review decisions and both deduction modes', () => {
    const state = oldState()
    state.input.retirementInsurance = { ...createDefaultRetirementInsurance(), enabled: true, status: 'voluntary', portfolioBaseMonthlyToday: 800,
      rates: { pensionKv: 0.09, generalKv: 0.18, passiveKv: 0.17, pv: 0.042 } }
    state.retirementIncomeStreams[0] = { ...state.retirementIncomeStreams[0], separateDeductions: { otherRate: 0.05 }, insuranceTreatment: 'exclude', kvRateOverride: 0, pvRateOverride: 0.02 }
    state.retirementIncomeStreams[1] = { ...state.retirementIncomeStreams[1], insuranceTreatment: 'review' }
    const parsed = parsePersistedScenarioState(serializeScenarioState(state))
    expect(parsed.retirementIncomeStreams).toEqual(state.retirementIncomeStreams)
    expect(parsed.input.retirementInsurance).toEqual(state.input.retirementInsurance)
    expect(parsed.retirementIncomeStreams[0].effectiveDeductionRate).toBe(0.2345)
    expect(parsed.retirementIncomeStreams[1].separateDeductions).toBeUndefined()
  })

  it('loads v12 before legacy storage and falls back safely for malformed insurance', () => {
    const state = oldState()
    localStorage.setItem(STORAGE_KEY, serializeScenarioState(state))
    localStorage.setItem('rentenlueckenrechner.scenario.v11', JSON.stringify({ version: 11, ...createDefaultState() }))
    expect(loadInitialState().retirementIncomeStreams).toEqual(state.retirementIncomeStreams)
    const malformed = JSON.parse(serializeScenarioState(state))
    malformed.input.retirementInsurance = { ...createDefaultRetirementInsurance(), status: 'guessed' }
    expect(parsePersistedScenarioState(JSON.stringify(malformed))).toEqual(createDefaultState())
  })

  it('persists explicit opt-in/replacement, restores disabled results and rejects invalid updates', () => {
    localStorage.setItem(STORAGE_KEY, serializeScenarioState(oldState()))
    const { result, unmount } = renderHook(useScenarioState)
    const baseline = result.current.result
    const config = { ...createDefaultRetirementInsurance(), enabled: true, status: 'kvdr' as const }
    act(() => result.current.updateRetirementInsurance(config))
    expect(result.current.result).toEqual(baseline)
    act(() => result.current.updateRetirementIncomeStream('statutory-pension', { separateDeductions: { otherRate: 0.03 } }))
    expect(result.current.result!.retirementRows[0].healthInsurance).toBeGreaterThan(0)
    expect(parsePersistedScenarioState(localStorage.getItem(STORAGE_KEY)).input.retirementInsurance).toEqual(config)
    act(() => result.current.updateRetirementInsurance({ ...config, enabled: false }))
    expect(result.current.result).toEqual(baseline)
    const validStored = localStorage.getItem(STORAGE_KEY)
    act(() => result.current.updateRetirementInsurance({ ...config, rates: { ...config.rates, pv: Number.NaN } }))
    expect(result.current.isValid).toBe(false)
    expect(result.current.result).toBeNull()
    expect(localStorage.getItem(STORAGE_KEY)).toBe(validStored)
    unmount()
    const reloaded = renderHook(useScenarioState)
    expect(reloaded.result.current.input.retirementInsurance?.enabled).toBe(false)
    expect(reloaded.result.current.retirementIncomeStreams[0].separateDeductions).toEqual({ otherRate: 0.03 })
    expect(reloaded.result.current.result).toEqual(baseline)
  })
})
