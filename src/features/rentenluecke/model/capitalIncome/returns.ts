import type { RentenlueckeInput } from '../types'
import type { HistoricalBootstrapSettings, InflationSourceOption } from '../historicalReturns/types'
import { getRequiredInflationSource, getValidHistoricalYears } from '../historicalReturns/sourceOptions'
import { resolveComponentExpectedNominalReturn, resolveComponentNominalReturn, applySourceCostTreatment, resolveInflationForSampledYear } from '../historicalReturns/bootstrapSampling'
import type { PortfolioComponent } from '../stochasticReturns'
import type { BucketReturn, BucketReturnPath } from './ledger'

export function expectedBucketReturns(input: RentenlueckeInput, settings: HistoricalBootstrapSettings): BucketReturn[] {
  const source = getRequiredInflationSource(settings.inflationSourceId, input.annualInflationRate)
  const valid = getValidHistoricalYears(settings.portfolioComponents, source)
  const years = valid.length ? valid : [0]
  return settings.portfolioComponents.map(c => ({ id: c.id,
    totalReturnRate: years.reduce((s, y) => s + resolveComponentExpectedNominalReturn(c, y, resolveInflationForSampledYear(source, y), settings.cashPlanningRate, settings.cashRealRate), 0) / years.length,
    grossBankReturnRate: years.reduce((s, y) => s + resolveComponentExpectedNominalReturn({ ...c, annualCostRate: 0 }, y, resolveInflationForSampledYear(source, y), settings.cashPlanningRate, settings.cashRealRate), 0) / years.length,
  }))
}
export function sampledBucketReturns(components: PortfolioComponent[], source: InflationSourceOption, years: number[], rng: () => number, cashPlanningRate?: number, cashRealRate?: number): BucketReturnPath {
  // Every declared component — including zero-weight future allocation
  // destinations — carries its real sampled return. Dropping zero-weight
  // entries would leave the ledger without a rate (silent 0 forever, even
  // after the event invests there). Never invent a 0 return.
  return years.map(y => components.map(c => {
    const gross = resolveComponentNominalReturn(c, y, resolveInflationForSampledYear(source, y), rng, cashPlanningRate, cashRealRate)
    return { id: c.id, totalReturnRate: applySourceCostTreatment(gross, c.returnSeriesId, c.annualCostRate), grossBankReturnRate: gross }
  }))
}
