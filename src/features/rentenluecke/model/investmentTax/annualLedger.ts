import type { AnnualInput, AnnualResult, InvestmentState, TaxYear } from './types'
import { applyTransaction } from './holdings'
import { calculateTax, reconcileTax, recordIncome } from './taxLedger'
import { closeWithPendingVP, receivePendingVP } from './vorabpauschale'
import { checked, completeKeys, finite, integer, totalValue, transition } from './validation'

export function beginInvestmentYear(state: InvestmentState, year: number, allowance: number, churchRate: TaxYear['churchRate']): InvestmentState {
  integer(year, 'year')
  if (year !== state.year + 1) throw new Error('Years must be consecutive')
  const next = transition(state, `begin:${year}`, ['closed'])
  const openingLoss = next.taxYears.at(-1)?.loss ?? 0
  next.taxYears.push({ year, openingLoss, allowance, churchRate, paid: 0, ...calculateTax(0, openingLoss, allowance, churchRate) })
  next.year = year; next.phase = 'opening'
  return receivePendingVP(next)
}
export function applyAnnualPricesAndInterest(state: InvestmentState, prices: Record<string, number>, rates: Record<string, number>): InvestmentState {
  const next = transition(state, `market:${state.year}`, ['opening'])
  completeKeys(prices, next.buckets.filter(b => b.classification !== 'deposit').map(b => b.id))
  completeKeys(rates, next.buckets.filter(b => b.classification === 'deposit').map(b => b.id))
  for (const b of next.buckets) {
    if (b.classification !== 'deposit') b.price = prices[b.id]
    else {
      const interest = finite(b.value * rates[b.id])
      b.value += interest
      recordIncome(next, { id: `interest:${state.year}:${b.id}`, bucketId: b.id, kind: 'interest', ledgerYear: state.year, receiptYear: state.year, gross: interest, exemptFraction: 0 })
      next.transactions.push({ id: `interest:${state.year}:${b.id}`, year: state.year, kind: 'interest', bucketId: b.id, cash: interest, basis: 0, assessedVP: 0 })
    }
  }
  next.phase = 'closing'
  return checked(next)
}
export function simulateInvestmentYear(state: InvestmentState, input: AnnualInput): AnnualResult {
  const openingValue = totalValue(state)
  const firstPrices = Object.fromEntries(state.buckets.filter(b => b.classification !== 'deposit').map(b => [b.id, b.price]))
  let next = beginInvestmentYear(state, input.year, input.allowance, input.churchRate)
  for (const event of input.opening) next = applyTransaction(next, event)
  const beforeMarket = totalValue(next)
  next = applyAnnualPricesAndInterest(next, input.closingPrices, input.interestRates)
  const marketChange = finite(totalValue(next) - beforeMarket)
  for (const event of input.closing) next = applyTransaction(next, event)
  next = reconcileTax(next, input.taxCashId, `annual-tax:${input.year}`)
  next = closeWithPendingVP(next, firstPrices, input.basisRate)
  const transactions = next.transactions.slice(state.transactions.length)
  const sum = (kind: string) => transactions.filter(t => t.kind === kind).reduce((n, t) => finite(n + t.cash), 0)
  const interest = sum('interest')
  return { openingValue, closingValue: totalValue(next), externalCash: sum('external'), priceIncome: finite(marketChange - interest), interest, taxCash: -sum('tax'), state: next }
}
