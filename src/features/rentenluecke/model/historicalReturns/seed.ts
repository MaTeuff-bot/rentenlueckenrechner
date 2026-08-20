import type { RentenlueckeInput } from '../types'
import { getHistoricalDatasetVersion, getInflationSourceVersion } from './sourceOptions'
import type { HistoricalBootstrapSettings } from './types'

export function createHistoricalBootstrapSeed(input: RentenlueckeInput, settings: HistoricalBootstrapSettings): number {
  return hashString(
    stableStringify({
      input,
      inflationSourceId: settings.inflationSourceId,
      manualCashRealReturn: settings.manualCashRealReturn,
      simulations: settings.simulations,
      portfolioComponents: settings.portfolioComponents.map((component) => ({
        id: component.id,
        role: component.role,
        weight: component.weight,
        returnSeriesId: component.returnSeriesId,
        datasetVersion: getHistoricalDatasetVersion(component.returnSeriesId),
      })),
      inflationVersion: getInflationSourceVersion(settings.inflationSourceId, input.annualInflationRate),
    }),
  )
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }

  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(',')}}`
  }

  return JSON.stringify(value)
}

function hashString(value: string): number {
  let hash = 2_166_136_261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }

  return hash >>> 0
}
