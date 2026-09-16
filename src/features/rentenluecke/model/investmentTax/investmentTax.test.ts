import { describe, expect, it } from 'vitest'
import { applyTransaction, createInvestmentState } from './holdings'
import { applyAnnualPricesAndInterest, beginInvestmentYear, simulateInvestmentYear } from './annualLedger'
import { calculateTax, reconcileTax, unpaidTax } from './taxLedger'
import { calculateVorabpauschale, closeWithPendingVP, receivePendingVP } from './vorabpauschale'
import { valueHypotheticalLiquidation } from './terminal'
import { fund, totalValue } from './validation'
import type { AnnualInput, InvestmentState } from './types'

const initial = (classification: 'equityFund' | 'bondFund' = 'equityFund', cash = 1000) => createInvestmentState(2026, [
  { id: 'f', name: 'Fund', classification, units: 100, price: 100, acquisitionCost: 8000 },
  { id: 'cash', name: 'Cash', classification: 'deposit', value: cash },
  { id: 'future', name: 'Future bond fund', classification: 'bondFund', units: 0, price: 20, acquisitionCost: 0 },
])
const annual = (year = 2026, price = 110): AnnualInput => ({ year, allowance: 1000, churchRate: 0, opening: [], closing: [], closingPrices: { f: price, future: 21 }, interestRates: { cash: 0 }, basisRate: 0.032, taxCashId: 'cash' })
const start = (s = initial(), allowance = 1000) => beginInvestmentYear(s, 2026, allowance, 0)
const sale = (s: InvestmentState, units: number, id = 'sale') => applyTransaction(s, { id, kind: 'sale', fundId: 'f', cashId: 'cash', units })
const totals = (s: InvestmentState) => fund(s, 'f').cohorts.reduce((n, c) => ({ units: n.units + c.units, basis: n.basis + c.basis, vp: n.vp + c.assessedVP }), { units: 0, basis: 0, vp: 0 })

