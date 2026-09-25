// Validation-free Abgeltungsteuer arithmetic for hot paths (solver trials, capital
// search). Deliberately dependency-free: no zod in this module so V8 optimizes the
// tight per-year/per-trial call without module-level parse overhead.
export function assessCore(
  fundSaleGain: number,
  vorabpauschaleIncome: number,
  openingLossCarryforward: number,
  allowanceAvailable: number,
  isEquityFund: boolean,
  // Ordinary bank interest (EStG §20(1)7): capital income with NO partial
  // exemption. Joins AFTER the fund-only Teilfreistellung and BEFORE the single
  // shared loss offset and allowance. Defaults to zero so scalar/manual callers
  // keep exact legacy behavior.
  bankInterest = 0,
) {
  const afterFreistellung = (fundSaleGain + vorabpauschaleIncome) * (isEquityFund ? 0.7 : 1) + bankInterest
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
