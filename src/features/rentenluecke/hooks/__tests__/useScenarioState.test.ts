// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_INPUT } from '../../model/defaults'
import { DEFAULT_HISTORICAL_RETURN_SERIES_IDS, SYNTHETIC_RETURN_SERIES_IDS } from '../../model/historicalReturns'
import { calculateAllocationFromBuckets, calculatePortfolioBucketTotal } from '../../model/portfolioBuckets'
import { calculatePortfolioExpectedReturn, DEFAULT_ASSET_ALLOCATION } from '../../model/stochasticReturns'
import { useScenarioState } from '../useScenarioState'
import { automaticInsurance, completedCoverage } from '../../model/__tests__/insuranceFixtures'
import { createDefaultState, createSyntheticHistoricalState } from '../scenarioState/defaults'
import { parsePersistedScenarioState, serializeScenarioState } from '../scenarioState/persistence'

beforeEach(() => {
  localStorage.clear()
})

function persistedJson(value: unknown): string {
  return JSON.stringify(value)
}

describe('parsePersistedScenarioState', () => {
  it('roundtrips a v15 scenario with income streams and annual bucket costs', () => {
    const scenario = {
      ...createDefaultState(),
      portfolioBuckets: [
        { id: 'world-etf', name: 'World ETF', value: 35_000, returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.equity, annualCostRate: 0.0022 },
        { id: 'bonds', name: 'Bonds', value: 10_000, returnSeriesId: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.bond, annualCostRate: 0.001 },
        { id: 'cash-reserve', name: 'Reserve', value: 5_000, returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.cash, annualCostRate: 0 },
      ],
    }

    expect(parsePersistedScenarioState(serializeScenarioState(scenario))).toEqual(scenario)
    expect(JSON.parse(serializeScenarioState(scenario))).toMatchObject({
      version: 15,
      portfolioBuckets: scenario.portfolioBuckets,
    })
    expect(JSON.parse(serializeScenarioState(scenario))).not.toHaveProperty('allocation')
    expect(JSON.parse(serializeScenarioState(scenario))).not.toHaveProperty('historical.returnSeriesIds')
    expect(JSON.parse(serializeScenarioState(scenario)).portfolioBuckets.every((bucket: object) => !('role' in bucket))).toBe(true)
  })

  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])('falls back to defaults for a v%i shape', (version) => {
    expect(parsePersistedScenarioState(persistedJson({
      version,
      input: { ...DEFAULT_INPUT, currentCapital: 123_456 },
      allocation: { equity: 0, bonds: 0, fixed: 1 },
    }))).toEqual(createDefaultState())
  })

  it('falls back to defaults for invalid v6 data', () => {
    expect(parsePersistedScenarioState(persistedJson({
      version: 6,
      input: DEFAULT_INPUT,
      allocation: DEFAULT_ASSET_ALLOCATION,
      historical: createDefaultState().historical,
    }))).toEqual(createDefaultState())
  })
})

describe('historical simulations setting', () => {
  it('roundtrips an explicit count and keeps the default when absent', () => {
    const scenario = { ...createDefaultState(), historical: { inflationSourceId: 'fixed-manual', simulations: 250 } }
    expect(parsePersistedScenarioState(serializeScenarioState(scenario)).historical).toEqual({ inflationSourceId: 'fixed-manual', simulations: 250 })
    const legacy = { ...createDefaultState(), historical: { inflationSourceId: 'fixed-manual' } }
    expect(parsePersistedScenarioState(serializeScenarioState(legacy)).historical).toEqual({ inflationSourceId: 'fixed-manual' })
  })

  it('updates the persisted simulations count through updateSimulations', () => {
    localStorage.clear()
    const { result } = renderHook(() => useScenarioState())
    act(() => result.current.updateSimulations(250))
    const persisted = JSON.parse(localStorage.getItem('rentenlueckenrechner.scenario.v15')!)
    expect(persisted.historical.simulations).toBe(250)
  })
})

