import { computeScenarioWorkerResult, formatScenarioWorkerDomainError } from '../scenarioWorker'
import type { ScenarioWorkerRequest } from '../scenarioWorkerTypes'

// Honestly labeled test-only inline Worker for jsdom suites (jsdom ships no
// Worker runtime). It executes the REAL worker entry — same model functions,
// validators, seeds and domain envelope — and replies asynchronously to
// preserve the production async contract. It proves nothing about Vite worker
// bundling, main-thread responsiveness or transport behavior; those run in
// e2e/worker-responsiveness.spec.ts with the real constructor. Never import
// this from production sources.
export function createInlineScenarioWorker(): Worker {
  const worker = {
    onmessage: null as ((event: { data: unknown }) => void) | null,
    onerror: null as (() => void) | null,
    onmessageerror: null as (() => void) | null,
    terminated: false,
    postMessage(message: unknown) {
      const request = message as ScenarioWorkerRequest
      queueMicrotask(() => {
        if (worker.terminated || !worker.onmessage) return
        try {
          worker.onmessage({ data: computeScenarioWorkerResult(request) })
        } catch (error) {
          worker.onmessage({
            data: {
              requestId: request.requestId,
              kind: 'domain',
              message: formatScenarioWorkerDomainError(error),
            },
          })
        }
      })
    },
    terminate() {
      worker.terminated = true
    },
  }
  return worker as unknown as Worker
}

// Test-file-local stand-in for the missing jsdom Worker constructor. Assign in
// beforeEach and remove in afterEach; production code keeps calling the real
// `new Worker(...)` path.
export function installInlineScenarioWorker() {
  const scope = window as unknown as { Worker?: unknown }
  const previous = scope.Worker
  scope.Worker = class {
    constructor() {
      return createInlineScenarioWorker()
    }
  } as unknown
  return () => {
    if (previous === undefined) {
      delete scope.Worker
    } else {
      scope.Worker = previous
    }
  }
}
