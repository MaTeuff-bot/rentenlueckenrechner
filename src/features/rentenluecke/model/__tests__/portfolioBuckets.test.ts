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
  { id: 'stocks', name: 'Aktien-ETF', value: 70_000, role: 'equity' },
  { id: 'bonds', name: 'Anleihen', value: 20_000, role: 'bond' },
  { id: 'cash', name: 'Tagesgeld', value: 10_000, role: 'cash' },
]

describe('portfolio buckets', () => {
  it('calculates the total and the legacy 70/20/10 allocation', () => {
    expect(calculatePortfolioBucketTotal(buckets)).toBe(100_000)
    expect(calculateAllocationFromBuckets(buckets)).toEqual({ equity: 0.7, bonds: 0.2, fixed: 0.1 })
  })

  it('combines multiple buckets with the same role', () => {
    expect(calculateAllocationFromBuckets([
      { id: 'world', name: 'World', value: 40, role: 'equity' },
      { id: 'small-cap', name: 'Small Cap', value: 30, role: 'equity' },
      { id: 'bonds', name: 'Anleihen', value: 30, role: 'bond' },
    ])).toEqual({ equity: 0.7, bonds: 0.3, fixed: 0 })
  })

  it('ignores zero-value buckets and returns zero allocation for zero total', () => {
    const withZero = [...buckets, { id: 'empty', name: '', value: 0, role: 'equity' as const }]
    expect(calculateAllocationFromBuckets(withZero)).toEqual({ equity: 0.7, bonds: 0.2, fixed: 0.1 })
    expect(calculateAllocationFromBuckets(withZero.map((bucket) => ({ ...bucket, value: 0 })))).toEqual({
      equity: 0, bonds: 0, fixed: 0,
    })
  })

  it('validates values, roles, and positive total while allowing blank names', () => {
    expect(validatePortfolioBuckets([{ id: 'cash', name: '', value: 1, role: 'cash' }])).toBeNull()
    expect(validatePortfolioBuckets([{ id: 'cash', name: '', value: Number.NaN, role: 'cash' }])).toBeTruthy()
    expect(validatePortfolioBuckets([{ id: 'cash', name: '', value: -1, role: 'cash' }])).toBeTruthy()
    expect(validatePortfolioBuckets([{ id: 'cash', name: '', value: 1, role: 'other' as never }])).toBeTruthy()
    expect(validatePortfolioBuckets([])).toBeTruthy()
    expect(validatePortfolioBuckets([{ id: 'cash', name: '', value: 0, role: 'cash' }])).toBeTruthy()
  })

  it('creates one component per positive bucket with fallback labels and role source ids', () => {
    expect(createPortfolioComponentsFromBuckets([
      { id: 'world', name: ' World ETF ', value: 60, role: 'equity' },
      { id: 'small-cap', name: 'Small Cap', value: 10, role: 'equity' },
      { id: 'bonds', name: '   ', value: 20, role: 'bond' },
      { id: 'cash', name: 'Reserve', value: 10, role: 'cash' },
      { id: 'empty', name: 'Leer', value: 0, role: 'cash' },
    ], { equity: 'equity-source', bond: 'bond-source', cash: 'cash-source' })).toEqual([
      { id: 'world', label: 'World ETF', role: 'equity', weight: 0.6, returnSeriesId: 'equity-source' },
      { id: 'small-cap', label: 'Small Cap', role: 'equity', weight: 0.1, returnSeriesId: 'equity-source' },
      { id: 'bonds', label: 'Anleihen', role: 'bond', weight: 0.2, returnSeriesId: 'bond-source' },
      { id: 'cash', label: 'Reserve', role: 'cash', weight: 0.1, returnSeriesId: 'cash-source' },
    ])
  })

  it('returns no components for a non-positive total', () => {
    expect(createPortfolioComponentsFromBuckets([], {})).toEqual([])
  })

  it('creates stable default buckets and omits zero allocations', () => {
    expect(createDefaultPortfolioBuckets(100_000, { equity: 0.7, bonds: 0.3, fixed: 0 })).toEqual([
      { id: 'equity', name: 'Aktien', value: 70_000, role: 'equity' },
      { id: 'bonds', name: 'Anleihen', value: 30_000, role: 'bond' },
    ])
  })
})
