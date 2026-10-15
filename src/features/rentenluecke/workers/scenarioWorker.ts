import {
  runHistoricalBootstrapSimulation,
  simulateHistoricalBootstrapReferenceScenario,
} from '../model/historicalReturns/bootstrapSimulation'
import type {
  ScenarioWorkerDomainFailure,
  ScenarioWorkerReply,
  ScenarioWorkerRequest,
  ScenarioWorkerResult,
} from './scenarioWorkerTypes'

export function formatScenarioWorkerDomainError(error: unknown): string {
  return `Berechnung unvollständig: ${error instanceof Error ? error.message : String(error)} Detaillierte Kapitalbasis im Vermögen prüfen.`
}

export function computeScenarioWorkerResult(request: ScenarioWorkerRequest): ScenarioWorkerResult {
  const result = simulateHistoricalBootstrapReferenceScenario(request.input, request.settings)
  const stochasticSummary = runHistoricalBootstrapSimulation(request.input, request.settings)
  return { requestId: request.requestId, result, stochasticSummary }
}

function isRunnableRequest(value: unknown): value is ScenarioWorkerRequest {
  if (!value || typeof value !== 'object') return false
  const request = value as Record<string, unknown>
  return (
    typeof request.requestId === 'number' &&
    Number.isFinite(request.requestId) &&
    typeof request.input === 'object' &&
    request.input !== null &&
    typeof request.settings === 'object' &&
    request.settings !== null
  )
}

function handleScenarioWorkerMessage(event: MessageEvent<ScenarioWorkerRequest>): void {
  const scope = globalThis as unknown as { postMessage: (message: ScenarioWorkerReply) => void }
  if (!isRunnableRequest(event.data)) return
  const request = event.data
  try {
    scope.postMessage(computeScenarioWorkerResult(request))
  } catch (error) {
    const failure: ScenarioWorkerDomainFailure = {
      requestId: request.requestId,
      kind: 'domain',
      message: formatScenarioWorkerDomainError(error),
    }
    scope.postMessage(failure)
  }
}

const workerScope = globalThis as unknown as {
  postMessage?: (message: ScenarioWorkerReply) => void
  onmessage?: ((event: MessageEvent<ScenarioWorkerRequest>) => void) | null
}

// Register the listener only inside a real Worker scope: the main thread has
// `window`, and bare Node/jsdom imports (unit tests, parity harnesses) have no
// `postMessage` on globalThis. Never fall back to synchronous computation.
if (typeof window === 'undefined' && typeof workerScope.postMessage === 'function') {
  workerScope.onmessage = handleScenarioWorkerMessage
}
