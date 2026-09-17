import { applyTransaction, unpaidTax } from '../investmentTax/index.js';
import type { InvestmentState } from '../investmentTax/index.js';

export interface ArrearsSettlement {
  state: InvestmentState;
  paidByYear: Record<number, number>;
  remaining: Record<number, number>;
}

function settlementCash(state: InvestmentState, cashId: string): number {
  const bucket = state.buckets.find((b) => b.id === cashId);
  if (!bucket || bucket.classification !== 'deposit') throw new Error(`Unknown settlement deposit ${cashId}`);
  return bucket.value;
}

export function outstandingByYear(state: InvestmentState): Record<number, number> {
  const out: Record<number, number> = {};
  for (const t of state.taxYears) {
    const rest = Math.max(0, t.liability - t.paid);
    if (rest > 0) out[t.year] = rest;
  }
  return out;
}

export function settleArrears(state: InvestmentState, cashId: string, year: number): ArrearsSettlement {
  if (!Number.isInteger(year)) throw new Error(`Invalid ledger year ${year}`);
  if (state.year !== year) throw new Error(`Year ${year}: arrears settle on the executed closing state of the same year`);
  if (state.phase !== 'closing') throw new Error(`Year ${year}: arrears settle after reconcileTax in closing phase`);
  const paidByYear: Record<number, number> = {};
  let next = state;
  const priorYears = next.taxYears
    .filter((t) => t.year < year && t.liability - t.paid > 0)
    .sort((a, b) => a.year - b.year);
  for (const entry of priorYears) {
    const live = next.taxYears.find((t) => t.year === entry.year);
    if (!live) throw new Error(`Year ${year}: dated liability for ${entry.year} vanished`);
    const outstanding = Math.max(0, live.liability - live.paid);
    if (outstanding <= 0) continue;
    const cash = settlementCash(next, cashId);
    if (cash <= 0) break;
    const payment = Math.min(cash, outstanding);
    if (payment <= 0) break;
    next = applyTransaction(next, {
      id: `lifecycle:${year}:arrears:${entry.year}`,
      kind: 'external',
      cashId,
      amount: -payment,
    });
    const updated = next.taxYears.find((t) => t.year === entry.year);
    if (!updated) throw new Error(`Year ${year}: dated liability for ${entry.year} vanished`);
    updated.paid += payment;
    if (updated.paid > updated.liability) throw new Error(`Year ${year}: arrears overpayment for ${entry.year}`);
    paidByYear[entry.year] = payment;
  }
  void unpaidTax(next);
  return { state: next, paidByYear, remaining: outstandingByYear(next) };
}
