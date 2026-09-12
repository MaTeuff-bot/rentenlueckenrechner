import type { AssetClassAssumption, AssetAllocation, StochasticSettings } from './stochasticReturns'

export const ASSET_CLASS_ASSUMPTIONS: AssetClassAssumption[] = [
  { key: 'equity', label: 'Aktien', expectedAnnualReturn: 0.07, annualVolatility: 0.18 },
  { key: 'bonds', label: 'Anleihen', expectedAnnualReturn: 0.03, annualVolatility: 0.07 },
  { key: 'fixed', label: 'Cash', expectedAnnualReturn: 0.02, annualVolatility: 0.01 },
]

export const DEFAULT_ASSET_ALLOCATION: AssetAllocation = {
  equity: 0.7,
  bonds: 0.2,
  fixed: 0.1,
}

export const DEFAULT_STOCHASTIC_SETTINGS: StochasticSettings = {
  allocation: DEFAULT_ASSET_ALLOCATION,
  simulations: 1_000,
  seed: 24_681_357,
}
