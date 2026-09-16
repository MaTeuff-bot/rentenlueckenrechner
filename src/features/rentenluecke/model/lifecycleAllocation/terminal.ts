import { totalValue, valueHypotheticalLiquidation } from '../investmentTax/index.js';
import type { InvestmentState } from '../investmentTax/index.js';

/**
 * Same-horizon settlement. `cumulativeInflation` is the cumulative purchasing-power
 * factor F at the horizon (finite `> 0`; must match the last yearly `inflationFactor`
 * for constant-real comparisons; deflation `F < 1` allowed).
 */
export function liquidateLifecycle(
  state: InvestmentState,
  taxCashId: string,
  cumulativeInflation: number,
): { nominal: number; real: number; outstandingLiability: number; state: InvestmentState } {
  if (!Number.isFinite(cumulativeInflation) || cumulativeInflation <= 0) {
    throw new Error('Terminal needs a cumulative inflation factor > 0');
  }
  void totalValue(state);
  const result = valueHypotheticalLiquidation(state, taxCashId, cumulativeInflation, 'beforeHoldingCutoff');
  return { nominal: result.nominal, real: result.real, outstandingLiability: result.outstandingLiability, state: result.state };
}
