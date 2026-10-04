// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { FIXED_INFLATION_SOURCE_ID } from '../../model/historicalReturns'
import { PLANNING_RATE_SOURCE_ID } from '../../model/historicalReturns/constants'
import { useScenarioState } from '../useScenarioState'
import { adoptPlanningRateForBankBuckets, getConfirmedCashPlanningRate, cashPlanningRateIssue } from '../../model/cashPlanningRate'
import { DEFAULT_HISTORICAL_RETURN_SERIES_IDS } from '../../model/historicalReturns/constants'
import {
  parsePersistedScenarioState,
  serializeScenarioState,
  STORAGE_KEY,
  TAGESGELD_PLANNING_RATE_NOTICE_KEY,
} from '../scenarioState/persistence'
import { createDefaultState } from '../scenarioState/defaults'
import { scenarioIssues } from '../../model/scenarioIssues'

describe('tagesgeld persistence', () => {
  beforeEach(() => localStorage.clear())

  it('roundtrips confirmed rate and recomputes deterministically', () => {
    const state = createDefaultState()
    state.portfolioBuckets = [
      { id: 'bank', name: 'Bank', value: 100_000, holding: 'ordinary-bank-deposit', returnSeriesId: PLANNING_RATE_SOURCE_ID },
    ]
    state.historical = { inflationSourceId: FIXED_INFLATION_SOURCE_ID, simulations: 3, cashPlanningRate: 0.02, cashPlanningRateConfirmed: true }
    localStorage.setItem(STORAGE_KEY, serializeScenarioState(state))
    const loaded = parsePersistedScenarioState(localStorage.getItem(STORAGE_KEY)!)
    expect(loaded.historical.cashPlanningRate).toBe(0.02)
    expect(loaded.historical.cashPlanningRateConfirmed).toBe(true)
    expect(getConfirmedCashPlanningRate(loaded.historical)).toBe(0.02)
    expect(cashPlanningRateIssue(loaded.portfolioBuckets, loaded.historical)).toBeNull()
  })

  it('parses old v15 without fields and raises notice plus issue', () => {
    const state = createDefaultState()
    state.portfolioBuckets = [
      { id: 'bank', name: 'Bank', value: 10_000, holding: 'ordinary-bank-deposit', returnSeriesId: PLANNING_RATE_SOURCE_ID },
    ]
    state.historical = { inflationSourceId: FIXED_INFLATION_SOURCE_ID, simulations: 3 } as never
    const raw = JSON.parse(serializeScenarioState(state))
    delete raw.historical.cashPlanningRate
    delete raw.historical.cashPlanningRateConfirmed
    raw.version = 15
    const loaded = parsePersistedScenarioState(JSON.stringify(raw))
    expect(() => parsePersistedScenarioState(JSON.stringify(raw))).not.toThrow()
    expect(loaded.historical.cashPlanningRate).toBeUndefined()
    expect(cashPlanningRateIssue(loaded.portfolioBuckets, loaded.historical)).not.toBeNull()
    expect(localStorage.getItem(TAGESGELD_PLANNING_RATE_NOTICE_KEY)).toBe('pending')
  })

  it('does not accept unconfirmed rates', () => {
    expect(getConfirmedCashPlanningRate({ cashPlanningRate: 0.02, cashPlanningRateConfirmed: false })).toBeUndefined()
    expect(getConfirmedCashPlanningRate({ cashPlanningRate: 0.02 })).toBeUndefined()
    expect(cashPlanningRateIssue([{ returnSeriesId: PLANNING_RATE_SOURCE_ID }], { cashPlanningRate: 0.02, cashPlanningRateConfirmed: false })).not.toBeNull()
  })
})

