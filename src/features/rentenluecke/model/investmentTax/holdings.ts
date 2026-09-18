import type { InvestmentState, OpeningBucket, Transaction } from './types'
import { checked, deposit, finite, fund, identifier, integer, nonnegative, transition } from './validation'
import { recordIncome } from './taxLedger'

export function createInvestmentState(firstYear: number, buckets: OpeningBucket[]): InvestmentState {
  integer(firstYear, 'year')
  const ids = new Set<string>()
  const state: InvestmentState = {
    year: firstYear - 1, phase: 'closed', pending: [], taxIncome: [], contributionIncome: [], transactions: [], taxYears: [], eventIds: [],
    buckets: buckets.map(b => {
      identifier(b.id); identifier(b.name)
      if (ids.has(b.id)) throw new Error('Duplicate bucket')
      ids.add(b.id)
      if (b.classification === 'deposit') { nonnegative(b.value); return { ...b } }
      if (!['equityFund', 'bondFund'].includes(b.classification)) throw new Error('Invalid classification')
      nonnegative(b.units); nonnegative(b.price); nonnegative(b.acquisitionCost)
      if (b.units === 0 && b.acquisitionCost !== 0) throw new Error('Basis without units')
      return { id: b.id, name: b.name, classification: b.classification, price: b.price,
        cohorts: b.units === 0 ? [] : [{ units: b.units, basis: b.acquisitionCost, assessedVP: 0, acquiredYear: firstYear - 1, acquiredMonth: 1 }] }
    }),
  }
  return checked(state)
}
export function applyTransaction(state: InvestmentState, event: Transaction): InvestmentState {
  if (/^(begin|receipt|market|close|vp|interest|annual-tax|terminal):/.test(event.id)) throw new Error('Reserved event identifier')
  const next = transition(state, event.id, ['opening', 'closing'])
  let cashDelta = 0, basis = 0, assessedVP = 0, bucketId: string
  if (event.kind === 'external') {
    finite(event.amount)
    const cash = deposit(next, event.cashId)
    cash.value += event.amount
    cashDelta = event.amount; bucketId = cash.id
  } else if (event.kind === 'transfer') {
    nonnegative(event.amount)
    const from = deposit(next, event.fromId), to = deposit(next, event.toId)
    if (from.id === to.id || event.amount > from.value) throw new Error('Invalid transfer')
    from.value -= event.amount; to.value += event.amount; bucketId = from.id
  } else {
    const holding = fund(next, event.fundId), cash = deposit(next, event.cashId)
    bucketId = holding.id
    // Pending receipts must be posted first, even for a worthless or fully sold holding.
    if (next.pending.some(p => p.bucketId === holding.id)) throw new Error('Receive pending VP before sale or purchase')
    if (event.kind === 'purchase') {
      nonnegative(event.amount)
      if (holding.price <= 0 || event.amount > cash.value) throw new Error('Unfunded purchase or zero price')
      const units = finite(event.amount / holding.price)
      if (event.amount > 0 && units === 0) throw new Error('Purchase underflow')
      if (units > 0) holding.cohorts.push({ units, basis: event.amount, assessedVP: 0, acquiredYear: next.year, acquiredMonth: next.phase === 'opening' ? 1 : 12 })
      basis = event.amount; cashDelta = -event.amount
    } else {
      nonnegative(event.units)
      const units = holding.cohorts.reduce((n, c) => finite(n + c.units), 0)
      if (event.units > units) throw new Error('Oversale')
      const fraction = units === 0 ? 0 : event.units / units
      cashDelta = finite(event.units * holding.price)
      for (const cohort of holding.cohorts) {
        const releasedBasis = cohort.basis * fraction, releasedVP = cohort.assessedVP * fraction
        basis += releasedBasis; assessedVP += releasedVP
        cohort.units *= 1 - fraction; cohort.basis -= releasedBasis; cohort.assessedVP -= releasedVP
      }
      holding.cohorts = holding.cohorts.filter(c => c.units > 0)
      recordIncome(next, { id: event.id, bucketId, kind: 'sale', ledgerYear: next.year, receiptYear: next.year,
        gross: finite(cashDelta - basis - assessedVP), exemptFraction: holding.classification === 'equityFund' ? 0.3 : 0 })
      basis = -basis; assessedVP = -assessedVP
    }
    cash.value += cashDelta
  }
  next.transactions.push({ id: event.id, year: next.year, kind: event.kind, bucketId, cash: cashDelta, basis, assessedVP })
  return checked(next)
}
