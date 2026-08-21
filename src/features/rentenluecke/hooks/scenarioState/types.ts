import type { PortfolioBucket } from '../../model/portfolioBuckets'
import type { AssetAllocation } from '../../model/stochasticReturns'
import type { RentenlueckeInput } from '../../model/types'

export type ScenarioState = {
  input: RentenlueckeInput
  allocation: AssetAllocation
  portfolioBuckets: PortfolioBucket[]
  historical: {
    returnSeriesIds: {
      equity: string
      bond: string
      cash: string
    }
    inflationSourceId: string
    manualCashRealReturn: number
  }
}

export type PersistedHistoricalState = {
  returnSeriesIds: {
    equity: string
    bond: string
    cash: string
  }
  inflationSourceId?: string
  inflationSeriesId?: string
  manualCashRealReturn: number
}