describe('tagesgeld confirmation adopts the displayed proposal', () => {
  it('stores the proposal on explicit confirmation without a prior edit', () => {
    const { result } = renderHook(() => useScenarioState())
    expect(result.current.cashPlanningIssue).not.toBeNull()
    act(() => result.current.updateCashPlanningRateConfirmed(true))
    expect(result.current.cashPlanningIssue).toBeNull()
  })

  it('keeps an explicitly edited rate on confirmation', () => {
    const { result } = renderHook(() => useScenarioState())
    act(() => result.current.updateCashPlanningRate(0.015))
    act(() => result.current.updateCashPlanningRateConfirmed(true))
    expect(result.current.cashPlanningIssue).toBeNull()
  })
})

describe('tagesgeld legacy migration (persisted storage injection)', () => {
  beforeEach(() => localStorage.clear())

  it('keeps multiple legacy bank sources blocked until explicit confirmation adopts the common source', () => {
    const state = createDefaultState()
    state.portfolioBuckets = [
      { id: 'bank1', name: 'Bank1', value: 60_000, holding: 'ordinary-bank-deposit', returnSeriesId: 'synthetic-cash-assumption-v1', annualCostRate: 0.01 },
      { id: 'bank2', name: 'Bank2', value: 40_000, holding: 'ordinary-bank-deposit', returnSeriesId: 'jst-r6-developed-equal-weight-bills-real-post1950', annualCostRate: 0.02 },
    ]
    state.historical = { inflationSourceId: FIXED_INFLATION_SOURCE_ID, simulations: 3 } as never
    localStorage.setItem(STORAGE_KEY, serializeScenarioState(state))
    const loaded = parsePersistedScenarioState(localStorage.getItem(STORAGE_KEY)!)
    expect(loaded.portfolioBuckets[0]!.returnSeriesId).toBe('synthetic-cash-assumption-v1')
    expect(loaded.portfolioBuckets[1]!.returnSeriesId).toBe('jst-r6-developed-equal-weight-bills-real-post1950')
    expect(cashPlanningRateIssue(loaded.portfolioBuckets, loaded.historical)).not.toBeNull()
    const adopted = adoptPlanningRateForBankBuckets(loaded.portfolioBuckets, { cashPlanningRate: 0.02, cashPlanningRateConfirmed: true })
    expect(adopted[0]!.returnSeriesId).toBe(PLANNING_RATE_SOURCE_ID)
    expect(adopted[1]!.returnSeriesId).toBe(PLANNING_RATE_SOURCE_ID)
    expect(adopted[0]!.annualCostRate).toBe(0.01)
    expect(adopted[1]!.annualCostRate).toBe(0.02)
    expect(cashPlanningRateIssue(adopted, { cashPlanningRate: 0.02, cashPlanningRateConfirmed: true })).toBeNull()
  })
})