describe('createDefaultState', () => {
  it('creates buckets matching the default capital and allocation', () => {
    const state = createDefaultState()

    expect(calculatePortfolioBucketTotal(state.portfolioBuckets)).toBe(DEFAULT_INPUT.currentCapital)
    expect(calculateAllocationFromBuckets(state.portfolioBuckets)).toEqual(DEFAULT_ASSET_ALLOCATION)
  })
})

describe('useScenarioState', () => {
  it('keeps new scenarios incomplete until insurance questions are answered', () => {
    const { result } = renderHook(useScenarioState)
    expect(result.current.result).toBeNull()
    expect(result.current.stochasticSummary).toBeNull()
    expect(result.current.insuranceIssues.length).toBeGreaterThan(0)
  })

  it('derives input, allocation, and historical components from persisted buckets', () => {
    const persisted = createDefaultState()
    persisted.input = { ...persisted.input, currentCapital: 999_999, annualReturnBeforeRetirement: 0, annualReturnInRetirement: 0 }
    persisted.portfolioBuckets = [
      { id: 'world', name: 'World ETF', value: 30_000, returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.equity },
      { id: 'small-cap', name: 'Small Cap', value: 5_000, returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.equity },
      { id: 'bonds', name: 'Bonds', value: 10_000, returnSeriesId: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.bond },
      { id: 'reserve', name: 'Reserve', value: 5_000, returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.cash },
      { id: 'zero', name: 'Zero', value: 0, returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.cash },
    ]
    localStorage.setItem(
      'rentenlueckenrechner.scenario.v15',
      serializeScenarioState(persisted),
    )

    const { result } = renderHook(() => useScenarioState())
    const expectedAllocation = { equity: 0.7, bonds: 0.2, fixed: 0.1 }

    expect(result.current.input.currentCapital).toBe(50_000)
    expect(result.current.allocation).toEqual(expectedAllocation)
    expect(result.current.input.annualReturnBeforeRetirement).toBe(calculatePortfolioExpectedReturn(expectedAllocation))
    expect(result.current.input.annualReturnInRetirement).toBe(calculatePortfolioExpectedReturn(expectedAllocation))
    expect(result.current.historicalSettings.portfolioComponents).toEqual([
      { id: 'world', label: 'World ETF', role: 'equity', weight: 0.6, returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.equity, annualCostRate: 0 },
      { id: 'small-cap', label: 'Small Cap', role: 'equity', weight: 0.1, returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.equity, annualCostRate: 0 },
      { id: 'bonds', label: 'Bonds', role: 'bond', weight: 0.2, returnSeriesId: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.bond, annualCostRate: 0 },
      { id: 'reserve', label: 'Reserve', role: 'cash', weight: 0.1, returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.cash, annualCostRate: 0 },
      // Zero-balance declared destinations stay in the component list with
      // weight 0 so reference/sample paths carry their real returns (a future
      // allocation destination must earn real returns once the event invests).
      { id: 'zero', label: 'Zero', role: 'cash', weight: 0, returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.cash, annualCostRate: 0 },
    ])

    act(() => result.current.updateField('currentCapital', 100_000))
    expect(calculatePortfolioBucketTotal(result.current.portfolioBuckets)).toBe(100_000)
    expect(result.current.allocation).toEqual(expectedAllocation)
    expect(result.current.portfolioBuckets.map((bucket) => bucket.returnSeriesId)).toEqual([
      SYNTHETIC_RETURN_SERIES_IDS.equity,
      SYNTHETIC_RETURN_SERIES_IDS.equity,
      DEFAULT_HISTORICAL_RETURN_SERIES_IDS.bond,
      SYNTHETIC_RETURN_SERIES_IDS.cash,
      SYNTHETIC_RETURN_SERIES_IDS.cash,
    ])
  })

  it('derives allocation category when a bucket source changes', () => {
    const { result } = renderHook(() => useScenarioState())
    const equity = result.current.portfolioBuckets.find((bucket) => bucket.id === 'equity')!

    act(() => result.current.updatePortfolioBucket(equity.id, { returnSeriesId: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.cash }))

    expect(result.current.portfolioBuckets.find((bucket) => bucket.id === equity.id)).toMatchObject({
      returnSeriesId: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.cash,
    })
    expect(result.current.allocation.equity).toBe(0)
    expect(result.current.allocation.bonds).toBeCloseTo(0.2)
    expect(result.current.allocation.fixed).toBeCloseTo(0.8)
  })

  it('updates output and supports adding/removing retirement income streams', () => {
    const state = createDefaultState()
    state.childrenAnswer = { kind: 'none' }
    state.insuranceCoverageAnswers = completedCoverage()
    state.retirementIncomeStreams[0].support = 'standard'
    state.input = { ...state.input, currentAge: 67, retirementAge: 67, planningAge: 68, retirementInsurance: automaticInsurance() }
    state.historical = createSyntheticHistoricalState()
    state.portfolioBuckets = [{ id: 'fund', name: 'Fonds', value: 100000, returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.equity, holding: 'accumulating-equity-fund' }]
    state.portfolioEstimatorSettings = { fundAcquisitionCost: 0, projectedBasisRate: 0.032, scopeConfirmed: true, lossScopeConfirmed: true }
    localStorage.setItem('rentenlueckenrechner.scenario.v15', serializeScenarioState(state))
    const { result } = renderHook(() => useScenarioState())
    act(() => result.current.updateRetirementInsurance({ ...result.current.input.retirementInsurance!, pension: { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 } }))
    const pension = result.current.retirementIncomeStreams[0]
    const gapBefore = result.current.result!.retirementRows[0].gapWithdrawal

    act(() => result.current.updateRetirementIncomeStream(pension.id, { effectiveDeductionRate: 0.2 }))
    // The 20 % haircut lands in other deductions; automatic voluntary KV/PV now
    // additionally assess the modeled capital base, so the honest identity keeps
    // every deduction explicit instead of assuming contributions away.
    const updatedRow = result.current.result!.retirementRows[0]
    expect(updatedRow.retirementIncomeNet).toBeCloseTo(updatedRow.retirementIncomeGross
      - updatedRow.retirementIncomeOtherDeductions
      - updatedRow.healthInsurance
      - updatedRow.careInsurance
      - (updatedRow.pensionIncomeTax ?? 0))
    expect(result.current.result!.retirementRows[0].gapWithdrawal).toBeGreaterThan(gapBefore)

    act(() => result.current.addRetirementIncomeStream())
    expect(result.current.retirementIncomeStreams).toHaveLength(2)
    const added = result.current.retirementIncomeStreams[1]
    expect(added).toMatchObject({ kind: 'gesetzliche-rente', support: 'standard', name: 'Gesetzliche Rente' })
    act(() => result.current.removeRetirementIncomeStream(added.id))
    expect(result.current.retirementIncomeStreams).toHaveLength(1)
  })
})

