// Validation-free Abgeltungsteuer arithmetic for hot paths (solver trials, capital
// search). Deliberately dependency-free: no zod in this module so V8 optimizes the
// tight per-year/per-trial call without module-level parse overhead.
export function assessCore(
  fundSaleGain: number,
  vorabpauschaleIncome: number,
  openingLossCarryforward: number,
  allowanceAvailable: number,
  isEquityFund: boolean,
) {
  const afterFreistellung = (fundSaleGain + vorabpauschaleIncome) * (isEquityFund ? 0.7 : 1)
  const afterLoss = afterFreistellung - openingLossCarryforward
  const base = afterLoss > 0 ? afterLoss : 0
  const allowanceApplied = allowanceAvailable < base ? allowanceAvailable : base
  const taxableBase = base - allowanceApplied
  const abgeltungsteuer = taxableBase * 0.25
  return {
    taxableWithdrawal: afterFreistellung > 0 ? afterFreistellung : 0,
    sparerpauschbetragApplied: allowanceApplied,
    taxableBase,
    capitalIncomeTax: abgeltungsteuer * 1.055,
    closingLossCarryforward: afterLoss < 0 ? -afterLoss : 0,
    closingAllowance: allowanceAvailable - allowanceApplied,
  }
}