describe('tagesgeld common-rate adoption without per-bank source picks', () => {
  beforeEach(() => localStorage.clear())

  it('establishes the common source for all declared banks on valid confirmation', () => {
    const { result } = renderHook(() => useScenarioState())
    act(() => {
      result.current.updatePortfolioBucket('fixed', { holding: 'ordinary-bank-deposit' })
    })
    act(() => {
      result.current.addPortfolioBucket()
    })
    const addedId = result.current.portfolioBuckets[result.current.portfolioBuckets.length - 1]!.id
    act(() => {
      result.current.updatePortfolioBucket(addedId, { value: 10_000, returnSeriesId: 'synthetic-cash-assumption-v1' })
    })
    act(() => {
      result.current.updatePortfolioBucket(addedId, { holding: 'ordinary-bank-deposit' })
    })
    expect(result.current.cashPlanningIssue).not.toBeNull()
    const beforeSources = result.current.portfolioBuckets
      .filter((bucket) => bucket.holding === 'ordinary-bank-deposit')
      .map((bucket) => bucket.returnSeriesId)
    expect(beforeSources.length).toBeGreaterThan(0)
    act(() => {
      result.current.updateCashPlanningRate(0.02)
    })
    act(() => {
      result.current.updateCashPlanningRateConfirmed(true)
    })
    const bankBuckets = result.current.portfolioBuckets.filter((bucket) => bucket.holding === 'ordinary-bank-deposit')
    expect(bankBuckets.length).toBeGreaterThan(0)
    for (const bucket of bankBuckets) {
      expect(bucket.returnSeriesId).toBe(PLANNING_RATE_SOURCE_ID)
    }
    expect(result.current.cashPlanningIssue).toBeNull()
  })

  it('uses the common source for later bank classifications without further source action, and stays blocked before consent', () => {
    const { result } = renderHook(() => useScenarioState())
    act(() => {
      result.current.updatePortfolioBucket('equity', { holding: 'accumulating-equity-fund', returnSeriesId: 'synthetic-equity-assumption-v1' })
    })
    const targetId = result.current.portfolioBuckets.find((bucket) => bucket.id !== 'equity' && bucket.id !== 'fixed')?.id ?? 'fixed'
    const targetBefore = result.current.portfolioBuckets.find((bucket) => bucket.id === targetId)!
    const sourceBefore = targetBefore.returnSeriesId
    act(() => {
      result.current.updatePortfolioBucket(targetId, { holding: 'ordinary-bank-deposit' })
    })
    const classifiedBefore = result.current.portfolioBuckets.find((bucket) => bucket.id === targetId)!
    expect(classifiedBefore.holding).toBe('ordinary-bank-deposit')
    expect(classifiedBefore.returnSeriesId).toBe(sourceBefore)
    expect(result.current.cashPlanningIssue).not.toBeNull()
    act(() => {
      result.current.updateCashPlanningRate(0.02)
    })
    act(() => {
      result.current.updateCashPlanningRateConfirmed(true)
    })
    const adopted = result.current.portfolioBuckets.find((bucket) => bucket.id === targetId)!
    expect(adopted.returnSeriesId).toBe(PLANNING_RATE_SOURCE_ID)
    act(() => {
      result.current.updatePortfolioBucket('equity', { holding: 'ordinary-bank-deposit' })
    })
    const reclassifiedAfter = result.current.portfolioBuckets.find((bucket) => bucket.id === 'equity')!
    expect(reclassifiedAfter.returnSeriesId).toBe(PLANNING_RATE_SOURCE_ID)
    expect(result.current.cashPlanningIssue).toBeNull()
    const serialized = serializeScenarioState({
      ...createDefaultState(),
      portfolioBuckets: result.current.portfolioBuckets,
      historical: result.current.historical,
    } as never)
    const reloaded = parsePersistedScenarioState(serialized)
    expect(reloaded.portfolioBuckets.find((bucket) => bucket.id === targetId)!.returnSeriesId).toBe(PLANNING_RATE_SOURCE_ID)
    expect(cashPlanningRateIssue(reloaded.portfolioBuckets, reloaded.historical)).toBeNull()
  })

  it('resets bank planning sources on bank-to-fund transitions without claiming a fund proxy', () => {
    const { result } = renderHook(() => useScenarioState())
    act(() => {
      result.current.updateCashPlanningRate(0.02)
    })
    act(() => {
      result.current.updateCashPlanningRateConfirmed(true)
    })
    act(() => {
      result.current.updatePortfolioBucket('fixed', { holding: 'ordinary-bank-deposit' })
    })
    expect(result.current.portfolioBuckets.find((bucket) => bucket.id === 'fixed')!.returnSeriesId).toBe(PLANNING_RATE_SOURCE_ID)
    act(() => {
      result.current.updatePortfolioBucket('fixed', { holding: 'accumulating-equity-fund' })
    })
    const fundBucket = result.current.portfolioBuckets.find((bucket) => bucket.id === 'fixed')!
    expect(fundBucket.holding).toBe('accumulating-equity-fund')
    expect(fundBucket.returnSeriesId).not.toBe(PLANNING_RATE_SOURCE_ID)
    expect(fundBucket.returnSeriesId).toBe(DEFAULT_HISTORICAL_RETURN_SERIES_IDS.equity)
  })

  it('ignores redundant per-bank source picks and never infers holding from source', () => {
    const { result } = renderHook(() => useScenarioState())
    act(() => {
      result.current.updateCashPlanningRate(0.02)
    })
    act(() => {
      result.current.updateCashPlanningRateConfirmed(true)
    })
    act(() => {
      result.current.updatePortfolioBucket('fixed', { holding: 'ordinary-bank-deposit' })
    })
    const beforeHolding = result.current.portfolioBuckets.find((bucket) => bucket.id === 'fixed')!.holding
    act(() => {
      result.current.updatePortfolioBucket('fixed', { returnSeriesId: 'synthetic-cash-assumption-v1' } as never)
    })
    const after = result.current.portfolioBuckets.find((bucket) => bucket.id === 'fixed')!
    expect(after.holding).toBe(beforeHolding)
    expect(after.returnSeriesId).toBe(PLANNING_RATE_SOURCE_ID)
    act(() => {
      result.current.updatePortfolioBucket('equity', { returnSeriesId: 'synthetic-cash-assumption-v1' })
    })
    expect(result.current.portfolioBuckets.find((bucket) => bucket.id === 'equity')!.holding).not.toBe('ordinary-bank-deposit')
  })
})

