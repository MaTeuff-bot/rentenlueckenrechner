import { describe, expect, it } from 'vitest'
import { applyAnnualPricesAndInterest, beginInvestmentYear } from './annualLedger.js'
import { createInvestmentState } from './holdings.js'
import { reconcileTax } from './taxLedger.js'
import { closeWithPendingVP } from './vorabpauschale.js'
import { checked, checkedFull, cloneInvestmentState, totalValue } from './validation.js'

function depositOnly(value: number) {
  return createInvestmentState(2026, [{ id: 'cash', name: 'Cash', classification: 'deposit', value }])
}

describe('handwritten deep copy of state records', () => {
  it('clone deep-equals structuredClone and isolates mutable state', () => {
    let s = depositOnly(10000)
    s = beginInvestmentYear(s, 2026, 1000, 0)
    s = applyAnnualPricesAndInterest(s, {}, { cash: 0.05 })
    s = reconcileTax(s, 'cash', 'tax:2026')
    const viaCopy = cloneInvestmentState(s)
    const viaNative = structuredClone(s)
    expect(JSON.parse(JSON.stringify(viaCopy))).toEqual(JSON.parse(JSON.stringify(viaNative)))
    expect(viaCopy).not.toBe(s)
    expect(viaCopy.buckets).not.toBe(s.buckets)
    expect(viaCopy.taxYears).not.toBe(s.taxYears)
    expect(viaCopy.taxIncome).not.toBe(s.taxIncome)
    expect(viaCopy.transactions).not.toBe(s.transactions)
    expect(viaCopy.eventIds).not.toBe(s.eventIds)
    for (let i = 0; i < s.taxIncome.length; i++) expect(viaCopy.taxIncome[i]).not.toBe(s.taxIncome[i])
    for (let i = 0; i < s.transactions.length; i++) expect(viaCopy.transactions[i]).not.toBe(s.transactions[i])
    const beforeBuckets = JSON.parse(JSON.stringify(s.buckets))
    const beforeTaxYears = JSON.parse(JSON.stringify(s.taxYears))
    const beforeIncomeLen = s.taxIncome.length
    const beforeTxLen = s.transactions.length
    const deposit = viaCopy.buckets.find((b) => b.id === 'cash')
    if (!deposit || deposit.classification !== 'deposit') throw new Error('missing deposit')
    deposit.value += 123
    viaCopy.taxYears[0]!.paid += 7
    viaCopy.taxIncome.push({ id: 'x', bucketId: 'cash', kind: 'interest', ledgerYear: 2026, receiptYear: 2026, gross: 1, exemptFraction: 0, amount: 1 })
    viaCopy.transactions.push({ id: 'x', year: 2026, kind: 'interest', bucketId: 'cash', cash: 1, basis: 0, assessedVP: 0 })
    expect(s.buckets).toEqual(beforeBuckets)
    expect(s.taxYears).toEqual(beforeTaxYears)
    expect(s.taxIncome).toHaveLength(beforeIncomeLen)
    expect(s.transactions).toHaveLength(beforeTxLen)
  })

  it('append-only audit elements are never mutated in place during market and tax steps', () => {
    let s = depositOnly(10000)
    s = beginInvestmentYear(s, 2026, 1000, 0)
    for (const r of s.taxIncome) Object.freeze(r)
    for (const r of s.contributionIncome) Object.freeze(r)
    for (const t of s.transactions) Object.freeze(t)
    s = applyAnnualPricesAndInterest(s, {}, { cash: -0.05 })
    expect(totalValue(s)).toBeCloseTo(9500, 9)
    expect(s.taxIncome.filter((r) => r.ledgerYear === 2026)).toHaveLength(0)
    s = reconcileTax(s, 'cash', 'tax2:2026')
    expect(s.taxYears.at(-1)?.liability ?? NaN).toBeGreaterThanOrEqual(0)
    expect(checked(s)).toBe(s)
    expect(checkedFull(JSON.parse(JSON.stringify(s)))).toBeDefined()
  })

  it('incremental checked agrees with full validation on valid and invalid states', () => {
    let s = depositOnly(10000)
    s = beginInvestmentYear(s, 2026, 1000, 0)
    s = applyAnnualPricesAndInterest(s, {}, { cash: 0.02 })
    expect(() => checked(s)).not.toThrow()
    expect(() => checkedFull(structuredClone(s))).not.toThrow()
    const badFinite = cloneInvestmentState(s)
    badFinite.taxIncome.push({ id: 'bad', bucketId: 'cash', kind: 'interest', ledgerYear: 2026, receiptYear: 2026, gross: NaN, exemptFraction: 0, amount: NaN })
    expect(() => checked(badFinite)).toThrow()
    expect(() => checkedFull(badFinite)).toThrow()
    const badDeposit = cloneInvestmentState(s)
    const dep = badDeposit.buckets.find((b) => b.id === 'cash')
    if (!dep || dep.classification !== 'deposit') throw new Error('missing deposit')
    dep.value = -5
    expect(() => checked(badDeposit)).toThrow()
    expect(() => checkedFull(badDeposit)).toThrow()
  })

  it('one more ledger year on shared vs native clones stays financially identical', () => {
    let s = depositOnly(20000)
    s = beginInvestmentYear(s, 2026, 1000, 0)
    s = applyAnnualPricesAndInterest(s, {}, { cash: 0.03 })
    s = reconcileTax(s, 'cash', 'tax:2026')
    s = closeWithPendingVP(s, {}, 0.025)
    const a = cloneInvestmentState(s)
    const b = structuredClone(s)
    const step = (base: typeof s, id: string) => {
      let n = beginInvestmentYear(base, 2027, 1000, 0)
      n = applyAnnualPricesAndInterest(n, {}, { cash: -0.02 })
      n = reconcileTax(n, 'cash', id)
      return n
    }
    const nextA = step(a, 'taxA:2027')
    const nextB = step(b, 'taxB:2027')
    expect(totalValue(nextA)).toBeCloseTo(totalValue(nextB), 9)
    expect(nextA.taxIncome.filter((r) => r.ledgerYear === 2027)).toHaveLength(0)
    expect(nextB.taxIncome.filter((r) => r.ledgerYear === 2027)).toHaveLength(0)
  })

  it('in-place mutation of already-validated prefix is rejected', () => {
    const s = applyAnnualPricesAndInterest(beginInvestmentYear(depositOnly(10000), 2026, 1000, 0), {}, { cash: 0.02 })
    expect(s.taxIncome.length).toBeGreaterThan(0)
    expect(() => checked(s)).not.toThrow()
    s.taxIncome[0]!.gross = NaN
    s.taxIncome[0]!.amount = NaN
    expect(() => checked(s)).toThrow()
    expect(() => checkedFull(s)).toThrow()
  })

  it('same-length replacement of audit record is rejected', () => {
    const s = applyAnnualPricesAndInterest(beginInvestmentYear(depositOnly(10000), 2026, 1000, 0), {}, { cash: 0.02 })
    expect(s.transactions.length).toBeGreaterThan(0)
    expect(() => checked(s)).not.toThrow()
    s.transactions[0] = { id: 'x', year: 2026, kind: 'interest', bucketId: 'cash', cash: NaN, basis: 0, assessedVP: 0 }
    expect(() => checked(s)).toThrow()
    expect(() => checkedFull(s)).toThrow()
  })

  it('truncate plus refill to same length is rejected', () => {
    const s = applyAnnualPricesAndInterest(beginInvestmentYear(depositOnly(10000), 2026, 1000, 0), {}, { cash: 0.02 })
    expect(s.taxIncome.length).toBeGreaterThan(0)
    expect(() => checked(s)).not.toThrow()
    s.taxIncome.pop()
    s.taxIncome.push({ id: 'bad', bucketId: 'cash', kind: 'interest', ledgerYear: 2026, receiptYear: 2026, gross: NaN, exemptFraction: 0, amount: NaN })
    expect(() => checked(s)).toThrow()
    expect(() => checkedFull(s)).toThrow()
  })

  it('clone isolates nested audit records with deep-copy parity', () => {
    let s = depositOnly(10000)
    s = beginInvestmentYear(s, 2026, 1000, 0)
    s = applyAnnualPricesAndInterest(s, {}, { cash: 0.05 })
    s = reconcileTax(s, 'cash', 'tax:2026')
    expect(s.taxIncome.length).toBeGreaterThan(0)
    const next = cloneInvestmentState(s)
    for (let i = 0; i < s.taxIncome.length; i++) expect(next.taxIncome[i]).not.toBe(s.taxIncome[i])
    for (let i = 0; i < s.contributionIncome.length; i++) expect(next.contributionIncome[i]).not.toBe(s.contributionIncome[i])
    for (let i = 0; i < s.transactions.length; i++) expect(next.transactions[i]).not.toBe(s.transactions[i])
    for (let i = 0; i < s.taxYears.length; i++) expect(next.taxYears[i]).not.toBe(s.taxYears[i])
    expect(JSON.parse(JSON.stringify(next))).toEqual(JSON.parse(JSON.stringify(structuredClone(s))))
    const before = JSON.parse(JSON.stringify(s.taxIncome))
    next.taxIncome[0]!.gross = 999999
    next.taxIncome[0]!.amount = 999999
    expect(s.taxIncome).toEqual(before)
    expect(() => checked(next)).not.toThrow()
    expect(() => checked(s)).not.toThrow()
  })
})
