// @vitest-environment jsdom

// Controlled lifecycle/error-injection tests for the Worker boundary. The fake
// below is honestly labeled: it never computes and never proves browser
// bundling. Replies carry real model outputs via computeScenarioWorkerResult
// (same entry the real Worker runs); actual Worker bundling, transport and
// responsiveness run in e2e/worker-responsiveness.spec.ts with the real
// constructor and default N1000.
import { createElement, StrictMode, type ReactNode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { SYNTHETIC_RETURN_SERIES_IDS } from '../../model/historicalReturns'
import { automaticInsurance, completedCoverage } from '../../model/__tests__/insuranceFixtures'
import { computeScenarioWorkerResult } from '../../workers/scenarioWorker'
import type { ScenarioWorkerRequest } from '../../workers/scenarioWorkerTypes'
import { useScenarioState } from '../useScenarioState'
import { createDefaultState, createSyntheticHistoricalState } from '../scenarioState/defaults'
import { serializeScenarioState, STORAGE_KEY } from '../scenarioState/persistence'

class FakeScenarioWorker {
  static instances: FakeScenarioWorker[] = []

  static reset() {
    FakeScenarioWorker.instances = []
  }

  onmessage: ((event: { data: unknown }) => void) | null = null
  onerror: (() => void) | null = null
  onmessageerror: (() => void) | null = null
  terminated = false
  posted: unknown[] = []
  postBehavior: 'record' | 'throw' = 'record'

  constructor() {
    FakeScenarioWorker.instances.push(this)
  }

  postMessage(message: unknown) {
    if (this.postBehavior === 'throw') throw new Error('injected postMessage failure')
    this.posted.push(message)
  }

  terminate() {
    this.terminated = true
  }

  deliver(data: unknown) {
    this.onmessage?.({ data })
  }

  failTransport() {
    this.onerror?.()
  }
}

function fakeFactory() {
  return new FakeScenarioWorker() as unknown as Worker
}

function seedValidN100() {
  const state = createDefaultState()
  state.childrenAnswer = { kind: 'none' }
  state.insuranceCoverageAnswers = completedCoverage()
  state.retirementIncomeStreams[0].support = 'standard'
  state.input = { ...state.input, currentAge: 67, retirementAge: 67, planningAge: 68, retirementInsurance: automaticInsurance() }
  state.historical = createSyntheticHistoricalState()
  state.portfolioBuckets = [{ id: 'fund', name: 'Fonds', value: 100000, returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.equity, holding: 'accumulating-equity-fund' }]
  state.portfolioEstimatorSettings = { fundAcquisitionCost: 0, projectedBasisRate: 0.032, scopeConfirmed: true, lossScopeConfirmed: true }
  localStorage.setItem(STORAGE_KEY, serializeScenarioState(state))
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60))
  })
}

function lastPosted(instance: FakeScenarioWorker): ScenarioWorkerRequest {
  return instance.posted[instance.posted.length - 1] as ScenarioWorkerRequest
}

function replyReal(instance: FakeScenarioWorker, requestId?: number) {
  const request = lastPosted(instance)
  const output = computeScenarioWorkerResult(request)
  act(() => {
    instance.deliver(requestId === undefined ? output : { ...output, requestId })
  })
}

beforeEach(() => {
  localStorage.clear()
  FakeScenarioWorker.reset()
})

