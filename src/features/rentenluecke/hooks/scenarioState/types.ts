import type { PortfolioBucket } from '../../model/portfolioBuckets'
import type { RentenlueckeInput } from '../../model/types'

export type ScenarioState = {
  input: RentenlueckeInput
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
