import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  HistoricalBootstrapScenarioResult,
  HistoricalBootstrapSettings,
  HistoricalBootstrapSimulationSummary,
} from '../model/historicalReturns/types'
import type { RentenlueckeInput } from '../model/types'
import { isScenarioWorkerReply } from '../workers/scenarioWorkerTypes'

export type ScenarioComputationSnapshot = {
  input: RentenlueckeInput
  settings: HistoricalBootstrapSettings
}

export type ScenarioComputationOutput = {
  result: HistoricalBootstrapScenarioResult | null
  stochasticSummary: HistoricalBootstrapSimulationSummary | null
  calculationError: string | null
}

export type ScenarioWorkerFactory = () => Worker

export const SCENARIO_COMPUTATION_DEBOUNCE_MS = 150

export const SCENARIO_TRANSPORT_ERROR =
  'Die Prognose konnte nicht im Hintergrund berechnet werden (Worker-Fehler). Die Eingaben sind unverändert erhalten.'

function createProductionScenarioWorker(): Worker {
  return new Worker(new URL('../workers/scenarioWorker.ts', import.meta.url), { type: 'module' })
}

function snapshotKey(snapshot: ScenarioComputationSnapshot): string {
  return JSON.stringify({ input: snapshot.input, settings: snapshot.settings })
}

type PublishedComputation = {
  key: string
  generation: number
  output: ScenarioComputationOutput
}

export function useScenarioComputation(
  snapshot: ScenarioComputationSnapshot | null,
  options?: { createWorker?: ScenarioWorkerFactory; debounceMs?: number },
) {
  const createWorker = options?.createWorker ?? createProductionScenarioWorker
  const debounceMs = options?.debounceMs ?? SCENARIO_COMPUTATION_DEBOUNCE_MS
  const [published, setPublished] = useState<PublishedComputation | null>(null)
  const [workerError, setWorkerError] = useState<string | null>(null)

  const generationRef = useRef(0)
  const launchedGenerationRef = useRef(-1)
  const workerRef = useRef<Worker | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const createWorkerRef = useRef(createWorker)
  createWorkerRef.current = createWorker

  const terminateWorker = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate()
      workerRef.current = null
    }
  }, [])

  // Narrow shared invalidation boundary: every calculation-relevant mutation
  // calls this synchronously (before its state update renders), so superseded
  // work terminates immediately and previously published results are hidden in
  // the same commit. There is deliberately NO retained-results cache: a
  // published entry is only rendered when BOTH its snapshot key and its
  // generation still match, so valid A→invalid→A and valid A→B→A always
  // recompute after the debounce instead of resurrecting old output by key
  // matching. The debounce only delays launching the replacement job.
  const invalidate = useCallback(() => {
    generationRef.current += 1
    launchedGenerationRef.current = -1
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    terminateWorker()
    setPublished(null)
    setWorkerError(null)
    return generationRef.current
  }, [terminateWorker])

  const launch = useCallback((target: ScenarioComputationSnapshot, key: string, requestId: number) => {
    terminateWorker()
    let worker: Worker
    try {
      worker = createWorkerRef.current()
    } catch {
      if (requestId === generationRef.current) {
        workerRef.current = null
        setWorkerError(SCENARIO_TRANSPORT_ERROR)
      }
      return
    }
    launchedGenerationRef.current = requestId
    workerRef.current = worker
    worker.onmessage = (event: MessageEvent) => {
      // A superseded job (stale request identity) can never publish: discard
      // silently, even when its payload is malformed.
      if (requestId !== generationRef.current) return
      // A malformed or request-mismatched reply for the CURRENT job is an
      // honest Worker/transport failure, not silent infinite loading: partial
      // or stale output must never render.
      if (!isScenarioWorkerReply(event.data) || event.data.requestId !== requestId) {
        terminateWorker()
        setWorkerError(SCENARIO_TRANSPORT_ERROR)
        return
      }
      const reply = event.data
      if ('kind' in reply) {
        setPublished({ key, generation: requestId, output: { result: null, stochasticSummary: null, calculationError: reply.message } })
      } else {
        setPublished({ key, generation: requestId, output: { result: reply.result, stochasticSummary: reply.stochasticSummary, calculationError: null } })
      }
      terminateWorker()
    }
    const failTransport = () => {
      if (requestId !== generationRef.current) return
      terminateWorker()
      setWorkerError(SCENARIO_TRANSPORT_ERROR)
    }
    worker.onerror = failTransport
    worker.onmessageerror = failTransport
    try {
      worker.postMessage({ requestId, input: target.input, settings: target.settings })
    } catch {
      failTransport()
    }
  }, [terminateWorker])

  const key = snapshot ? snapshotKey(snapshot) : null
  // Retry always uses the latest committed snapshot from this render's closure,
  // never a retained older snapshot: passive effects may not have flushed yet
  // when the user clicks, but the committed render already holds the newest
  // valid input. Invalid input offers no Retry target.
  const retryComputation = useCallback(() => {
    if (!snapshot || key === null) return
    const generation = invalidate()
    launch(snapshot, key, generation)
  }, [snapshot, key, invalidate, launch])

  const output = published !== null && key !== null && published.key === key && published.generation === generationRef.current
    ? published.output
    : null
  useEffect(() => {
    if (!snapshot || key === null) return
    // Reconcile: publish nothing partial, queue nothing obsolete. Invalid or
    // transport-error states never reach a launch; each generation launches at
    // most one job and never reuses an older publication.
    if (workerError) return
    if (launchedGenerationRef.current === generationRef.current) return
    const generation = generationRef.current
    const timer = setTimeout(() => {
      timerRef.current = null
      if (generation !== generationRef.current) return
      launch(snapshot, key, generation)
    }, debounceMs)
    timerRef.current = timer
    return () => {
      clearTimeout(timer)
      if (timerRef.current === timer) timerRef.current = null
    }
  }, [snapshot, key, workerError, debounceMs, launch])

  useEffect(() => () => {
    // Poison pending callbacks completely: bumping the generation makes every
    // in-flight reply stale, so StrictMode remounts and unmounts can neither
    // publish late output nor leave a timer or worker behind.
    generationRef.current += 1
    launchedGenerationRef.current = -1
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    terminateWorker()
  }, [terminateWorker])

  return { output, workerError, invalidate, retryComputation }
}
