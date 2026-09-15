import type { InvestmentState } from './types'
import { checked, completeKeys, finite, fund, integer, nonnegative, transition } from './validation'
import { calculateTax, recordIncome } from './taxLedger'

export function calculateVorabpauschale(firstPrice: number, lastPrice: number, basisRate: number, units: number, acquisitionMonth: number): number {
  nonnegative(firstPrice); nonnegative(lastPrice); finite(basisRate); nonnegative(units)
  integer(acquisitionMonth, 'month')
  if (acquisitionMonth < 1 || acquisitionMonth > 12) throw new Error('Invalid acquisition month')
  const base = finite(firstPrice * 0.7 * basisRate)
  return finite(Math.max(0, Math.min(base, lastPrice - firstPrice)) * units * ((13 - acquisitionMonth) / 12))
}
export function closeWithPendingVP(state: InvestmentState, firstPrices: Record<string, number>, basisRate: number): InvestmentState {
  const next = transition(state, `close:${state.year}`, ['closing'])
  completeKeys(firstPrices, next.buckets.filter(b => b.classification !== 'deposit').map(b => b.id))
  finite(basisRate)
  if (next.pending.length) throw new Error('Unreceived pending VP')
  for (const b of next.buckets) {
    if (b.classification === 'deposit') continue
    const amounts = b.cohorts.map(c => calculateVorabpauschale(firstPrices[b.id], b.price, basisRate, c.units, c.acquiredYear === next.year ? c.acquiredMonth : 1))
    if (amounts.some(a => a > 0)) next.pending.push({ id: `vp:${next.year}:${b.id}`, bucketId: b.id, holdingYear: next.year, receiptYear: next.year + 1, amounts })
  }
  const tax = next.taxYears.at(-1)
  if (!tax || tax.year !== next.year) throw new Error('No active tax year')
  const income = next.taxIncome.filter(r => r.ledgerYear === next.year).reduce((n, r) => finite(n + r.amount), 0)
  Object.assign(tax, calculateTax(income, tax.openingLoss, tax.allowance, tax.churchRate))
  if (tax.paid > tax.liability) throw new Error('Reconcile same-year refund before closing')
  next.phase = 'closed'
  return checked(next)
}
// Internal boundary operation. Annual start uses legal receipt year; terminal may use the horizon ledger year.
export function receivePendingVP(state: InvestmentState): InvestmentState {
  const next = transition(state, `receipt:${state.year}`, ['opening', 'closing'])
  for (const pending of next.pending) {
    if (pending.receiptYear !== next.year) throw new Error('Wrong VP receipt year')
    const b = fund(next, pending.bucketId)
    if (b.cohorts.length !== pending.amounts.length) throw new Error('Pending cohort mismatch')
    let gross = 0
    pending.amounts.forEach((amount, i) => { b.cohorts[i].assessedVP += amount; gross = finite(gross + amount) })
    recordIncome(next, { id: pending.id, bucketId: b.id, kind: 'vp', ledgerYear: next.year, receiptYear: pending.receiptYear, gross, exemptFraction: b.classification === 'equityFund' ? 0.3 : 0 })
  }
  next.pending = []
  return checked(next)
}
