// NOTE: `*InBatch` / `*Unchecked` helpers are @internal: model-only, must be paired with validation.
// Inactive public API: no imports from the active simulation or UI.
export type * from './types'
export { applyTransaction, applyTransactionInBatch, createInvestmentState, finishTransactionBatch, startTransactionBatch } from './holdings'
export { applyAnnualPricesAndInterest, applyAnnualPricesAndInterestInBatch, beginInvestmentYear, beginInvestmentYearInBatch, simulateInvestmentYear } from './annualLedger'
export { calculateVorabpauschale, closeWithPendingVP, closeWithPendingVPInBatch, receivePendingVP, receivePendingVPInBatch } from './vorabpauschale'
export { calculateTax, reconcileTax, reconcileTaxInBatch, unpaidTax, type ReconcileBaseYearIncome } from './taxLedger'
export { valueHypotheticalLiquidation } from './terminal'
export { bucketValue, checked, checkedFull, cloneInvestmentState, finite, totalValue } from './validation'
