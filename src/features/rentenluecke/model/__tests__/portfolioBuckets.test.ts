import { describe, expect, it } from 'vitest'
import {
  calculateAllocationFromBuckets,
  calculatePortfolioBucketTotal,
  createDefaultPortfolioBuckets,
  createPortfolioComponentsFromBuckets,
  validatePortfolioBuckets,
  type PortfolioBucket,
} from '../portfolioBuckets'

const buckets: PortfolioBucket[] = [
  { id: 'stocks', name: 'Aktien-ETF', value: 70_000, role: 'equity', returnSeriesId: 'synthetic-equity-assumption-v1' },
  { id: 'bonds', name: 'Anleihen', value: 20_000, role: 'bond', returnSeriesId: 'synthetic-bonds-assumption-v1' },
  { id: 'cash', name: 'Tagesgeld', value: 10_000, role: 'cash', returnSeriesId: 'synthetic-cash-assumption-v1' },
]

describe('portfolio buckets', () => {
  it('calculates the total and the legacy 70/20/10 allocation', () => {
    expect(calculatePortfolioBucketTotal(buckets)).toBe(100_000)
    expect(calculateAllocationFromBuckets(buckets)).toEqual({ equity: 0.7, bonds: 0.2, fixed: 0.1 })
  })

  it('combines multiple buckets with the same role', () => {
    expect(calculateAllocationFromBuckets([
      { ...buckets[0], id: 'world', name: 'World', value: 40 },
      { ...buckets[0], id: 'small-cap', name: 'Small Cap', value: 30 },
      { ...buckets[1], value: 30 },
    ])).toEqual({ equity: 0.7, bonds: 0.3, fixed: 0 })
  })

  it('ignores zero-value buckets and returns zero allocation for zero total', () => {
    const withZero = [...buckets, { ...buckets[0], id: 'empty', name: '', value: 0 }]
    expect(calculateAllocationFromBuckets(withZero)).toEqual({ equity: 0.7, bonds: 0.2, fixed: 0.1 })
    expect(calculateAllocationFromBuckets(withZero.map((bucket) => ({ ...bucket, value: 0 })))).toEqual({
      equity: 0, bonds: 0, fixed: 0,
    })
  })

  it('validates values, roles, and positive total while allowing blank names', () => {
    expect(validatePortfolioBuckets([{ ...buckets[2], name: '', value: 1 }])).toBeNull()
    expect(validatePortfolioBuckets([{ ...buckets[2], name: '', value: Number.NaN }])).toBeTruthy()
    expect(validatePortfolioBuckets([{ ...buckets[2], name: '', value: -1 }])).toBeTruthy()
    expect(validatePortfolioBuckets([{ ...buckets[2], name: '', value: 1, role: 'other' as never }])).toBeTruthy()
    expect(validatePortfolioBuckets([])).toBeTruthy()
    expect(validatePortfolioBuckets([{ ...buckets[2], name: '', value: 0 }])).toBeTruthy()
  })

  it('creates one component per positive bucket with fallback labels and role source ids', () => {
    expect(createPortfolioComponentsFromBuckets([
      { ...buckets[0], id: 'world', name: ' World ETF ', value: 60 },
      { ...buckets[0], id: 'small-cap', name: 'Small Cap', value: 10 },
      { ...buckets[1], name: '   ', value: 20 },
      { ...buckets[2], name: 'Reserve', value: 10 },
      { ...buckets[2], id: 'empty', name: 'Leer', value: 0 },
    ])).toEqual([
      { id: 'world', label: 'World ETF', role: 'equity', weight: 0.6, returnSeriesId: 'synthetic-equity-assumption-v1' },
      { id: 'small-cap', label: 'Small Cap', role: 'equity', weight: 0.1, returnSeriesId: 'synthetic-equity-assumption-v1' },
      { id: 'bonds', label: 'Anleihen', role: 'bond', weight: 0.2, returnSeriesId: 'synthetic-bonds-assumption-v1' },
      { id: 'cash', label: 'Reserve', role: 'cash', weight: 0.1, returnSeriesId: 'synthetic-cash-assumption-v1' },
    ])
  })

  it('returns no components for a non-positive total', () => {
    expect(createPortfolioComponentsFromBuckets([])).toEqual([])
  })

  it('creates stable default buckets and omits zero allocations', () => {
    expect(createDefaultPortfolioBuckets(100_000, { equity: 0.7, bonds: 0.3, fixed: 0 })).toEqual([
      { id: 'equity', name: 'Aktien', value: 70_000, role: 'equity', returnSeriesId: 'jst-r6-developed-equal-weight-equity-real-post1950' },
      { id: 'bonds', name: 'Anleihen', value: 30_000, role: 'bond', returnSeriesId: 'jst-r6-developed-equal-weight-bonds-real-post1950' },
    ])
  })
})
