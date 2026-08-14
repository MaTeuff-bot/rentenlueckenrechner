import { useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import { DEFAULT_INPUT } from '../model/defaults'
import { getFieldErrors, rentenlueckeInputSchema, type InputFieldName } from '../model/inputSchema'
import { simulateScenario } from '../model/simulateScenario'
import {
  calculatePortfolioExpectedReturn,
  DEFAULT_ASSET_ALLOCATION,
  DEFAULT_STOCHASTIC_SETTINGS,
  getAllocationValidationError,
  runStochasticSimulation,
  type AssetAllocation,
  type AssetClassKey,
} from '../model/stochasticReturns'
import type { RentenlueckeInput } from '../model/types'

const STORAGE_KEY = 'rentenlueckenrechner.scenario.v2'
const LEGACY_STORAGE_KEY = 'rentenlueckenrechner.scenario.v1'

const assetAllocationSchema = z.object({
  equity: z.number().finite().min(0).max(1),
  bonds: z.number().finite().min(0).max(1),
  fixed: z.number().finite().min(0).max(1),
})

const persistedScenarioSchema = z.object({
  version: z.literal(2),
  input: rentenlueckeInputSchema,
  allocation: assetAllocationSchema,
})

const legacyPersistedScenarioSchema = z.object({
  version: z.literal(1),
  input: rentenlueckeInputSchema,
})

export function useScenarioState() {
  const [state, setState] = useState(loadInitialState)
  const { input, allocation } = state

  const parsedInput = useMemo(() => rentenlueckeInputSchema.safeParse(input), [input])
  const allocationError = useMemo(() => getAllocationValidationError(allocation), [allocation])
  const fieldErrors = useMemo<Partial<Record<InputFieldName, string>>>(() => {
    return parsedInput.success ? {} : getFieldErrors(parsedInput.error)
  }, [parsedInput])
  const isValid = parsedInput.success && !allocationError
  const result = useMemo(() => (isValid && parsedInput.success ? simulateScenario(parsedInput.data) : null), [
    isValid,
    parsedInput,
  ])
  const stochasticSummary = useMemo(() => {
    if (!isValid || !parsedInput.success) {
      return null
    }

    return runStochasticSimulation(parsedInput.data, {
      ...DEFAULT_STOCHASTIC_SETTINGS,
      allocation,
    })
  }, [allocation, isValid, parsedInput])

  useEffect(() => {
    if (!isValid || !parsedInput.success) {
      return
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, input: parsedInput.data, allocation }))
  }, [allocation, isValid, parsedInput])

  const updateField = (field: InputFieldName, value: number) => {
    setState((current) => ({ ...current, input: { ...current.input, [field]: value } }))
  }

  const updateAllocation = (field: AssetClassKey, value: number) => {
    setState((current) => {
      const allocation = { ...current.allocation, [field]: value }
      const derivedReturn = calculatePortfolioExpectedReturn(allocation)

      return {
        allocation,
        input: withDeterministicPortfolioReturn(current.input, derivedReturn),
      }
    })
  }

  const reset = () => {
    const nextState = createDefaultState()
    setState(nextState)
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, ...nextState }))
  }

  return {
    input,
    allocation,
    fieldErrors,
    allocationError,
    isValid,
    result,
    stochasticSummary,
    updateField,
    updateAllocation,
    reset,
  }
}

function loadInitialState(): { input: RentenlueckeInput; allocation: AssetAllocation } {
  if (typeof localStorage === 'undefined') {
    return createDefaultState()
  }

  const stored = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY)
  if (!stored) {
    return createDefaultState()
  }

  try {
    const parsed = JSON.parse(stored)
    const persisted = persistedScenarioSchema.safeParse(parsed)
    if (persisted.success) {
      const derivedReturn = calculatePortfolioExpectedReturn(persisted.data.allocation)
      return {
        input: withDeterministicPortfolioReturn(persisted.data.input, derivedReturn),
        allocation: persisted.data.allocation,
      }
    }

    const legacyPersisted = legacyPersistedScenarioSchema.safeParse(parsed)
    if (legacyPersisted.success) {
      return {
        input: withDeterministicPortfolioReturn(
          legacyPersisted.data.input,
          calculatePortfolioExpectedReturn(DEFAULT_ASSET_ALLOCATION),
        ),
        allocation: DEFAULT_ASSET_ALLOCATION,
      }
    }

    return createDefaultState()
  } catch {
    return createDefaultState()
  }
}

function createDefaultState(): { input: RentenlueckeInput; allocation: AssetAllocation } {
  return {
    input: withDeterministicPortfolioReturn(DEFAULT_INPUT, calculatePortfolioExpectedReturn(DEFAULT_ASSET_ALLOCATION)),
    allocation: DEFAULT_ASSET_ALLOCATION,
  }
}

function withDeterministicPortfolioReturn(input: RentenlueckeInput, annualReturn: number): RentenlueckeInput {
  return {
    ...input,
    annualReturnBeforeRetirement: annualReturn,
    annualReturnInRetirement: annualReturn,
  }
}
