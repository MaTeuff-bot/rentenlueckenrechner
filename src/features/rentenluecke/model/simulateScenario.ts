import { simulateCapitalLedger } from './capitalIncome/ledger'
import { rentenlueckeInputSchema } from './inputSchema'
import { normalizeInput } from './normalizeInput'
import type { RentenlueckeInput, SimulationResult } from './types'

export function simulateScenario(input: RentenlueckeInput, cashPlanningRate?: number, cashRealRate?: number): SimulationResult {
  const parsed = rentenlueckeInputSchema.parse(input)
  const scenario = normalizeInput(parsed)
  return simulateCapitalLedger(scenario, undefined, undefined, cashPlanningRate, cashRealRate)
}
