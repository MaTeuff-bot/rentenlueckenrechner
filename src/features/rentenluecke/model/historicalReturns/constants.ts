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
export const PLANNING_RATE_SOURCE_ID = 'tagesgeld-planzins-v1'
export const CASH_PLANNING_RATE_PROPOSAL = 0.02
export const PLANNING_RATE_SOURCE_VERSION = 'tagesgeld-planzins-v1'
export const HISTORICAL_DEPOSIT_STRATEGY_SOURCE_ID = 'tagesgeld-historisch-strategie-v1'
export const HISTORICAL_DEPOSIT_STRATEGY_VERSION = 'tagesgeld-historisch-strategie-v1-2026-10-05'
export const REAL_ASSUMPTION_SOURCE_ID = 'tagesgeld-realannahme-v1'
export const REAL_ASSUMPTION_SOURCE_VERSION = 'tagesgeld-realannahme-v1-2026-10-05'
export const CASH_REAL_RATE_PROPOSAL = -0.0028
export const CASH_MODE_CONSTANT = 'constant-nominal'
export const CASH_MODE_HISTORICAL = 'historical-zero-floor'
export const CASH_MODE_REAL = 'real-assumption-zero-floor'
export const CASH_MODES = [CASH_MODE_CONSTANT, CASH_MODE_HISTORICAL, CASH_MODE_REAL] as const
export type CashMode = (typeof CASH_MODES)[number]
export const DEFAULT_CASH_MODE: CashMode = CASH_MODE_CONSTANT
