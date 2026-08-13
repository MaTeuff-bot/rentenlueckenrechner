import { useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import { DEFAULT_INPUT } from '../model/defaults'
import { getFieldErrors, rentenlueckeInputSchema, type InputFieldName } from '../model/inputSchema'
import { simulateScenario } from '../model/simulateScenario'
import type { RentenlueckeInput } from '../model/types'

const STORAGE_KEY = 'rentenlueckenrechner.scenario.v1'

const persistedScenarioSchema = z.object({
  version: z.literal(1),
  input: rentenlueckeInputSchema,
})

export function useScenarioState() {
  const [input, setInput] = useState<RentenlueckeInput>(loadInitialInput)

  const parsedInput = useMemo(() => rentenlueckeInputSchema.safeParse(input), [input])
  const fieldErrors = useMemo<Partial<Record<InputFieldName, string>>>(() => {
    return parsedInput.success ? {} : getFieldErrors(parsedInput.error)
  }, [parsedInput])
  const result = useMemo(() => (parsedInput.success ? simulateScenario(parsedInput.data) : null), [parsedInput])

  useEffect(() => {
    if (!parsedInput.success) {
      return
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, input: parsedInput.data }))
  }, [parsedInput])

  const updateField = (field: InputFieldName, value: number) => {
    setInput((current) => ({ ...current, [field]: value }))
  }

  const reset = () => {
    setInput(DEFAULT_INPUT)
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, input: DEFAULT_INPUT }))
  }

  return {
    input,
    fieldErrors,
    isValid: parsedInput.success,
    result,
    updateField,
    reset,
  }
}

function loadInitialInput(): RentenlueckeInput {
  if (typeof localStorage === 'undefined') {
    return DEFAULT_INPUT
  }

  const stored = localStorage.getItem(STORAGE_KEY)
  if (!stored) {
    return DEFAULT_INPUT
  }

  try {
    return persistedScenarioSchema.parse(JSON.parse(stored)).input
  } catch {
    return DEFAULT_INPUT
  }
}