describe('tagesgeld invalid confirmation stays blocked until corrected', () => {
  beforeEach(() => localStorage.clear())

  it('rejects invalid confirmation, keeps notice, then adopts on corrected explicit confirmation with reload', () => {
    localStorage.setItem(TAGESGELD_PLANNING_RATE_NOTICE_KEY, 'pending')
    const { result } = renderHook(() => useScenarioState())
    act(() => {
      result.current.updatePortfolioBucket('fixed', { returnSeriesId: 'synthetic-cash-assumption-v1' })
    })
    act(() => {
      result.current.updatePortfolioBucket('fixed', { holding: 'ordinary-bank-deposit' })
    })
    const legacy = result.current.portfolioBuckets.find((bucket) => bucket.id === 'fixed')!
    expect(legacy.holding).toBe('ordinary-bank-deposit')
    expect(legacy.returnSeriesId).toBe('synthetic-cash-assumption-v1')
    expect(result.current.cashPlanningIssue).not.toBeNull()
    act(() => {
      result.current.updateCashPlanningRate(-0.01)
    })
    act(() => {
      result.current.updateCashPlanningRateConfirmed(true)
    })
    expect(result.current.historical.cashPlanningRateConfirmed).not.toBe(true)
    expect(getConfirmedCashPlanningRate(result.current.historical)).toBeUndefined()
    expect(result.current.cashPlanningIssue).not.toBeNull()
    expect(result.current.portfolioBuckets.find((bucket) => bucket.id === 'fixed')!.returnSeriesId).toBe(
      'synthetic-cash-assumption-v1',
    )
    expect(localStorage.getItem(TAGESGELD_PLANNING_RATE_NOTICE_KEY)).toBe('pending')
    act(() => {
      result.current.updateCashPlanningRate(0.02)
    })
    expect(result.current.historical.cashPlanningRateConfirmed).not.toBe(true)
    expect(result.current.cashPlanningIssue).not.toBeNull()
    expect(result.current.portfolioBuckets.find((bucket) => bucket.id === 'fixed')!.returnSeriesId).toBe(
      'synthetic-cash-assumption-v1',
    )
    act(() => {
      result.current.updateCashPlanningRateConfirmed(true)
    })
    expect(result.current.historical.cashPlanningRate).toBe(0.02)
    expect(result.current.historical.cashPlanningRateConfirmed).toBe(true)
    expect(getConfirmedCashPlanningRate(result.current.historical)).toBe(0.02)
    expect(result.current.portfolioBuckets.find((bucket) => bucket.id === 'fixed')!.returnSeriesId).toBe(
      PLANNING_RATE_SOURCE_ID,
    )
    expect(result.current.cashPlanningIssue).toBeNull()
    expect(localStorage.getItem(TAGESGELD_PLANNING_RATE_NOTICE_KEY)).toBe('dismissed')
    const serialized = serializeScenarioState({
      ...createDefaultState(),
      portfolioBuckets: result.current.portfolioBuckets,
      historical: result.current.historical,
    } as never)
    const reloaded = parsePersistedScenarioState(serialized)
    expect(reloaded.portfolioBuckets.find((bucket) => bucket.id === 'fixed')!.returnSeriesId).toBe(
      PLANNING_RATE_SOURCE_ID,
    )
    expect(cashPlanningRateIssue(reloaded.portfolioBuckets, reloaded.historical)).toBeNull()
  })
})

