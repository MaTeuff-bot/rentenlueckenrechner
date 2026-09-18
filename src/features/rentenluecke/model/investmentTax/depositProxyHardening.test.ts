import { describe, expect, it } from 'vitest'
import { applyAnnualPricesAndInterest, beginInvestmentYear, simulateInvestmentYear } from './annualLedger'
import { applyTransaction, createInvestmentState } from './holdings'
import { reconcileTax } from './taxLedger'
import { closeWithPendingVP } from './vorabpauschale'
import { totalValue } from './validation'

function depositOnly(value: number) {
  return createInvestmentState(2026, [{ id: 'cash', name: 'Cash', classification: 'deposit', value }])
}

describe('deposit proxy signed movement (Defect A)', () => {
  it('negative proxy reduces balance once with no deductible loss', () => {
    let s = beginInvestmentYear(depositOnly(10000), 2026, 1000, 0)
    s = applyAnnualPricesAndInterest(s, {}, { cash: -0.05 })
    expect(totalValue(s)).toBeCloseTo(9500, 9)
    expect(s.taxIncome.filter((r) => r.ledgerYear === 2026)).toHaveLength(0)
    expect(s.contributionIncome.filter((r) => r.ledgerYear === 2026)).toHaveLength(0)
    const interestCash = s.transactions.filter((t) => t.kind === 'interest').reduce((n, t) => n + t.cash, 0)
    expect(interestCash).toBeCloseTo(0, 9)
  })

  it('mixed signed years conserve principal and keep interest positive-only', () => {
    let s = depositOnly(10000)
    const rates = [0.1, -0.05, 0.02, -0.02]
    let expected = 10000
    let positiveSum = 0
    for (let i = 0; i < rates.length; i++) {
      const year = 2026 + i
      s = beginInvestmentYear(s, year, 1000, 0)
      const before = totalValue(s)
      const r = rates[i]!
      s = applyAnnualPricesAndInterest(s, {}, { cash: r })
      expected = expected * (1 + r)
      positiveSum += before * Math.max(0, r)
      expect(totalValue(s)).toBeCloseTo(expected, 6)
      s = reconcileTax(s, 'cash', `tax:${year}`)
      s = closeWithPendingVP(s, {}, 0.025)
    }
    const interestTotal = s.taxIncome.reduce((n, r) => n + r.amount, 0)
    expect(interestTotal).toBeCloseTo(positiveSum, 4)
    expect(interestTotal).toBeGreaterThanOrEqual(0)
  })

  it('simulateInvestmentYear keeps interest positive-only for negative proxy', () => {
    const res = simulateInvestmentYear(depositOnly(10000), {
      year: 2026, allowance: 1000, churchRate: 0, opening: [], closing: [],
      closingPrices: {}, interestRates: { cash: -0.05 }, basisRate: 0.025, taxCashId: 'cash',
    })
    expect(res.interest).toBeCloseTo(0, 9)
    expect(res.closingValue).toBeCloseTo(9500, 6)
    expect(res.state.taxIncome.filter((r) => r.ledgerYear === 2026)).toHaveLength(0)
  })

  it('exact -100% zeroes balance without loss, malformed <-100% fails explicitly', () => {
    let s = beginInvestmentYear(depositOnly(10000), 2026, 1000, 0)
    s = applyAnnualPricesAndInterest(s, {}, { cash: -1 })
    expect(totalValue(s)).toBeCloseTo(0, 9)
    expect(s.taxIncome.filter((r) => r.ledgerYear === 2026)).toHaveLength(0)
    expect(() => applyAnnualPricesAndInterest(beginInvestmentYear(depositOnly(10000), 2026, 1000, 0), {}, { cash: -1.01 })).toThrow()
    expect(() => applyAnnualPricesAndInterest(beginInvestmentYear(depositOnly(10000), 2026, 1000, 0), {}, { cash: NaN })).toThrow()
    expect(() => applyAnnualPricesAndInterest(beginInvestmentYear(depositOnly(10000), 2026, 1000, 0), {}, { cash: Infinity })).toThrow()
  })

  it('valid fund losses remain assessable (no global positivity)', () => {
    let s = createInvestmentState(2026, [
      { id: 'f', name: 'Fund', classification: 'equityFund', units: 100, price: 100, acquisitionCost: 12000 },
      { id: 'cash', name: 'Cash', classification: 'deposit', value: 5000 },
    ])
    s = beginInvestmentYear(s, 2026, 1000, 0)
    s = applyAnnualPricesAndInterest(s, { f: 100 }, { cash: 0 })
    s = applyTransaction(s, { id: 'sell-loss', kind: 'sale', fundId: 'f', cashId: 'cash', units: 100 })
    const sale = s.taxIncome.find((r) => r.kind === 'sale')
    expect(sale).toBeDefined()
    expect(sale!.gross).toBeLessThan(0)
  })
})
