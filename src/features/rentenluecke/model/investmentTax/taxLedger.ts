import type { IncomeRecord, InvestmentState, TaxYear } from './types'
import { checked, deposit, finite, identifier, nonnegative, transition } from './validation'

/** @internal Mutates only a transition-owned clone; not part of the public API. */
export function recordIncome(state: InvestmentState, record: Omit<IncomeRecord, 'amount'>): void {
  const income = { ...record, amount: finite(record.gross * (1 - record.exemptFraction)) }
  state.taxIncome.push(income)
  // Independent signed records: no tax allowance, tax loss use or tax payment copied here.
  state.contributionIncome.push({ ...income })
}
export function calculateTax(income: number, openingLoss: number, allowance: number, churchRate: TaxYear['churchRate']) {
  finite(income); nonnegative(openingLoss); nonnegative(allowance)
  if (churchRate !== 0 && churchRate !== 0.08 && churchRate !== 0.09) throw new Error('Invalid church rate')
  const afterLoss = Math.max(0, finite(income - openingLoss))
  const allowanceUsed = Math.min(allowance, afterLoss)
  return {
    income, loss: Math.max(0, finite(openingLoss - income)), allowanceUsed,
    liability: finite((afterLoss - allowanceUsed) * (1 + 0.055 + churchRate) / (4 + churchRate)),
  }
}
export interface ReconcileBaseYearIncome {
  base: number;
  fromIndex: number;
}

function reconcileCoreInPlace(next: InvestmentState, cashId: string, id: string, baseYearIncome?: ReconcileBaseYearIncome): void {
  const tax = next.taxYears.at(-1)
  if (!tax || tax.year !== next.year) throw new Error('No active tax year')
  let income = baseYearIncome?.base ?? 0
  const fromIndex = baseYearIncome?.fromIndex ?? 0
  for (let i = fromIndex; i < next.taxIncome.length; i++) {
    const incomeRecord = next.taxIncome[i]
    if (!incomeRecord || incomeRecord.ledgerYear !== next.year) continue
    income = finite(income + incomeRecord.amount)
  }
  Object.assign(tax, calculateTax(income, tax.openingLoss, tax.allowance, tax.churchRate))
  const cash = deposit(next, cashId)
  const due = tax.liability - tax.paid
  const payment = due < 0 ? due : Math.min(cash.value, due)
  cash.value -= payment
  tax.paid += payment
  next.transactions.push({ id, year: next.year, kind: 'tax', bucketId: cashId, cash: -payment, basis: 0, assessedVP: 0 })
}

export function reconcileTaxInBatch(next: InvestmentState, seen: Set<string>, cashId: string, id: string, outerSeen?: Set<string>, baseYearIncome?: ReconcileBaseYearIncome): void {
  identifier(id);
  if (next.phase !== 'opening' && next.phase !== 'closing') throw new Error('Invalid event order');
  if (seen.has(id) || outerSeen?.has(id)) throw new Error(`Duplicate event ${id}`);
  seen.add(id);
  next.eventIds.push(id);
  reconcileCoreInPlace(next, cashId, id, baseYearIncome);
}

export function reconcileTax(state: InvestmentState, cashId: string, id: string): InvestmentState {
  const next = transition(state, id, ['opening', 'closing'])
  reconcileCoreInPlace(next, cashId, id)
  return checked(next)
}
export function unpaidTax(state: InvestmentState): number {
  let total = 0;
  for (const t of state.taxYears) total = finite(total + Math.max(0, t.liability - t.paid));
  return total;
}