describe('tagesgeld fund source preserved on unrelated edits', () => {
  beforeEach(() => localStorage.clear())

  it.each([
    ['name', { name: 'Umbenannt' } as const],
    ['value', { value: 42000 } as const],
    ['annualCostRate', { annualCostRate: 0.012 } as const],
  ])('preserves explicitly selected invalid fund source on %s edit', (_label, patch) => {
    const { result } = renderHook(() => useScenarioState())
    act(() => {
      result.current.updateCashPlanningRate(0.02)
    })
    act(() => {
      result.current.updateCashPlanningRateConfirmed(true)
    })
    act(() => {
      result.current.updatePortfolioBucket('equity', {
        holding: 'accumulating-equity-fund',
        returnSeriesId: 'synthetic-equity-assumption-v1',
      })
    })
    act(() => {
      result.current.updatePortfolioBucket('equity', { returnSeriesId: PLANNING_RATE_SOURCE_ID })
    })
    expect(result.current.portfolioBuckets.find((bucket) => bucket.id === 'equity')!.returnSeriesId).toBe(
      PLANNING_RATE_SOURCE_ID,
    )
    act(() => {
      result.current.updatePortfolioBucket('equity', patch)
    })
    const after = result.current.portfolioBuckets.find((bucket) => bucket.id === 'equity')!
    expect(after.holding).toBe('accumulating-equity-fund')
    expect(after.returnSeriesId).toBe(PLANNING_RATE_SOURCE_ID)
  })

  it('still resets on an actual ordinary-bank-deposit to accumulating-equity-fund transition', () => {
    const { result } = renderHook(() => useScenarioState())
    act(() => {
      result.current.updateCashPlanningRate(0.02)
    })
    act(() => {
      result.current.updateCashPlanningRateConfirmed(true)
    })
    act(() => {
      result.current.updatePortfolioBucket('fixed', { holding: 'ordinary-bank-deposit' })
    })
    expect(result.current.portfolioBuckets.find((bucket) => bucket.id === 'fixed')!.returnSeriesId).toBe(
      PLANNING_RATE_SOURCE_ID,
    )
    act(() => {
      result.current.updatePortfolioBucket('fixed', { holding: 'accumulating-equity-fund' })
    })
    const fundBucket = result.current.portfolioBuckets.find((bucket) => bucket.id === 'fixed')!
    expect(fundBucket.holding).toBe('accumulating-equity-fund')
    expect(fundBucket.returnSeriesId).toBe(DEFAULT_HISTORICAL_RETURN_SERIES_IDS.equity)
  })
})

