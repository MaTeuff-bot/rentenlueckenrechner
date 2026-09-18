import type { InvestmentState } from './types'
import { checked, completeKeys, finite, fund, identifier, integer, nonnegative, transition } from './validation'
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
  { const fundIds: string[] = []; for (const b of next.buckets) { if (b.classification !== 'deposit') fundIds.push(b.id); } completeKeys(firstPrices, fundIds); }
  finite(basisRate)
  if (next.pending.length) throw new Error('Unreceived pending VP')
  for (const b of next.buckets) {
    if (b.classification === 'deposit') continue
    const amounts: number[] = [];
    for (const c of b.cohorts) amounts.push(calculateVorabpauschale(firstPrices[b.id], b.price, basisRate, c.units, c.acquiredYear === next.year ? c.acquiredMonth : 1));
    let hasPositive = false;
    for (const a of amounts) { if (a > 0) { hasPositive = true; break; } }
    if (hasPositive) next.pending.push({ id: `vp:${next.year}:${b.id}`, bucketId: b.id, holdingYear: next.year, receiptYear: next.year + 1, amounts })
  }
  const tax = next.taxYears.at(-1)
  if (!tax || tax.year !== next.year) throw new Error('No active tax year')
  let income = 0
  for (const incomeRecord of next.taxIncome) {
    if (incomeRecord.ledgerYear === next.year) income = finite(income + incomeRecord.amount)
  }
  Object.assign(tax, calculateTax(income, tax.openingLoss, tax.allowance, tax.churchRate))
  if (tax.paid > tax.liability) throw new Error('Reconcile same-year refund before closing')
  next.phase = 'closed'
  return checked(next)
}
/** @internal Batch-only helper; every batch must be closed with `finishTransactionBatch`. */
export function closeWithPendingVPInBatch(next: InvestmentState, seen: Set<string>, firstPrices: Record<string, number>, basisRate: number): void {
  const id = `close:${next.year}`
  identifier(id)
  if (next.phase !== 'closing') throw new Error('Invalid event order')
  if (seen.has(id)) throw new Error(`Duplicate event ${id}`)
  seen.add(id)
  next.eventIds.push(id)
  { const fundIds: string[] = []; for (const b of next.buckets) { if (b.classification !== 'deposit') fundIds.push(b.id); } completeKeys(firstPrices, fundIds); }
  finite(basisRate)
  if (next.pending.length) throw new Error('Unreceived pending VP')
  for (const b of next.buckets) {
    if (b.classification === 'deposit') continue
    const amounts: number[] = [];
    for (const c of b.cohorts) amounts.push(calculateVorabpauschale(firstPrices[b.id], b.price, basisRate, c.units, c.acquiredYear === next.year ? c.acquiredMonth : 1));
    let hasPositive = false;
    for (const a of amounts) { if (a > 0) { hasPositive = true; break; } }
    if (hasPositive) next.pending.push({ id: `vp:${next.year}:${b.id}`, bucketId: b.id, holdingYear: next.year, receiptYear: next.year + 1, amounts })
  }
  const tax = next.taxYears.at(-1)
  if (!tax || tax.year !== next.year) throw new Error('No active tax year')
  let income = 0
  for (const incomeRecord of next.taxIncome) {
    if (incomeRecord.ledgerYear === next.year) income = finite(income + incomeRecord.amount)
  }
  Object.assign(tax, calculateTax(income, tax.openingLoss, tax.allowance, tax.churchRate))
  if (tax.paid > tax.liability) throw new Error('Reconcile same-year refund before closing')
  next.phase = 'closed'
}
/** @internal Batch-only helper; every batch must be closed with `finishTransactionBatch`. */
export function receivePendingVPInBatch(next: InvestmentState, seen: Set<string>): void {
  const id = `receipt:${next.year}`
  identifier(id)
  if (next.phase !== 'opening' && next.phase !== 'closing') throw new Error('Invalid event order')
  if (seen.has(id)) throw new Error(`Duplicate event ${id}`)
  seen.add(id)
  next.eventIds.push(id)
  for (const pending of next.pending) {
    if (pending.receiptYear !== next.year) throw new Error('Wrong VP receipt year')
    const b = fund(next, pending.bucketId)
    if (b.cohorts.length !== pending.amounts.length) throw new Error('Pending cohort mismatch')
    let gross = 0
    for (let i = 0; i < pending.amounts.length; i++) { const amount = pending.amounts[i] as number; (b.cohorts[i] as { assessedVP: number }).assessedVP += amount; gross = finite(gross + amount); }
    recordIncome(next, { id: pending.id, bucketId: b.id, kind: 'vp', ledgerYear: next.year, receiptYear: pending.receiptYear, gross, exemptFraction: b.classification === 'equityFund' ? 0.3 : 0 })
  }
  next.pending = []
}
// Internal boundary operation. Annual start uses legal receipt year; terminal may use the horizon ledger year.
export function receivePendingVP(state: InvestmentState): InvestmentState {
  const next = transition(state, `receipt:${state.year}`, ['opening', 'closing'])
  for (const pending of next.pending) {
    if (pending.receiptYear !== next.year) throw new Error('Wrong VP receipt year')
    const b = fund(next, pending.bucketId)
    if (b.cohorts.length !== pending.amounts.length) throw new Error('Pending cohort mismatch')
    let gross = 0
    for (let i = 0; i < pending.amounts.length; i++) { const amount = pending.amounts[i] as number; (b.cohorts[i] as { assessedVP: number }).assessedVP += amount; gross = finite(gross + amount); }
    recordIncome(next, { id: pending.id, bucketId: b.id, kind: 'vp', ledgerYear: next.year, receiptYear: pending.receiptYear, gross, exemptFraction: b.classification === 'equityFund' ? 0.3 : 0 })
  }
  next.pending = []
  return checked(next)
}
