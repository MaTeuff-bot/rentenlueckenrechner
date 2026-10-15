import type {
  HistoricalBootstrapScenarioResult,
  HistoricalBootstrapSettings,
  HistoricalBootstrapSimulationSummary,
} from '../model/historicalReturns/types'
import type { RentenlueckeInput } from '../model/types'

export type ScenarioWorkerRequest = {
  requestId: number
  input: RentenlueckeInput
  settings: HistoricalBootstrapSettings
}

export type ScenarioWorkerResult = {
  requestId: number
  result: HistoricalBootstrapScenarioResult
  stochasticSummary: HistoricalBootstrapSimulationSummary
}

export type ScenarioWorkerDomainFailure = {
  requestId: number
  kind: 'domain'
  message: string
}

export type ScenarioWorkerReply = ScenarioWorkerResult | ScenarioWorkerDomainFailure

export function isScenarioWorkerReply(value: unknown): value is ScenarioWorkerReply {
  if (!value || typeof value !== 'object') return false
  const reply = value as Record<string, unknown>
  if (typeof reply.requestId !== 'number' || !Number.isFinite(reply.requestId)) return false
  if (reply.kind === 'domain') return typeof reply.message === 'string'
  if ('kind' in reply) return false
  return (
    typeof reply.result === 'object' && reply.result !== null &&
    typeof reply.stochasticSummary === 'object' && reply.stochasticSummary !== null
  )
}