describe('inactive investment tax foundation', () => {
  it('retains nominal opening values, empty identities, and immutable histories', () => {
    const s = initial(), copy = structuredClone(s)
    const next = sale(start(s), 25)
    expect(s).toEqual(copy)
    expect(totals(next)).toEqual({ units: 75, basis: 6000, vp: 0 })
    expect(next.taxIncome[0].amount).toBe(350)
    expect(next.contributionIncome).toEqual(next.taxIncome)
    expect(next.contributionIncome[0]).not.toBe(next.taxIncome[0])
    expect(fund(next, 'future').cohorts).toEqual([])
  })
  it.each(['equityFund', 'bondFund'] as const)('taxes signed %s sales and conserves average basis', classification => {
    let s = start(initial(classification))
    s = applyTransaction(s, { id: 'buy', kind: 'purchase', fundId: 'f', cashId: 'cash', amount: 1000 })
    expect(fund(s, 'f').cohorts[1].assessedVP).toBe(0)
    s = sale(s, 55)
    expect(totals(s).basis).toBe(4500)
    expect(s.taxIncome[0].gross).toBe(1000)
    expect(s.taxIncome[0].amount).toBe(classification === 'equityFund' ? 700 : 1000)
    s = sale(s, 55, 'rest')
    expect(totals(s)).toEqual({ units: 0, basis: 0, vp: 0 })
    expect(s.transactions.filter(t => t.kind === 'sale').reduce((n, t) => n - t.basis, 0)).toBe(9000)
  })
  it('uses gross VP, price caps and acquisition months independently of exemption', () => {
    expect(calculateVorabpauschale(100, 110, 0.032, 100, 1)).toBeCloseTo(224, 12)
    expect(calculateVorabpauschale(100, 101, 0.032, 100, 1)).toBe(100)
    expect(calculateVorabpauschale(100, 90, 0.032, 100, 1)).toBe(0)
    expect(calculateVorabpauschale(100, 110, -0.01, 100, 1)).toBe(0)
    expect(calculateVorabpauschale(100, 110, 0.032, 100, 12)).toBeCloseTo(224 / 12)
    expect(calculateVorabpauschale(0, 110, 0.032, 100, 1)).toBe(0)
    for (const month of [0, 13, 1.5, NaN]) expect(() => calculateVorabpauschale(100, 110, 0.032, 100, month)).toThrow()
  })
  it('receives pending before sales; allowance-covered gross VP is deducted once', () => {
    const closed = simulateInvestmentYear(initial(), annual()).state
    expect(closed.pending[0].amounts[0]).toBeCloseTo(224)
    expect(() => sale(closed, 100)).toThrow(/order/)
    let s = beginInvestmentYear(closed, 2027, 1000, 0)
    expect(s.taxIncome.at(-1)?.amount).toBeCloseTo(156.8)
    s = reconcileTax(s, 'cash', 'vp-tax')
    expect(s.taxYears.at(-1)?.paid).toBe(0)
    s = applyTransaction(s, { id: 'new', kind: 'purchase', fundId: 'f', cashId: 'cash', amount: 110 })
    expect(fund(s, 'f').cohorts.at(-1)?.assessedVP).toBe(0)
    s = sale(s, 50.5)
    expect(s.transactions.at(-1)?.assessedVP).toBeCloseTo(-112)
    s = sale(s, 50.5, 'last')
    expect(totals(s).vp).toBe(0)
    expect(s.taxIncome.reduce((n, r) => n + r.gross, 0)).toBeCloseTo(3000)
    expect(s.pending).toEqual([])
  })
  it('retains worthless unsold basis and permits disposal at zero price, but rejects zero-price purchase', () => {
    let s = applyAnnualPricesAndInterest(start(), { f: 0, future: 0 }, { cash: 0 })
    expect(totals(s).basis).toBe(8000)
    expect(() => applyTransaction(s, { id: 'buy', kind: 'purchase', fundId: 'f', cashId: 'cash', amount: 1 })).toThrow()
    s = sale(s, 100)
    expect(s.taxIncome.find(r => r.kind === 'sale')?.amount).toBe(-5600)
    expect(totals(s).basis).toBe(0)
    expect(fund(s, 'f').id).toBe('f')
  })
  it('credits bank interest once, with principal transfers and withdrawals untaxed', () => {
    let s = createInvestmentState(2026, [{ id: 'a', name: 'A', classification: 'deposit', value: 1000 }, { id: 'b', name: 'B', classification: 'deposit', value: 0 }])
    s = beginInvestmentYear(s, 2026, 0, 0)
    s = applyTransaction(s, { id: 'transfer', kind: 'transfer', fromId: 'a', toId: 'b', amount: 500 })
    s = applyAnnualPricesAndInterest(s, {}, { a: 0.02, b: 0.04 })
    expect(totalValue(s)).toBe(1030)
    expect(s.taxIncome.reduce((n, r) => n + r.amount, 0)).toBe(30)
    expect(() => applyAnnualPricesAndInterest(s, {}, { a: 0.02, b: 0.04 })).toThrow()
    s = applyTransaction(s, { id: 'withdraw', kind: 'external', cashId: 'b', amount: -520 })
    expect(s.taxIncome).toHaveLength(2)
    expect(totalValue(s)).toBe(510)
  })
  it('offsets losses before allowance and calculates church rates', () => {
    expect(calculateTax(1500, 700, 1000, 0)).toMatchObject({ loss: 0, allowanceUsed: 800, liability: 0 })
    expect(calculateTax(-500, 700, 1000, 0)).toMatchObject({ loss: 1200, allowanceUsed: 0, liability: 0 })
    expect(calculateTax(1000, 0, 0, 0).liability).toBe(263.75)
    expect(calculateTax(1000, 0, 0, 0.08).liability).toBeCloseTo(278.186274509804)
    expect(calculateTax(1000, 0, 0, 0.09).liability).toBeCloseTo(279.951100244499)
  })
  it('refunds only same-year payments and keeps contribution income independent', () => {
    let s = sale(start(initial('bondFund'), 0), 50)
    s = reconcileTax(s, 'cash', 'first-tax')
    expect(s.taxYears[0].paid).toBe(263.75)
    s = applyAnnualPricesAndInterest(s, { f: 0, future: 21 }, { cash: 0 })
    s = sale(s, 50, 'loss')
    const before = totalValue(s)
    s = reconcileTax(s, 'cash', 'refund')
    expect(totalValue(s) - before).toBe(263.75)
    expect(s.taxYears[0]).toMatchObject({ paid: 0, liability: 0, loss: 3000 })
    expect(s.contributionIncome.filter(r => r.kind === 'sale').map(r => r.amount)).toEqual([1000, -4000])
    const again = reconcileTax(s, 'cash', 'again')
    expect(totalValue(again)).toBe(totalValue(s))
    expect(() => reconcileTax(again, 'cash', 'again')).toThrow(/Duplicate/)
  })
  it('preserves unpaid prior-year VP tax without funding sales or refunds from closed years', () => {
    const y1 = simulateInvestmentYear(initial('bondFund', 0), { ...annual(), allowance: 0 }).state
    const y2 = simulateInvestmentYear(y1, { ...annual(2027, 0), allowance: 0 }).state
    expect(unpaidTax(y2)).toBeCloseTo(224 * 0.26375)
    const y3 = simulateInvestmentYear(y2, { ...annual(2028, 0), allowance: 0 }).state
    const result = valueHypotheticalLiquidation(y3, 'cash', 1)
    expect(result.nominal).toBeCloseTo(-224 * 0.26375)
    expect(result.state.taxYears[1].paid).toBe(0)
    expect(result.state.taxYears[2].loss).toBeCloseTo(8224)
  })
  it('reconciles both same-horizon cutoffs without new allowance or mutating continuation', () => {
    const s = simulateInvestmentYear(initial(), annual()).state, copy = structuredClone(s)
    const before = valueHypotheticalLiquidation(s, 'cash', 2)
    const after = valueHypotheticalLiquidation(s, 'cash', 2, 'afterHoldingCutoff')
    // 3000 economic gain × 70% minus 1000 allowance = 1100; tax = 290.125.
    expect(before.nominal).toBeCloseTo(12000 - 290.125)
    expect(after.nominal).toBeCloseTo(before.nominal)
    expect(after.real).toBeCloseTo(after.nominal / 2)
    expect(after.state.taxYears).toHaveLength(1)
    expect(after.state.taxIncome.find(r => r.kind === 'vp')).toMatchObject({ ledgerYear: 2026, receiptYear: 2027 })
    expect(before.state.taxIncome.some(r => r.kind === 'vp')).toBe(false)
    expect(after.state.pending).toEqual([])
    expect(s).toEqual(copy)
    expect(() => valueHypotheticalLiquidation(s, 'cash', 0)).toThrow()
  })
  it('retains older pending receipts even under the before-cutoff valuation convention', () => {
    const s = simulateInvestmentYear(initial(), annual()).state
    // Boundary fixture: mandatory historical receipt carried in, independently of prospective VP.
    s.pending[0].holdingYear = 2025; s.pending[0].receiptYear = 2026
    const result = valueHypotheticalLiquidation(s, 'cash', 1)
    expect(result.state.taxIncome.find(r => r.kind === 'vp')?.gross).toBeCloseTo(224)
    expect(result.nominal).toBeCloseTo(12000 - 290.125)
  })
  it('purchases a future bucket after zero-holding years at its current quote', () => {
    let s = initial()
    for (let i = 0; i < 3; i++) {
      s = simulateInvestmentYear(s, { ...annual(2026 + i, 100), closingPrices: { f: 100, future: 20 + 10 * (i + 1) } }).state
      expect(fund(s, 'future').cohorts).toEqual([])
    }
    const result = simulateInvestmentYear(s, { ...annual(2029, 100), closingPrices: { f: 100, future: 60 },
      opening: [{ id: 'future-buy', kind: 'purchase', fundId: 'future', cashId: 'cash', amount: 500 }] })
    expect(fund(result.state, 'future').cohorts).toEqual([
      { units: 10, basis: 500, assessedVP: 0, acquiredYear: 2029, acquiredMonth: 1 },
    ])
    expect(result.priceIncome).toBe(100)
    expect(result.state.pending.find(p => p.bucketId === 'future')?.amounts[0]).toBeCloseTo(11.2)
    expect(result.closingValue).toBeCloseTo(result.openingValue + 100)
  })
  it('assesses VP only on surviving units after opening and closing partial sales', () => {
    const result = simulateInvestmentYear(initial(), { ...annual(),
      opening: [{ id: 'opening-sale', kind: 'sale', fundId: 'f', cashId: 'cash', units: 25 }],
      closing: [{ id: 'closing-sale', kind: 'sale', fundId: 'f', cashId: 'cash', units: 25 }],
    })
    expect(totals(result.state).units).toBeCloseTo(50)
    expect(totals(result.state).basis).toBe(4000)
    expect(totals(result.state).vp).toBe(0)
    expect(result.state.pending[0].amounts[0]).toBeCloseTo(112)
    const received = beginInvestmentYear(result.state, 2027, 1000, 0)
    expect(totals(received).vp).toBeCloseTo(112)
    const sold = sale(received, 50, 'surviving-sale')
    expect(sold.transactions.at(-1)?.assessedVP).toBeCloseTo(-112)
    const final = totals(sold)
    expect(final.units).toBeCloseTo(0, 9); expect(final.basis).toBeCloseTo(0, 9); expect(final.vp).toBeCloseTo(0, 9)
    expect(sold.taxIncome.reduce((n, r) => n + r.gross, 0)).toBeCloseTo(2750)
  })
  it('separates contributions from price performance and uses December VP reduction', () => {
    const closing: AnnualInput['closing'] = [
      { id: 'new-cash', kind: 'external', cashId: 'cash', amount: 11000 },
      { id: 'closing-buy', kind: 'purchase', fundId: 'f', cashId: 'cash', amount: 11000 },
    ]
    const rising = simulateInvestmentYear(initial(), { ...annual(), closing })
    expect(rising.externalCash).toBe(11000)
    expect(rising.priceIncome).toBe(1000)
    expect(rising.state.pending[0].amounts[0]).toBeCloseTo(224)
    expect(rising.state.pending[0].amounts[1]).toBeCloseTo(224 / 12)
    expect(rising.closingValue).toBeCloseTo(rising.openingValue + 11000 + 1000)
    const flat = simulateInvestmentYear(initial(), { ...annual(2026, 100), closing })
    expect(flat.priceIncome).toBe(0)
    expect(flat.state.pending).toEqual([])
  })
  it.each(['beforeHoldingCutoff', 'afterHoldingCutoff'] as const)('protects terminal state under %s', cutoff => {
    const closed = simulateInvestmentYear(initial(), annual()).state
    const first = valueHypotheticalLiquidation(closed, 'cash', 1, cutoff)
    expect(valueHypotheticalLiquidation(closed, 'cash', 1, cutoff)).toEqual(first)
    expect(first.state.phase).toBe('terminated')
    expect(first.state.taxYears).toHaveLength(1)
    expect(first.state.pending).toEqual([])
    expect(totals(first.state)).toEqual({ units: 0, basis: 0, vp: 0 })
    expect(() => valueHypotheticalLiquidation(first.state, 'cash', 1, cutoff)).toThrow(/Invalid event order/)
    expect(() => beginInvestmentYear(first.state, 2027, 1000, 0)).toThrow(/Invalid event order/)
    expect(() => beginInvestmentYear(first.state, 2027, 0, 0)).toThrow(/Invalid event order/)
    expect(() => closeWithPendingVP(first.state, { f: 110, future: 21 }, 0.032)).toThrow(/Invalid event order/)
    expect(() => receivePendingVP(first.state)).toThrow(/Invalid event order/)
    expect(() => applyAnnualPricesAndInterest(first.state, { f: 110, future: 21 }, { cash: 0 })).toThrow(/Invalid event order/)
    expect(() => reconcileTax(first.state, 'cash', 'terminal-retry-tax')).toThrow(/Invalid event order/)
    expect(() => applyTransaction(first.state, { id: 'terminal-retry-external', kind: 'external', cashId: 'cash', amount: 1 })).toThrow(/Invalid event order/)
    expect(() => applyTransaction(first.state, { id: 'terminal-retry-transfer', kind: 'transfer', fromId: 'cash', toId: 'cash', amount: 1 })).toThrow(/Invalid event order/)
    expect(() => simulateInvestmentYear(first.state, { ...annual(2027, 110), year: 2027 })).toThrow(/Invalid event order/)
    expect(first.state.taxYears).toHaveLength(1)
  })
  it('requires complete annual quotes including empty buckets and rejects duplicate/out-of-order operations', () => {
    const s = initial(), active = start(s)
    expect(() => applyAnnualPricesAndInterest(active, { f: 110 }, { cash: 0 })).toThrow()
    expect(() => closeWithPendingVP(active, { f: 100, future: 20 }, 0.032)).toThrow()
    expect(() => receivePendingVP(active)).toThrow(/Duplicate/)
    const closed = simulateInvestmentYear(s, annual()).state
    expect(() => simulateInvestmentYear(closed, annual())).toThrow()
    expect(() => beginInvestmentYear(closed, 2028, 0, 0)).toThrow()
    expect(() => closeWithPendingVP(closed, { f: 100, future: 20 }, 0.032)).toThrow()
    const sold = sale(active, 1)
    expect(() => sale(sold, 1)).toThrow(/Duplicate/)
  })
  it('rejects NaN, infinity, overflow, oversales, invalid classifications and unfunded events atomically', () => {
    const s = start(), copy = structuredClone(s)
    for (const n of [NaN, Infinity, -1, 101, Number.MAX_VALUE]) expect(() => sale(s, n)).toThrow()
    expect(() => applyTransaction(s, { id: 'x', kind: 'external', cashId: 'cash', amount: -1001 })).toThrow()
    expect(() => applyTransaction(s, { id: 'x', kind: 'purchase', fundId: 'f', cashId: 'cash', amount: 1001 })).toThrow()
    expect(() => calculateVorabpauschale(1e15, 2e15, 10, 100, 1)).toThrow()
    expect(() => calculateTax(1, 0, NaN, 0)).toThrow()
    expect(() => createInvestmentState(2026, [{ id: 'x', name: 'X', classification: 'deposit', value: NaN }])).toThrow()
    expect(() => createInvestmentState(2026, [...initial().buckets.filter(b => b.classification === 'deposit'), { id: 'cash', name: 'duplicate', classification: 'deposit', value: 1 }])).toThrow()
    expect(s).toEqual(copy)
  })
})

