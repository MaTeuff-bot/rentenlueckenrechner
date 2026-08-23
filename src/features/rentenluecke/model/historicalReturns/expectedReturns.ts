import type { RentenlueckeInput } from '../types'
import { resolveComponentExpectedNominalReturn, resolveInflationForSampledYear } from './bootstrapSampling'
import { getRequiredInflationSource, getValidHistoricalYears } from './sourceOptions'
import type { HistoricalBootstrapSettings } from './types'

export function calculateExpectedAnnualReturnForSelection(
  input: RentenlueckeInput,
  settings: HistoricalBootstrapSettings,
): number {
  const inflationSource = getRequiredInflationSource(settings.inflationSourceId, input.annualInflationRate)
  const validYears = getValidHistoricalYears(settings.portfolioComponents, inflationSource)
  const expectedYears = validYears.length > 0 ? validYears : [0]
  const expectedReturns = expectedYears.map((year) => {
    const inflation = resolveInflationForSampledYear(inflationSource, year)

    return settings.portfolioComponents.reduce((portfolioReturn, component) => {
      if (component.weight === 0) {
        return portfolioReturn
      }

      const annualReturn = resolveComponentExpectedNominalReturn(component, year, inflation)
      return portfolioReturn + component.weight * annualReturn
    }, 0)
  })

  return expectedReturns.reduce((sum, value) => sum + value, 0) / expectedReturns.length
}
