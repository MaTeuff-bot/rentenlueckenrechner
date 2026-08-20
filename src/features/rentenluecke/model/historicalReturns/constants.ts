export const HISTORICAL_MINIMUM_OBSERVATIONS = 30
export const FIXED_INFLATION_SOURCE_ID = 'fixed-manual'
export const DEFAULT_HISTORICAL_INFLATION_SERIES_ID = 'bundesbank-destatis-germany-cpi-yoy-annual-mean-post1950'
export const DEFAULT_HISTORICAL_RETURN_SERIES_IDS = {
  equity: 'jst-r6-developed-equal-weight-equity-real-post1950',
  bond: 'jst-r6-developed-equal-weight-bonds-real-post1950',
  cash: 'jst-r6-developed-equal-weight-bills-real-post1950',
} as const
export const SYNTHETIC_RETURN_ASSUMPTIONS_VERSION = 'asset-class-assumptions-v1'
export const SYNTHETIC_RETURN_SERIES_IDS = {
  equity: 'synthetic-equity-assumption-v1',
  bond: 'synthetic-bonds-assumption-v1',
  cash: 'synthetic-cash-assumption-v1',
} as const