function path(years: number, basisRate: number, allowance: number, timing: 'opening' | 'closing') {
  let s = createInvestmentState(2026, [
    { id: 'f', name: 'Fund', classification: 'equityFund', units: 100, price: 100, acquisitionCost: 10000 },
    { id: 'cash', name: 'Cash', classification: 'deposit', value: 10000 },
  ])
  let external = 0, growth = 0, payments = 0, purchases = 0, vpReceived = 0
  for (let i = 0; i < years; i++) {
    const year = 2026 + i, price = 100 * 1.04 ** (i + 1)
    const events: AnnualInput['opening'] = [
      { id: `contribution:${i}`, kind: 'external', cashId: 'cash', amount: 200 },
      { id: `buy:${i}`, kind: 'purchase', cashId: 'cash', fundId: 'f', amount: 200 },
    ]
    const result = simulateInvestmentYear(s, { year, allowance, churchRate: 0, opening: timing === 'opening' ? events : [], closing: timing === 'closing' ? events : [], closingPrices: { f: price }, interestRates: { cash: 0 }, basisRate, taxCashId: 'cash' })
    expect(result.closingValue).toBeCloseTo(result.openingValue + result.externalCash + result.priceIncome + result.interest - result.taxCash, 7)
    external += result.externalCash; growth += result.priceIncome; payments += result.taxCash; purchases += 200
    s = result.state
    expect(totals(s).basis).toBeCloseTo(10000 + purchases, 7)
    vpReceived = s.taxIncome.filter(r => r.kind === 'vp').reduce((n, r) => n + r.gross, 0)
    expect(totals(s).vp).toBeCloseTo(vpReceived, 7)
    expect(totalValue(s)).toBeCloseTo(20000 + external + growth - payments, 7)
  }
  const terminal = valueHypotheticalLiquidation(s, 'cash', 1.02 ** years)
  const income = terminal.state.taxIncome.reduce((n, r) => n + r.gross, 0)
  expect(income).toBeCloseTo(growth, 6)
  expect(totals(terminal.state)).toEqual({ units: 0, basis: 0, vp: 0 })
  expect(terminal.state.transactions.filter(t => t.kind === 'sale').reduce((n, t) => n - t.assessedVP, 0)).toBeCloseTo(vpReceived, 7)
  return { terminal, growth, payments }
}

