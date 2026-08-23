import type { PortfolioBucket } from '../../model/portfolioBuckets'
import type { RentenlueckeInput } from '../../model/types'

export type ScenarioState = {
  input: RentenlueckeInput
  portfolioBuckets: PortfolioBucket[]
  historical: {
    inflationSourceId: string
  }
}

export type PersistedHistoricalState = {
  inflationSourceId?: string
  inflationSeriesId?: string
}
