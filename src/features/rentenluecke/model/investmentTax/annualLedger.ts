import type { AnnualInput, AnnualResult, InvestmentState, TaxYear } from './types'
import { applyTransaction } from './holdings'
import { calculateTax, reconcileTax, recordIncome } from './taxLedger'
import { closeWithPendingVP, receivePendingVP, receivePendingVPInBatch } from './vorabpauschale'
import { checked, completeDepositRates, completeKeys, finite, identifier, integer, totalValue, transition } from './validation'

export function beginInvestmentYear(state: InvestmentState, year: number, allowance: number, churchRate: TaxYear['churchRate']): InvestmentState {
  integer(year, 'year')
  if (year !== state.year + 1) throw new Error('Years must be consecutive')
  const next = transition(state, `begin:${year}`, ['closed'])
  const openingLoss = next.taxYears.at(-1)?.loss ?? 0
  next.taxYears.push({ year, openingLoss, allowance, churchRate, paid: 0, ...calculateTax(0, openingLoss, allowance, churchRate) })
  next.year = year; next.phase = 'opening'
  return receivePendingVP(next)
}
export function beginInvestmentYearInBatch(next: InvestmentState, seen: Set<string>, year: number, allowance: number, churchRate: TaxYear['churchRate']): void {
  integer(year, 'year')
  if (year !== next.year + 1) throw new Error('Years must be consecutive')
  const beginId = `begin:${year}`
  identifier(beginId)
  if (next.phase !== 'closed') throw new Error('Invalid event order')
  if (seen.has(beginId)) throw new Error(`Duplicate event ${beginId}`)
  seen.add(beginId)
  next.eventIds.push(beginId)
  const openingLoss = next.taxYears.at(-1)?.loss ?? 0
  next.taxYears.push({ year, openingLoss, allowance, churchRate, paid: 0, ...calculateTax(0, openingLoss, allowance, churchRate) })
  next.year = year; next.phase = 'opening'
  receivePendingVPInBatch(next, seen)
}
export function applyAnnualPricesAndInterestInBatch(next: InvestmentState, seen: Set<string>, prices: Record<string, number>, rates: Record<string, number>): void {
  const marketId = `market:${next.year}`
  identifier(marketId)
  if (next.phase !== 'opening') throw new Error('Invalid event order')
  if (seen.has(marketId)) throw new Error(`Duplicate event ${marketId}`)
  seen.add(marketId)
  next.eventIds.push(marketId)
  { const fundIds: string[] = []; const depositIds: string[] = []; for (const b of next.buckets) { if (b.classification === 'deposit') depositIds.push(b.id); else fundIds.push(b.id); } completeKeys(prices, fundIds); completeDepositRates(rates, depositIds); }
  for (const b of next.buckets) {
    if (b.classification !== 'deposit') b.price = prices[b.id]
    else {
      const nominal = rates[b.id] as number
      if (typeof nominal !== 'number' || !Number.isFinite(nominal) || nominal < -1) throw new Error(`Invalid deposit rate for ${b.id}`)
      const before = b.value
      const signedMovement = finite(before * nominal)
      b.value = finite(before + signedMovement)
      if (nominal >= 0) {
        const positiveInterest = finite(before * nominal)
        recordIncome(next, { id: `interest:${next.year}:${b.id}`, bucketId: b.id, kind: 'interest', ledgerYear: next.year, receiptYear: next.year, gross: positiveInterest, exemptFraction: 0 })
        next.transactions.push({ id: `interest:${next.year}:${b.id}`, year: next.year, kind: 'interest', bucketId: b.id, cash: positiveInterest, basis: 0, assessedVP: 0 })
      } else {
        next.transactions.push({ id: `deposit-movement:${next.year}:${b.id}`, year: next.year, kind: 'deposit-movement', bucketId: b.id, cash: signedMovement, basis: 0, assessedVP: 0 })
      }
    }
  }
  next.phase = 'closing'
}
export function applyAnnualPricesAndInterest(state: InvestmentState, prices: Record<string, number>, rates: Record<string, number>): InvestmentState {
  const next = transition(state, `market:${state.year}`, ['opening'])
  { const fundIds: string[] = []; const depositIds: string[] = []; for (const b of next.buckets) { if (b.classification === 'deposit') depositIds.push(b.id); else fundIds.push(b.id); } completeKeys(prices, fundIds); completeDepositRates(rates, depositIds); }
  for (const b of next.buckets) {
    if (b.classification !== 'deposit') b.price = prices[b.id]
    else {
      const nominal = rates[b.id] as number
      if (typeof nominal !== 'number' || !Number.isFinite(nominal) || nominal < -1) throw new Error(`Invalid deposit rate for ${b.id}`)
      const before = b.value
      const signedMovement = finite(before * nominal)
      b.value = finite(before + signedMovement)
      if (nominal >= 0) {
        const positiveInterest = finite(before * nominal)
        recordIncome(next, { id: `interest:${state.year}:${b.id}`, bucketId: b.id, kind: 'interest', ledgerYear: state.year, receiptYear: state.year, gross: positiveInterest, exemptFraction: 0 })
        next.transactions.push({ id: `interest:${state.year}:${b.id}`, year: state.year, kind: 'interest', bucketId: b.id, cash: positiveInterest, basis: 0, assessedVP: 0 })
      } else {
        next.transactions.push({ id: `deposit-movement:${state.year}:${b.id}`, year: state.year, kind: 'deposit-movement', bucketId: b.id, cash: signedMovement, basis: 0, assessedVP: 0 })
      }
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
