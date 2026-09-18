import type { IncomeRecord, InvestmentState, TaxYear } from './types'
import { checked, deposit, finite, nonnegative, transition } from './validation'

/** @internal Mutates only a transition-owned clone; not part of the public API. */
export function recordIncome(state: InvestmentState, record: Omit<IncomeRecord, 'amount'>): void {
  const income = { ...record, amount: finite(record.gross * (1 - record.exemptFraction)) }
  state.taxIncome.push(income)
  // Independent signed records: no tax allowance, tax loss use or tax payment copied here.
  state.contributionIncome.push({ ...income })
}
export function calculateTax(income: number, openingLoss: number, allowance: number, churchRate: TaxYear['churchRate']) {
  finite(income); nonnegative(openingLoss); nonnegative(allowance)
  if (![0, 0.08, 0.09].includes(churchRate)) throw new Error('Invalid church rate')
  const afterLoss = Math.max(0, finite(income - openingLoss))
  const allowanceUsed = Math.min(allowance, afterLoss)
  return {
    income, loss: Math.max(0, finite(openingLoss - income)), allowanceUsed,
    liability: finite((afterLoss - allowanceUsed) * (1 + 0.055 + churchRate) / (4 + churchRate)),
  }
}
export function reconcileTax(state: InvestmentState, cashId: string, id: string): InvestmentState {
  const next = transition(state, id, ['opening', 'closing'])
  const tax = next.taxYears.at(-1)
  if (!tax || tax.year !== next.year) throw new Error('No active tax year')
  const income = next.taxIncome.filter(r => r.ledgerYear === next.year).reduce((n, r) => finite(n + r.amount), 0)
  Object.assign(tax, calculateTax(income, tax.openingLoss, tax.allowance, tax.churchRate))
  const cash = deposit(next, cashId)
  const due = tax.liability - tax.paid
  const payment = due < 0 ? due : Math.min(cash.value, due)
  cash.value -= payment
  tax.paid += payment
  next.transactions.push({ id, year: next.year, kind: 'tax', bucketId: cashId, cash: -payment, basis: 0, assessedVP: 0 })
  return checked(next)
}
export function unpaidTax(state: InvestmentState): number {
  return state.taxYears.reduce((n, t) => finite(n + Math.max(0, t.liability - t.paid)), 0)
}
