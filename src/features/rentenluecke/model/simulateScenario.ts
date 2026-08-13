import { rentenlueckeInputSchema } from './inputSchema'
import { normalizeInput } from './normalizeInput'
import { calculateRequiredCapitalAtRetirement } from './requiredCapital'
import { deriveSummary } from './deriveSummary'
import { simulateAccumulationRows } from './simulateAccumulation'
import { simulateRetirementRows } from './simulateRetirement'
import type { RentenlueckeInput, SimulationResult } from './types'

export function simulateScenario(input: RentenlueckeInput): SimulationResult {
  const parsed = rentenlueckeInputSchema.parse(input)
  const scenario = normalizeInput(parsed)
  const accumulationRows = simulateAccumulationRows(scenario)
  const projectedCapitalAtRetirement = accumulationRows.at(-1)?.closingCapital ?? scenario.currentCapital
  const retirementRows = simulateRetirementRows(scenario, projectedCapitalAtRetirement)
  const requiredCapitalAtRetirement = calculateRequiredCapitalAtRetirement(scenario)
  const summary = deriveSummary(
    scenario,
    projectedCapitalAtRetirement,
    requiredCapitalAtRetirement,
    retirementRows,
  )

  return {
    rows: [...accumulationRows, ...retirementRows],
    accumulationRows,
    retirementRows,
    summary,
  }
}