describe('allocation at retirement draft lifecycle', () => {
  const classifyHoldings = (hook: { current: ReturnType<typeof useScenarioState> }) => {
    const buckets = hook.current.portfolioBuckets
    act(() => {
      hook.current.updatePortfolioBucket(buckets[0].id, { holding: 'accumulating-equity-fund' })
      hook.current.updatePortfolioBucket(buckets[1].id, { holding: 'ordinary-bank-deposit' })
    })
  }

  it('prefills starting shares without enabling, accepting, or engaging the engine', () => {
    localStorage.clear()
    const { result } = renderHook(() => useScenarioState())
    classifyHoldings(result)
    act(() => result.current.prefillAllocationAtRetirement())
    const draft = result.current.allocationAtRetirement
    expect(draft).toBeDefined()
    expect(draft!.enabled).toBe(false)
    expect(draft!.accepted).toBe(false)
    expect(draft!.fixedTargets).toEqual([])
    const buckets = result.current.portfolioBuckets
    const total = buckets[0].value + buckets[1].value
    expect(draft!.remainderWeights[buckets[0].id]).toBeCloseTo(buckets[0].value / total, 9)
    expect(draft!.remainderWeights[buckets[1].id]).toBeCloseTo(buckets[1].value / total, 9)
    // Absent from the engine until accepted AND enabled.
    expect(result.current.input.allocationAtRetirement).toBeUndefined()
  })

  it('accepts, enables, and exposes the engine spec; edits revoke acceptance', () => {
    localStorage.clear()
    const { result } = renderHook(() => useScenarioState())
    classifyHoldings(result)
    act(() => result.current.prefillAllocationAtRetirement())
    // Enabling before accept is refused.
    act(() => result.current.setAllocationAtRetirementEnabled(true))
    expect(result.current.allocationAtRetirement!.enabled).toBe(false)
    act(() => result.current.acceptAllocationAtRetirement())
    expect(result.current.allocationAtRetirement!.accepted).toBe(true)
    act(() => result.current.setAllocationAtRetirementEnabled(true))
    expect(result.current.allocationAtRetirement!.enabled).toBe(true)
    expect(result.current.input.allocationAtRetirement).toMatchObject({ enabled: true, accepted: true })
    // Ordinary target edits preserve the numbers but revoke acceptance (and the
    // engine spec) until explicit re-accept.
    const bucketId = result.current.portfolioBuckets[0].id
    act(() => result.current.updateAllocationFixedTarget(bucketId, 1000))
    expect(result.current.allocationAtRetirement!.accepted).toBe(false)
    expect(result.current.allocationAtRetirement!.fixedTargets).toEqual([{ bucketId, amountToday: 1000 }])
    expect(result.current.input.allocationAtRetirement).toBeUndefined()
    act(() => result.current.acceptAllocationAtRetirement())
    expect(result.current.input.allocationAtRetirement).toMatchObject({
      enabled: true, accepted: true, fixedTargets: [{ bucketId, amountToday: 1000 }],
    })
    // Reset removes the draft entirely (absent means disabled).
    act(() => result.current.resetAllocationAtRetirement())
    expect(result.current.allocationAtRetirement).toBeUndefined()
    expect(result.current.input.allocationAtRetirement).toBeUndefined()
  })

  it('keeps deleted destinations as dangling choices that block until repaired', () => {
    localStorage.clear()
    const { result } = renderHook(() => useScenarioState())
    classifyHoldings(result)
    act(() => result.current.prefillAllocationAtRetirement())
    const victim = result.current.portfolioBuckets[0].id
    act(() => result.current.updateAllocationFixedTarget(victim, 500))
    act(() => result.current.acceptAllocationAtRetirement())
    act(() => result.current.setAllocationAtRetirementEnabled(true))
    expect(result.current.input.allocationAtRetirement).toBeDefined()
    // Deleting the destination preserves the entry and revokes acceptance.
    act(() => result.current.removePortfolioBucket(victim))
    const draft = result.current.allocationAtRetirement!
    expect(draft.accepted).toBe(false)
    expect(draft.fixedTargets).toEqual([{ bucketId: victim, amountToday: 500 }])
    // Re-accept is refused while dangling; the vermoegen issue links the field.
    act(() => result.current.acceptAllocationAtRetirement())
    expect(result.current.allocationAtRetirement!.accepted).toBe(false)
    const codes = result.current.issues.map(issue => issue.fieldId)
    expect(codes).toContain(`allocation-dangling-${victim}`)
    // Repair (remove target) plus accept re-engages the engine.
    act(() => result.current.removeAllocationTarget(victim))
    act(() => result.current.acceptAllocationAtRetirement())
    expect(result.current.allocationAtRetirement!.accepted).toBe(true)
    expect(result.current.allocationAtRetirement!.fixedTargets).toEqual([])
  })

  it('roundtrips the draft through v15 persistence with the engine spec stripped', () => {
    localStorage.clear()
    const { result } = renderHook(() => useScenarioState())
    classifyHoldings(result)
    act(() => result.current.prefillAllocationAtRetirement())
    act(() => result.current.acceptAllocationAtRetirement())
    act(() => result.current.setAllocationAtRetirementEnabled(true))
    const persisted = JSON.parse(localStorage.getItem('rentenlueckenrechner.scenario.v15')!)
    expect(persisted.allocationAtRetirement).toMatchObject({ enabled: true, accepted: true })
    expect(persisted.input.allocationAtRetirement).toBeUndefined()
    // Reload recomputes the engine spec from the persisted draft.
    const { result: reloaded } = renderHook(() => useScenarioState())
    expect(reloaded.current.allocationAtRetirement).toMatchObject({ enabled: true, accepted: true })
    expect(reloaded.current.input.allocationAtRetirement).toMatchObject({ enabled: true, accepted: true })
  })
})

