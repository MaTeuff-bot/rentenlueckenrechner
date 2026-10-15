import { describe, expect, it, vi } from 'vitest'
import {
  createPortfolioComponentsFromBuckets,
} from '../../model/portfolioBuckets'
import {
  FIXED_INFLATION_SOURCE_ID,
  SYNTHETIC_RETURN_SERIES_IDS,
  runHistoricalBootstrapSimulation,
  simulateHistoricalBootstrapReferenceScenario,
} from '../../model/historicalReturns'
import { cashOnlyInput, withFullCostBasis } from '../../model/__tests__/insuranceFixtures'
import {
  computeScenarioWorkerResult,
  formatScenarioWorkerDomainError,
} from '../scenarioWorker'
import { isScenarioWorkerReply, type ScenarioWorkerRequest } from '../scenarioWorkerTypes'

function fundOnlyRequest(simulations: number): ScenarioWorkerRequest {
  const buckets = [
    { id: 'fund', name: 'Fonds', value: 100_000, returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.equity, holding: 'accumulating-equity-fund' as const },
  ]
  return {
    requestId: 7,
    input: withFullCostBasis(cashOnlyInput({ currentCapital: 100_000, estimatorPortfolio: buckets.map((bucket) => ({ ...bucket })) })),
    settings: {
      portfolioComponents: createPortfolioComponentsFromBuckets(buckets),
      inflationSourceId: FIXED_INFLATION_SOURCE_ID,
      simulations,
    },
  }
}

describe('scenarioWorker contract', () => {
  it('computes byte-identical outputs to direct model calls (N100 lifecycle sample)', () => {
    const request = fundOnlyRequest(100)
    const viaWorker = computeScenarioWorkerResult(request)
    const reference = simulateHistoricalBootstrapReferenceScenario(request.input, request.settings)
    const summary = runHistoricalBootstrapSimulation(request.input, request.settings)
    expect(viaWorker).toEqual({ requestId: 7, result: reference, stochasticSummary: summary })
  })

  it('computes byte-identical outputs to direct model calls at default N1000', { timeout: 120_000 }, () => {
    const request = fundOnlyRequest(1000)
    const viaWorker = computeScenarioWorkerResult(request)
    const reference = simulateHistoricalBootstrapReferenceScenario(request.input, request.settings)
    const summary = runHistoricalBootstrapSimulation(request.input, request.settings)
    expect(viaWorker).toEqual({ requestId: 7, result: reference, stochasticSummary: summary })
    expect(summary.simulations).toBe(1000)
  })

  it('formats domain errors with the existing truthful diagnostic', () => {
    expect(formatScenarioWorkerDomainError(new Error('Unknown inflation source: bogus')))
      .toBe('Berechnung unvollständig: Unknown inflation source: bogus Detaillierte Kapitalbasis im Vermögen prüfen.')
    expect(formatScenarioWorkerDomainError('plain string'))
      .toBe('Berechnung unvollständig: plain string Detaillierte Kapitalbasis im Vermögen prüfen.')
  })

  it('keeps request and reply payloads structured-clone safe (no callbacks, no class instances)', () => {
    const request = fundOnlyRequest(100)
    const clonedRequest = structuredClone(request)
    expect(clonedRequest).toEqual(request)
    const reply = structuredClone(computeScenarioWorkerResult(request))
    expect(reply).toEqual(computeScenarioWorkerResult(request))
    expect(isScenarioWorkerReply(reply)).toBe(true)
  })

  it('rejects malformed and stale-shaped replies', () => {
    expect(isScenarioWorkerReply(null)).toBe(false)
    expect(isScenarioWorkerReply({})).toBe(false)
    expect(isScenarioWorkerReply({ requestId: '7', result: {}, stochasticSummary: {} })).toBe(false)
    expect(isScenarioWorkerReply({ requestId: 7, result: null, stochasticSummary: {} })).toBe(false)
    expect(isScenarioWorkerReply({ requestId: 7, kind: 'domain' })).toBe(false)
    expect(isScenarioWorkerReply({ requestId: 7, kind: 'other', message: 'x' })).toBe(false)
    expect(isScenarioWorkerReply({ requestId: 7, kind: 'domain', message: 'Berechnung unvollständig: x prüfen.' })).toBe(true)
  })

  it('posts result and domain envelopes through the worker message protocol', async () => {
    const posted: unknown[] = []
    const scope = globalThis as unknown as { postMessage: (message: unknown) => void }
    const previousPostMessage = scope.postMessage
    scope.postMessage = (message: unknown) => {
      posted.push(message)
    }
    try {
      vi.resetModules()
      const workerModule = await import('../scenarioWorker')
      const scopeWithHandler = globalThis as unknown as {
        onmessage: ((event: MessageEvent<ScenarioWorkerRequest>) => void) | null
      }
      expect(typeof scopeWithHandler.onmessage).toBe('function')

      const request = fundOnlyRequest(10)
      scopeWithHandler.onmessage!({ data: request } as MessageEvent<ScenarioWorkerRequest>)
      expect(posted).toHaveLength(1)
      expect(isScenarioWorkerReply(posted[0])).toBe(true)
      expect(posted[0]).toEqual(workerModule.computeScenarioWorkerResult(request))

      scopeWithHandler.onmessage!({ data: 'not-a-request' } as unknown as MessageEvent<ScenarioWorkerRequest>)
      expect(posted).toHaveLength(1)

      const throwing: ScenarioWorkerRequest = {
        requestId: 9,
        input: request.input,
        settings: { ...request.settings, inflationSourceId: 'bogus-inflation-v1' },
      }
      scopeWithHandler.onmessage!({ data: throwing } as MessageEvent<ScenarioWorkerRequest>)
      expect(posted).toHaveLength(2)
      expect(posted[1]).toEqual({
        requestId: 9,
        kind: 'domain',
        message: 'Berechnung unvollständig: Unknown inflation source: bogus-inflation-v1 Detaillierte Kapitalbasis im Vermögen prüfen.',
      })
    } finally {
      const scopeWithHandler = globalThis as unknown as {
        onmessage?: ((event: MessageEvent<ScenarioWorkerRequest>) => void) | null
        postMessage?: (message: unknown) => void
      }
      scopeWithHandler.onmessage = null
      if (previousPostMessage === undefined) {
        delete scopeWithHandler.postMessage
      } else {
        scopeWithHandler.postMessage = previousPostMessage
      }
    }
  })
})
