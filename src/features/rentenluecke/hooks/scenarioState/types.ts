import type { AssetAllocation } from '../../model/stochasticReturns'
import type { RentenlueckeInput } from '../../model/types'

export type ScenarioState = {
  input: RentenlueckeInput
  allocation: AssetAllocation
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