describe('tagesgeld legacy multi-bank hook load/confirm/reload', () => {
  beforeEach(() => localStorage.clear())

  it('loads legacy banks via hook, stays blocked, adopts on valid confirmation and reloads', () => {
    const state = createDefaultState()
    state.portfolioBuckets = [
      { id: 'bank1', name: 'Bank1', value: 60000, holding: 'ordinary-bank-deposit', returnSeriesId: 'synthetic-cash-assumption-v1', annualCostRate: 0.01 },
      { id: 'bank2', name: 'Bank2', value: 40000, holding: 'ordinary-bank-deposit', returnSeriesId: 'jst-r6-developed-equal-weight-bills-real-post1950', annualCostRate: 0.02 },
    ]
    state.historical = { inflationSourceId: FIXED_INFLATION_SOURCE_ID, simulations: 3 } as never
    localStorage.setItem(STORAGE_KEY, serializeScenarioState(state))
    const { result } = renderHook(() => useScenarioState())
    expect(result.current.portfolioBuckets.find((bucket) => bucket.id === 'bank1')!.returnSeriesId).toBe(
      'synthetic-cash-assumption-v1',
    )
    expect(
      result.current.portfolioBuckets.find((bucket) => bucket.id === 'bank2')!.returnSeriesId,
    ).toBe('jst-r6-developed-equal-weight-bills-real-post1950')
    expect(result.current.cashPlanningIssue).not.toBeNull()
    expect(localStorage.getItem(TAGESGELD_PLANNING_RATE_NOTICE_KEY)).toBe('pending')
    act(() => {
      result.current.updateCashPlanningRate(0.02)
    })
    act(() => {
      result.current.updateCashPlanningRateConfirmed(true)
    })
    const adopted1 = result.current.portfolioBuckets.find((bucket) => bucket.id === 'bank1')!
    const adopted2 = result.current.portfolioBuckets.find((bucket) => bucket.id === 'bank2')!
    expect(adopted1.returnSeriesId).toBe(PLANNING_RATE_SOURCE_ID)
    expect(adopted2.returnSeriesId).toBe(PLANNING_RATE_SOURCE_ID)
    expect(adopted1.annualCostRate).toBe(0.01)
    expect(adopted2.annualCostRate).toBe(0.02)
    expect(result.current.cashPlanningIssue).toBeNull()
    const serialized = serializeScenarioState({
      ...createDefaultState(),
      portfolioBuckets: result.current.portfolioBuckets,
      historical: result.current.historical,
    } as never)
    const reloaded = parsePersistedScenarioState(serialized)
    expect(reloaded.portfolioBuckets.find((bucket) => bucket.id === 'bank1')!.returnSeriesId).toBe(
      PLANNING_RATE_SOURCE_ID,
    )
    expect(reloaded.portfolioBuckets.find((bucket) => bucket.id === 'bank2')!.returnSeriesId).toBe(
      PLANNING_RATE_SOURCE_ID,
    )
    expect(cashPlanningRateIssue(reloaded.portfolioBuckets, reloaded.historical)).toBeNull()
  })
})

describe('tagesgeld bank-readiness issue link', () => {
  it('routes Bankeinlagen readiness message to the Rechenannahmen field', () => {
    const input = {
      currentAge: 67,
      retirementAge: 67,
      planningAge: 68,
      currentCapital: 10000,
      monthlyContributionToday: 0,
      monthlyDesiredSpendingToday: 0,
      monthlyRetirementIncomeToday: 0,
      annualInflationRate: 0,
      annualReturnBeforeRetirement: 0,
      annualReturnInRetirement: 0,
    } as never
    const buckets = [
      { id: 'bank', name: 'Bank', value: 10000, holding: 'ordinary-bank-deposit', returnSeriesId: 'synthetic-cash-assumption-v1' },
    ] as never
    const issues = scenarioIssues(
      input,
      { kind: 'missing' } as never,
      buckets,
      undefined,
      ['Bankeinlagen benötigen die Tagesgeld-Planungszinsquelle (tagesgeld-planzins-v1) mit bestätigtem Satz unter Rechenannahmen; bisherige Cash-Quellen erneut entscheiden und Holding erneut festlegen.'],
      null,
      null,
      undefined,
      'Tagesgeld-Planungszins unter Rechenannahmen festlegen und ausdrücklich bestätigen (konstanter nominaler Satz für alle Jahre/Pfade/Bankeinlagen).',
    )
    const bank = issues.find((issue) => issue.fieldPath === 'historical.cashPlanningRate')
    expect(bank).toBeDefined()
    expect(bank!.fieldId).toBe('cash-planning-rate')
    expect(bank!.section).toBe('annahmen')
  })
})
