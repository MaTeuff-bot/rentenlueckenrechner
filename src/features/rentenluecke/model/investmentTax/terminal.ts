import type { InvestmentState } from './types'
import { applyTransaction } from './holdings'
import { reconcileTax, recordIncome, unpaidTax } from './taxLedger'
import { checked, finite, fund, nonnegative, totalValue, transition } from './validation'

export function valueHypotheticalLiquidation(state: InvestmentState, cashId: string, cumulativeInflation: number, cutoff: 'beforeHoldingCutoff' | 'afterHoldingCutoff' = 'beforeHoldingCutoff') {
  nonnegative(cumulativeInflation)
  if (cumulativeInflation === 0) throw new Error('Zero inflation factor')
  if (!['beforeHoldingCutoff', 'afterHoldingCutoff'].includes(cutoff)) throw new Error('Invalid cutoff')
  let next = transition(state, `terminal:${state.year}`, ['closed'])
  if (!next.taxYears.length) throw new Error('Terminal requires a completed horizon year')
  next.phase = 'closing'
  for (const pending of next.pending) {
    if (pending.holdingYear > state.year || pending.receiptYear !== pending.holdingYear + 1) throw new Error('Invalid pending year')
    if (cutoff === 'beforeHoldingCutoff' && pending.holdingYear === state.year) continue
    const b = fund(next, pending.bucketId)
    if (pending.amounts.length !== b.cohorts.length) throw new Error('Pending cohort mismatch')
    let gross = 0
    pending.amounts.forEach((amount, i) => { b.cohorts[i].assessedVP += amount; gross = finite(gross + amount) })
    // Same-horizon valuation approximation: legal receipt metadata is retained, no new allowance.
    recordIncome(next, { id: pending.id, bucketId: b.id, kind: 'vp', ledgerYear: state.year, receiptYear: pending.receiptYear, gross, exemptFraction: b.classification === 'equityFund' ? 0.3 : 0 })
  }
  next.pending = []
  for (const b of next.buckets) {
    if (b.classification === 'deposit') continue
    next = applyTransaction(next, { id: `terminal-sale:${state.year}:${b.id}`, kind: 'sale', fundId: b.id, cashId, units: b.cohorts.reduce((n, c) => finite(n + c.units), 0) })
  }
  next = reconcileTax(next, cashId, `terminal-tax:${state.year}`)
  const outstandingLiability = unpaidTax(next)
  const nominal = finite(totalValue(next) - outstandingLiability)
  // Park in 'closed' so a caller cannot run closeWithPendingVP afterwards and mint a
  // second `vp:` record for cohorts whose VP this liquidation already assessed (read side).
  next.phase = 'closed'
  return { nominal, real: finite(nominal / cumulativeInflation), outstandingLiability, state: checked(next) }
}
