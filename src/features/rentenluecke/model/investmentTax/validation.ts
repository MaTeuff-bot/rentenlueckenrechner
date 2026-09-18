import type { Bucket, DepositBucket, FundBucket, InvestmentState } from './types'

export function finite(value: number, label = 'amount'): number {
  if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) throw new Error(`Invalid ${label}`)
  return value
}
export function nonnegative(value: number, label = 'amount'): number {
  finite(value, label)
  if (value < 0) throw new Error(`Negative ${label}`)
  return value
}
export function integer(value: number, label: string): number {
  finite(value, label)
  if (!Number.isInteger(value)) throw new Error(`Invalid ${label}`)
  return value
}
export function identifier(id: string): void {
  if (typeof id !== 'string' || !id.trim()) throw new Error('Empty identifier')
}
export function fund(state: InvestmentState, id: string): FundBucket {
  const bucket = state.buckets.find(b => b.id === id)
  if (!bucket || bucket.classification === 'deposit') throw new Error(`Unknown fund ${id}`)
  return bucket
}
export function deposit(state: InvestmentState, id: string): DepositBucket {
  const bucket = state.buckets.find(b => b.id === id)
  if (!bucket || bucket.classification !== 'deposit') throw new Error(`Unknown deposit ${id}`)
  return bucket
}
export function bucketValue(bucket: Bucket): number {
  return bucket.classification === 'deposit' ? bucket.value : finite(bucket.cohorts.reduce((n, c) => finite(n + c.units), 0) * bucket.price)
}
export function totalValue(state: InvestmentState): number {
  return state.buckets.reduce((n, b) => finite(n + bucketValue(b)), 0)
}
// All transitions validate their output as well as their inputs. No partial mutation escapes.
export function checked(state: InvestmentState): InvestmentState {
  function numbers(value: unknown): void {
    if (typeof value === 'number') finite(value)
    else if (Array.isArray(value)) value.forEach(numbers)
    else if (value && typeof value === 'object') Object.values(value).forEach(numbers)
  }
  numbers(state)
  totalValue(state)
  for (const b of state.buckets) {
    if (b.classification === 'deposit') nonnegative(b.value)
    else {
      nonnegative(b.price)
      b.cohorts.forEach(c => { nonnegative(c.units); nonnegative(c.basis); nonnegative(c.assessedVP) })
    }
  }
  return state
}
export function transition(state: InvestmentState, id: string, phases: InvestmentState['phase'][]): InvestmentState {
  checked(state)
  identifier(id)
  if (!phases.includes(state.phase)) throw new Error('Invalid event order')
  if (state.eventIds.includes(id)) throw new Error(`Duplicate event ${id}`)
  const next = structuredClone(state)
  next.eventIds.push(id)
  return next
}
export function completeKeys(values: Record<string, number>, ids: string[]): void {
  if (Object.keys(values).length !== ids.length || ids.some(id => !Object.hasOwn(values, id))) throw new Error('Incomplete annual inputs')
  Object.values(values).forEach(v => nonnegative(v))
}