describe('allocation fixed-priority order and destination-set changes', () => {
  const classifyHoldings = (hook: { current: ReturnType<typeof useScenarioState> }) => {
    const buckets = hook.current.portfolioBuckets
    act(() => {
      hook.current.updatePortfolioBucket(buckets[0].id, { holding: 'accumulating-equity-fund' })
      hook.current.updatePortfolioBucket(buckets[1].id, { holding: 'ordinary-bank-deposit' })
    })
  }
  const acceptTwoFixed = (hook: { current: ReturnType<typeof useScenarioState> }) => {
    const buckets = hook.current.portfolioBuckets
    act(() => hook.current.prefillAllocationAtRetirement())
    act(() => hook.current.updateAllocationFixedTarget(buckets[0].id, 1000))
    act(() => hook.current.updateAllocationFixedTarget(buckets[1].id, 2000))
    act(() => hook.current.acceptAllocationAtRetirement())
    expect(hook.current.allocationAtRetirement!.accepted).toBe(true)
  }
  it('moves fixed priorities in engine order and revokes acceptance', () => {
    localStorage.clear()
    const { result } = renderHook(() => useScenarioState())
    classifyHoldings(result)
    acceptTwoFixed(result)
    const buckets = result.current.portfolioBuckets
    expect(result.current.allocationAtRetirement!.fixedTargets.map(t => t.bucketId))
      .toEqual([buckets[0].id, buckets[1].id])
    // Moving the second priority up swaps the engine array order exactly.
    act(() => result.current.moveAllocationFixedTarget(buckets[1].id, -1))
    expect(result.current.allocationAtRetirement!.fixedTargets.map(t => t.bucketId))
      .toEqual([buckets[1].id, buckets[0].id])
    expect(result.current.allocationAtRetirement!.accepted).toBe(false)
    expect(result.current.input.allocationAtRetirement).toBeUndefined()
    // Moving back down restores the original order; re-accept re-engages.
    act(() => result.current.moveAllocationFixedTarget(buckets[1].id, 1))
    expect(result.current.allocationAtRetirement!.fixedTargets.map(t => t.bucketId))
      .toEqual([buckets[0].id, buckets[1].id])
    act(() => result.current.acceptAllocationAtRetirement())
    expect(result.current.allocationAtRetirement!.accepted).toBe(true)
    expect(result.current.allocationAtRetirement!.fixedTargets).toEqual([
      { bucketId: buckets[0].id, amountToday: 1000 }, { bucketId: buckets[1].id, amountToday: 2000 },
    ])
    // Out-of-range moves are no-ops that keep acceptance.
    act(() => result.current.moveAllocationFixedTarget(buckets[0].id, -1))
    expect(result.current.allocationAtRetirement!.accepted).toBe(true)
  })
  it('removes only the fixed amount and keeps the remainder weight', () => {
    localStorage.clear()
    const { result } = renderHook(() => useScenarioState())
    classifyHoldings(result)
    acceptTwoFixed(result)
    const buckets = result.current.portfolioBuckets
    const weightBefore = result.current.allocationAtRetirement!.remainderWeights[buckets[0].id]
    act(() => result.current.removeAllocationFixedTarget(buckets[0].id))
    const draft = result.current.allocationAtRetirement!
    expect(draft.fixedTargets.map(t => t.bucketId)).toEqual([buckets[1].id])
    expect(draft.remainderWeights[buckets[0].id]).toBe(weightBefore)
    expect(draft.accepted).toBe(false)
  })
  it('revokes acceptance when a bucket is added; ordinary value edits preserve it', () => {
    localStorage.clear()
    const { result } = renderHook(() => useScenarioState())
    classifyHoldings(result)
    acceptTwoFixed(result)
    const before = result.current.allocationAtRetirement!.fixedTargets
    const weightsBefore = { ...result.current.allocationAtRetirement!.remainderWeights }
    // Ordinary value edits preserve accepted fixed and remainder choices plus acceptance.
    act(() => result.current.updatePortfolioBucket(result.current.portfolioBuckets[0].id, { value: 12345 }))
    expect(result.current.allocationAtRetirement!.accepted).toBe(true)
    expect(result.current.allocationAtRetirement!.fixedTargets).toEqual(before)
    expect(result.current.allocationAtRetirement!.remainderWeights).toEqual(weightsBefore)
    // A new bucket changes the destination set: entries are preserved with zero
    // participation, but acceptance is revoked so nothing applies silently.
    act(() => result.current.addPortfolioBucket())
    const draft = result.current.allocationAtRetirement!
    expect(draft.accepted).toBe(false)
    expect(draft.fixedTargets).toEqual(before)
    expect(draft.remainderWeights).toEqual(weightsBefore)
    const added = result.current.portfolioBuckets[result.current.portfolioBuckets.length - 1]
    expect(draft.remainderWeights[added.id]).toBeUndefined()
  })
  it('freezes previously accepted equal recipients when adding under the equal fallback', () => {
    // Equal fallback (all-zero weights) must not silently redistribute to the new
    // destination on re-accept: old recipients are frozen to explicit positive
    // weights, the new bucket stays at zero until explicitly weighted.
    localStorage.clear()
    const { result } = renderHook(() => useScenarioState())
    classifyHoldings(result)
    act(() => result.current.prefillAllocationAtRetirement())
    act(() => {
      for (const id of Object.keys(result.current.allocationAtRetirement!.remainderWeights)) {
        result.current.updateAllocationRemainderWeight(id, 0)
      }
    })
    act(() => result.current.acceptAllocationAtRetirement())
    expect(result.current.allocationAtRetirement!.accepted).toBe(true)
    const oldIds = result.current.portfolioBuckets.map(b => b.id)
    act(() => result.current.addPortfolioBucket())
    const draft = result.current.allocationAtRetirement!
    expect(draft.accepted).toBe(false)
    for (const id of oldIds) {
      if (result.current.portfolioBuckets.find(b => b.id === id)?.holding === undefined) continue
      expect(draft.remainderWeights[id]).toBe(1)
    }
    const added = result.current.portfolioBuckets[result.current.portfolioBuckets.length - 1]
    expect(draft.remainderWeights[added.id]).toBeUndefined()
  })
  it('revokes acceptance on support changes in either direction', () => {
    localStorage.clear()
    const { result } = renderHook(() => useScenarioState())
    classifyHoldings(result)
    acceptTwoFixed(result)
    // Supported -> unsupported revokes (entries dangle for repair).
    const victim = result.current.portfolioBuckets[0].id
    act(() => result.current.updatePortfolioBucket(victim, { holding: 'unsupported' }))
    expect(result.current.allocationAtRetirement!.accepted).toBe(false)
    // Repair by removing, re-accept, then classify back to supported: the
    // destination set changed again, so acceptance is revoked once more.
    act(() => result.current.removeAllocationTarget(victim))
    act(() => result.current.acceptAllocationAtRetirement())
    expect(result.current.allocationAtRetirement!.accepted).toBe(true)
    act(() => result.current.updatePortfolioBucket(victim, { holding: 'accumulating-equity-fund' }))
    expect(result.current.allocationAtRetirement!.accepted).toBe(false)
  })
})