describe('multi-decade conservation and timing sensitivity', () => {
  it.each([40, 50, 60])('conserves cash, nominal basis and VP for %i years', years => {
    const result = path(years, 0, 0, 'closing')
    // Independent geometric-series reference: initial fund plus end-year purchases.
    const grossFund = 10000 * 1.04 ** years + 200 * ((1.04 ** years - 1) / 0.04)
    const gain = grossFund - 10000 - 200 * years
    expect(result.growth).toBeCloseTo(gain, 6)
    expect(result.terminal.nominal).toBeCloseTo(10000 + grossFund - gain * 0.7 * 0.26375, 6)
  })
  it('measures long-horizon basis-rate, allowance and purchase-timing sensitivity', () => {
    const noVP = path(50, 0, 1000, 'closing')
    const vp = path(50, 0.032, 1000, 'closing')
    const noAllowance = path(50, 0.032, 0, 'closing')
    const january = path(50, 0.032, 1000, 'opening')
    expect(vp.terminal.nominal).toBeGreaterThan(noVP.terminal.nominal)
    expect(vp.terminal.nominal).toBeGreaterThan(noAllowance.terminal.nominal)
    expect(january.growth).toBeGreaterThan(vp.growth)
    expect(january.terminal.nominal).toBeGreaterThan(vp.terminal.nominal)
  })
  it('exposes gain/loss ordering sensitivity with closed-year stranded losses', () => {
    function ordered(first: number, second: number) {
      let s = createInvestmentState(2026, [{ id: 'f', name: 'F', classification: 'bondFund', units: 1, price: 100, acquisitionCost: 100 }, { id: 'cash', name: 'Cash', classification: 'deposit', value: 1000 }])
      for (const [i, price] of [first, second].entries()) {
        s = simulateInvestmentYear(s, { year: 2026 + i, allowance: 0, churchRate: 0, opening: [], closing: [
          { id: `sale:${i}`, kind: 'sale', fundId: 'f', cashId: 'cash', units: 1 },
          { id: `buy:${i}`, kind: 'purchase', fundId: 'f', cashId: 'cash', amount: price },
        ], closingPrices: { f: price }, interestRates: { cash: 0 }, basisRate: 0, taxCashId: 'cash' }).state
      }
      return s
    }
    const gainFirst = ordered(200, 100), lossFirst = ordered(50, 100)
    expect(gainFirst.taxYears.reduce((n, t) => n + t.paid, 0)).toBe(26.375)
    expect(gainFirst.taxYears.at(-1)?.loss).toBe(100)
    expect(lossFirst.taxYears.reduce((n, t) => n + t.paid, 0)).toBe(0)
    expect(lossFirst.taxYears.at(-1)?.loss).toBe(0)
  })
})