describe('useScenarioState worker boundary (controlled fake)', () => {
  it('publishes reference and stochastic outputs atomically after debounce', async () => {
    seedValidN100()
    const { result } = renderHook(() => useScenarioState({ createWorker: fakeFactory, debounceMs: 10 }))
    expect(result.current.isValid).toBe(true)
    expect(result.current.result).toBeNull()
    expect(result.current.isComputing).toBe(true)
    await settle()
    expect(FakeScenarioWorker.instances).toHaveLength(1)
    replyReal(FakeScenarioWorker.instances[0])
    expect(result.current.result).not.toBeNull()
    expect(result.current.stochasticSummary).not.toBeNull()
    expect(result.current.calculationError).toBeNull()
    expect(result.current.workerError).toBeNull()
    expect(result.current.isComputing).toBe(false)
  })

  it('hides previous results synchronously on edit, before the debounce fires', async () => {
    seedValidN100()
    const { result } = renderHook(() => useScenarioState({ createWorker: fakeFactory, debounceMs: 10 }))
    await settle()
    replyReal(FakeScenarioWorker.instances[0])
    expect(result.current.result).not.toBeNull()

    act(() => {
      result.current.updateField('monthlyContributionToday', 600)
    })
    expect(result.current.result).toBeNull()
    expect(result.current.stochasticSummary).toBeNull()
    expect(result.current.isComputing).toBe(true)
    expect(FakeScenarioWorker.instances).toHaveLength(1)
    expect(FakeScenarioWorker.instances[0].terminated).toBe(true)

    await settle()
    expect(FakeScenarioWorker.instances).toHaveLength(2)
    expect(result.current.result).toBeNull()
    replyReal(FakeScenarioWorker.instances[1])
    expect(result.current.result).not.toBeNull()
    expect(result.current.stochasticSummary).not.toBeNull()
  })

  it('retains results when a mutation leaves the computation snapshot unchanged', async () => {
    seedValidN100()
    const { result } = renderHook(() => useScenarioState({ createWorker: fakeFactory, debounceMs: 10 }))
    await settle()
    replyReal(FakeScenarioWorker.instances[0])
    expect(result.current.result).not.toBeNull()

    act(() => {
      result.current.updateCashPlanningRateConfirmed(false)
    })
    expect(result.current.result).not.toBeNull()
    expect(result.current.isComputing).toBe(false)
    await settle()
    expect(FakeScenarioWorker.instances).toHaveLength(1)
    expect(result.current.result).not.toBeNull()
    expect(result.current.isComputing).toBe(false)
  })

  it('terminates superseded work immediately and ignores stale replies', async () => {
    seedValidN100()
    const { result } = renderHook(() => useScenarioState({ createWorker: fakeFactory, debounceMs: 10 }))
    await settle()
    const first = FakeScenarioWorker.instances[0]
    replyReal(first)
    const published = result.current.result
    expect(published).not.toBeNull()

    act(() => {
      result.current.updateField('monthlyContributionToday', 600)
    })
    expect(first.terminated).toBe(true)
    act(() => {
      result.current.updateField('monthlyContributionToday', 700)
    })
    await settle()
    expect(FakeScenarioWorker.instances).toHaveLength(2)
    const latest = FakeScenarioWorker.instances[1]
    const latestRequest = lastPosted(latest)

    replyReal(first, latestRequest.requestId - 2)
    expect(result.current.result).toBeNull()
    replyReal(latest, latestRequest.requestId - 1)
    expect(result.current.result).toBeNull()
    replyReal(latest)
    expect(result.current.result).not.toBeNull()
    expect(result.current.result).not.toBe(published)
  })

  it('cancels work on invalid input and keeps readiness contracts', async () => {
    seedValidN100()
    const { result } = renderHook(() => useScenarioState({ createWorker: fakeFactory, debounceMs: 10 }))
    await settle()
    replyReal(FakeScenarioWorker.instances[0])
    const published = result.current.result
    expect(published).not.toBeNull()

    act(() => {
      result.current.updateChildrenAnswer({ kind: 'missing' })
    })
    expect(result.current.isValid).toBe(false)
    expect(result.current.result).toBeNull()
    expect(result.current.isComputing).toBe(false)
    await settle()
    expect(FakeScenarioWorker.instances).toHaveLength(1)
    expect(result.current.issues.length).toBeGreaterThan(0)

    // Restoring the previously published snapshot never resurrects old output:
    // results stay hidden during the debounce and a genuinely new job runs.
    act(() => {
      result.current.updateChildrenAnswer({ kind: 'none' })
    })
    expect(result.current.isValid).toBe(true)
    expect(result.current.result).toBeNull()
    expect(result.current.stochasticSummary).toBeNull()
    expect(result.current.isComputing).toBe(true)
    await settle()
    expect(FakeScenarioWorker.instances).toHaveLength(2)
    const relaunched = FakeScenarioWorker.instances[1]
    replyReal(relaunched)
    expect(result.current.result).not.toBeNull()
    expect(result.current.result).not.toBe(published)
    expect(result.current.isComputing).toBe(false)

    // A genuinely new snapshot hides results synchronously and recomputes.
    act(() => {
      result.current.updateField('monthlyContributionToday', 600)
    })
    expect(result.current.result).toBeNull()
    expect(result.current.isComputing).toBe(true)
    await settle()
    expect(FakeScenarioWorker.instances).toHaveLength(3)
    replyReal(FakeScenarioWorker.instances[2])
    expect(result.current.result).not.toBeNull()
    expect(result.current.isComputing).toBe(false)
  })

  it('recomputes after A→B→A without resurrecting the first publication', async () => {
    seedValidN100()
    const { result } = renderHook(() => useScenarioState({ createWorker: fakeFactory, debounceMs: 10 }))
    await settle()
    replyReal(FakeScenarioWorker.instances[0])
    const publishedA = result.current.result
    expect(publishedA).not.toBeNull()
    const contributionA = result.current.input.monthlyContributionToday

    act(() => {
      result.current.updateField('monthlyContributionToday', contributionA + 100)
    })
    expect(result.current.result).toBeNull()
    expect(result.current.isComputing).toBe(true)
    expect(FakeScenarioWorker.instances[0].terminated).toBe(true)

    // Returning to A keeps results hidden: no old cards during the debounce.
    act(() => {
      result.current.updateField('monthlyContributionToday', contributionA)
    })
    expect(result.current.result).toBeNull()
    expect(result.current.isComputing).toBe(true)

    await settle()
    // Exactly one genuinely new job for the restored snapshot (the B job was
    // superseded before it could launch a second worker).
    expect(FakeScenarioWorker.instances).toHaveLength(2)
    const relaunched = FakeScenarioWorker.instances[1]
    expect(lastPosted(relaunched).input.monthlyContributionToday).toBe(contributionA)
    replyReal(relaunched)
    expect(result.current.result).not.toBeNull()
    expect(result.current.result).not.toBe(publishedA)
    expect(result.current.isComputing).toBe(false)
  })

  it('surfaces constructor failure as transport error and retries the latest valid snapshot', async () => {
    seedValidN100()
    let failures = 1
    const flakyFactory = () => {
      if (failures > 0) {
        failures -= 1
        throw new Error('injected constructor failure')
      }
      return new FakeScenarioWorker() as unknown as Worker
    }
    const { result } = renderHook(() => useScenarioState({ createWorker: flakyFactory, debounceMs: 10 }))
    await settle()
    expect(result.current.result).toBeNull()
    expect(result.current.workerError).toMatch(/Worker-Fehler/)
    expect(result.current.calculationError).toBeNull()
    expect(result.current.isComputing).toBe(false)

    act(() => {
      result.current.updateField('monthlyContributionToday', 600)
    })
    await settle()
    const latest = FakeScenarioWorker.instances[FakeScenarioWorker.instances.length - 1]
    expect(lastPosted(latest).input.monthlyContributionToday).toBe(600)
    replyReal(latest)
    expect(result.current.result).not.toBeNull()
    expect(result.current.workerError).toBeNull()
  })

  it('surfaces postMessage and worker error events as transport errors with Retry', async () => {
    seedValidN100()
    const throwingFactory = () => {
      const worker = new FakeScenarioWorker()
      worker.postBehavior = 'throw'
      return worker as unknown as Worker
    }
    const { result } = renderHook(() => useScenarioState({ createWorker: throwingFactory, debounceMs: 10 }))
    await settle()
    expect(result.current.workerError).toMatch(/Worker-Fehler/)
    expect(result.current.result).toBeNull()

    expect(FakeScenarioWorker.instances).toHaveLength(1)
    act(() => {
      result.current.retryComputation()
    })
    expect(FakeScenarioWorker.instances).toHaveLength(2)
    expect(result.current.workerError).toMatch(/Worker-Fehler/)
    expect(result.current.result).toBeNull()
  })

  it('retries the latest valid snapshot after a worker error event', async () => {
    seedValidN100()
    const { result } = renderHook(() => useScenarioState({ createWorker: fakeFactory, debounceMs: 10 }))
    await settle()
    const first = FakeScenarioWorker.instances[0]
    act(() => {
      first.failTransport()
    })
    expect(result.current.workerError).toMatch(/Worker-Fehler/)
    expect(result.current.result).toBeNull()

    act(() => {
      result.current.updateField('monthlyContributionToday', 650)
    })
    await settle()
    const latest = FakeScenarioWorker.instances[FakeScenarioWorker.instances.length - 1]
    expect(FakeScenarioWorker.instances.length).toBeGreaterThanOrEqual(2)
    replyReal(latest)
    expect(result.current.result).not.toBeNull()
    expect(result.current.workerError).toBeNull()
  })

  it('publishes domain failures as complete null snapshots with the diagnostic', async () => {
    seedValidN100()
    const { result } = renderHook(() => useScenarioState({ createWorker: fakeFactory, debounceMs: 10 }))
    await settle()
    const instance = FakeScenarioWorker.instances[0]
    const request = lastPosted(instance)
    act(() => {
      instance.deliver({ requestId: request.requestId, kind: 'domain', message: 'Berechnung unvollständig: boom Detaillierte Kapitalbasis im Vermögen prüfen.' })
    })
    expect(result.current.result).toBeNull()
    expect(result.current.stochasticSummary).toBeNull()
    expect(result.current.calculationError).toBe('Berechnung unvollständig: boom Detaillierte Kapitalbasis im Vermögen prüfen.')
    expect(result.current.workerError).toBeNull()
    expect(result.current.isComputing).toBe(false)
  })

  it('reports a malformed current-job reply as a transport failure with Retry', async () => {
    seedValidN100()
    const { result } = renderHook(() => useScenarioState({ createWorker: fakeFactory, debounceMs: 10 }))
    await settle()
    const instance = FakeScenarioWorker.instances[0]
    const request = lastPosted(instance)
    expect(request).toBeDefined()
    // A malformed reply for the current job must never load forever: the
    // worker terminates and an honest Worker/transport failure is reported.
    act(() => {
      instance.deliver({ bogus: true })
    })
    expect(instance.terminated).toBe(true)
    expect(result.current.workerError).toMatch(/Worker-Fehler/)
    expect(result.current.result).toBeNull()
    expect(result.current.stochasticSummary).toBeNull()
    expect(result.current.calculationError).toBeNull()
    expect(result.current.isComputing).toBe(false)

    // Retry relaunches the latest valid snapshot and recovers fully.
    act(() => {
      result.current.retryComputation()
    })
    expect(FakeScenarioWorker.instances).toHaveLength(2)
    const retried = FakeScenarioWorker.instances[1]
    replyReal(retried)
    expect(result.current.workerError).toBeNull()
    expect(result.current.result).not.toBeNull()
    expect(result.current.stochasticSummary).not.toBeNull()
    expect(result.current.isComputing).toBe(false)
  })

  it('reports a request-mismatched current-job reply as a transport failure', async () => {
    seedValidN100()
    const { result } = renderHook(() => useScenarioState({ createWorker: fakeFactory, debounceMs: 10 }))
    await settle()
    const instance = FakeScenarioWorker.instances[0]
    const request = lastPosted(instance)
    const output = computeScenarioWorkerResult(request)
    act(() => {
      instance.deliver({ ...output, requestId: request.requestId + 1000 })
    })
    expect(instance.terminated).toBe(true)
    expect(result.current.workerError).toMatch(/Worker-Fehler/)
    expect(result.current.result).toBeNull()
    expect(result.current.isComputing).toBe(false)
  })

  it('discards malformed payloads from superseded jobs without failing', async () => {
    seedValidN100()
    const { result } = renderHook(() => useScenarioState({ createWorker: fakeFactory, debounceMs: 10 }))
    await settle()
    const first = FakeScenarioWorker.instances[0]
    act(() => {
      result.current.updateField('monthlyContributionToday', 600)
    })
    await settle()
    const latest = FakeScenarioWorker.instances[FakeScenarioWorker.instances.length - 1]
    expect(latest).not.toBe(first)
    // Valid stale replies are discarded (covered above); malformed payloads
    // from the superseded job are equally silent, never a transport failure.
    act(() => {
      first.deliver({ bogus: true })
    })
    expect(result.current.workerError).toBeNull()
    expect(result.current.result).toBeNull()
    expect(result.current.isComputing).toBe(true)
    replyReal(latest)
    expect(result.current.result).not.toBeNull()
    expect(result.current.workerError).toBeNull()
  })

  it('surfaces messageerror events as transport failures', async () => {
    seedValidN100()
    const { result } = renderHook(() => useScenarioState({ createWorker: fakeFactory, debounceMs: 10 }))
    await settle()
    const instance = FakeScenarioWorker.instances[0]
    act(() => {
      instance.onmessageerror?.()
    })
    expect(instance.terminated).toBe(true)
    expect(result.current.workerError).toMatch(/Worker-Fehler/)
    expect(result.current.result).toBeNull()
    expect(result.current.isComputing).toBe(false)
  })

  it('retries the latest snapshot when inputs changed before the job launched', async () => {
    seedValidN100()
    const { result } = renderHook(() => useScenarioState({ createWorker: fakeFactory, debounceMs: 10 }))
    await settle()
    const first = FakeScenarioWorker.instances[0]
    act(() => {
      first.failTransport()
    })
    expect(result.current.workerError).toMatch(/Worker-Fehler/)

    // The input change clears the failure and queues a debounced job; Retry
    // before that job launches must still post the NEW snapshot, never the
    // older retained one from before the transport failure.
    act(() => {
      result.current.updateField('monthlyContributionToday', 650)
    })
    expect(FakeScenarioWorker.instances).toHaveLength(1)
    act(() => {
      result.current.retryComputation()
    })
    expect(FakeScenarioWorker.instances).toHaveLength(2)
    const retried = FakeScenarioWorker.instances[1]
    expect(lastPosted(retried).input.monthlyContributionToday).toBe(650)
    replyReal(retried)
    expect(result.current.result).not.toBeNull()
    expect(result.current.workerError).toBeNull()
  })

  it('poisons pending worker callbacks on unmount so late replies cannot publish', async () => {
    seedValidN100()
    const { result, unmount } = renderHook(() => useScenarioState({ createWorker: fakeFactory, debounceMs: 10 }))
    await settle()
    const instance = FakeScenarioWorker.instances[0]
    const request = lastPosted(instance)
    unmount()
    expect(instance.terminated).toBe(true)
    // A late reply to the dead boundary is stale by generation: no publish,
    // no transport failure, no React state update on the unmounted hook.
    const output = computeScenarioWorkerResult(request)
    expect(() => instance.deliver(output)).not.toThrow()
    expect(FakeScenarioWorker.instances).toHaveLength(1)

    // A fresh mount recomputes independently with its own job identity.
    const fresh = renderHook(() => useScenarioState({ createWorker: fakeFactory, debounceMs: 10 }))
    await settle()
    expect(FakeScenarioWorker.instances).toHaveLength(2)
    replyReal(FakeScenarioWorker.instances[1])
    expect(fresh.result.current.result).not.toBeNull()
    expect(result).toBeDefined()
  })

  it('terminates the worker on unmount and restarts nothing on rerender', async () => {
    seedValidN100()
    const { result, rerender, unmount } = renderHook(() => useScenarioState({ createWorker: fakeFactory, debounceMs: 10 }))
    await settle()
    expect(FakeScenarioWorker.instances).toHaveLength(1)
    rerender()
    await settle()
    expect(FakeScenarioWorker.instances).toHaveLength(1)
    unmount()
    expect(FakeScenarioWorker.instances[0].terminated).toBe(true)
    expect(result.current).toBeDefined()
  })

  it('launches a single job under StrictMode double effects', async () => {
    seedValidN100()
    renderHook(() => useScenarioState({ createWorker: fakeFactory, debounceMs: 10 }), {
      wrapper: ({ children }: { children: ReactNode }) => createElement(StrictMode, null, children),
    })
    await settle()
    const posted = FakeScenarioWorker.instances.flatMap((instance) => instance.posted)
    expect(posted).toHaveLength(1)
    replyReal(FakeScenarioWorker.instances[FakeScenarioWorker.instances.length - 1])
  })
})
