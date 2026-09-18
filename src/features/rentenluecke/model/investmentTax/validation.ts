import type { Bucket, DepositBucket, FundBucket, IncomeRecord, InvestmentState, PendingVP, TaxYear, TransactionRecord } from './types'

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
  if (bucket.classification === 'deposit') return bucket.value;
  let units = 0;
  for (const c of bucket.cohorts) units = finite(units + c.units);
  return finite(units * bucket.price);
}
export function totalValue(state: InvestmentState): number {
  let total = 0;
  for (const bucket of state.buckets) total = finite(total + bucketValue(bucket));
  return total;
}
export function cloneInvestmentState(state: InvestmentState): InvestmentState {
  const bucketCount = state.buckets.length;
  const clonedBuckets = new Array(bucketCount);
  for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex++) {
    const bucket = state.buckets[bucketIndex];
    if (bucket === undefined) continue;
    if (bucket.classification === 'deposit') {
      clonedBuckets[bucketIndex] = { ...bucket };
    } else {
      const cohortCount = bucket.cohorts.length;
      const clonedCohorts = new Array(cohortCount);
      for (let cohortIndex = 0; cohortIndex < cohortCount; cohortIndex++) {
        clonedCohorts[cohortIndex] = { ...bucket.cohorts[cohortIndex] };
      }
      clonedBuckets[bucketIndex] = { ...bucket, cohorts: clonedCohorts };
    }
  }
  const taxYearCount = state.taxYears.length;
  const clonedTaxYears = new Array(taxYearCount);
  for (let taxYearIndex = 0; taxYearIndex < taxYearCount; taxYearIndex++) {
    clonedTaxYears[taxYearIndex] = { ...state.taxYears[taxYearIndex] };
  }
  const pendingCount = state.pending.length;
  const clonedPending = new Array(pendingCount);
  for (let pendingIndex = 0; pendingIndex < pendingCount; pendingIndex++) {
    const pendingEntry = state.pending[pendingIndex];
    if (pendingEntry === undefined) continue;
    clonedPending[pendingIndex] = { ...pendingEntry, amounts: [...pendingEntry.amounts] };
  }
  const taxIncomeCount = state.taxIncome.length;
  const clonedTaxIncome = new Array(taxIncomeCount);
  for (let incomeIndex = 0; incomeIndex < taxIncomeCount; incomeIndex++) {
    clonedTaxIncome[incomeIndex] = { ...state.taxIncome[incomeIndex] };
  }
  const contributionCount = state.contributionIncome.length;
  const clonedContributionIncome = new Array(contributionCount);
  for (let contributionIndex = 0; contributionIndex < contributionCount; contributionIndex++) {
    clonedContributionIncome[contributionIndex] = { ...state.contributionIncome[contributionIndex] };
  }
  const transactionCount = state.transactions.length;
  const clonedTransactions = new Array(transactionCount);
  for (let transactionIndex = 0; transactionIndex < transactionCount; transactionIndex++) {
    clonedTransactions[transactionIndex] = { ...state.transactions[transactionIndex] };
  }
  return {
    ...state,
    buckets: clonedBuckets,
    taxYears: clonedTaxYears,
    pending: clonedPending,
    taxIncome: clonedTaxIncome,
    contributionIncome: clonedContributionIncome,
    transactions: clonedTransactions,
    eventIds: [...state.eventIds],
  };
}
export function checkedFull(state: InvestmentState): InvestmentState {
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
// All transitions validate their output as well as their inputs. No partial mutation escapes.
// Structured fast path with the same coverage as checkedFull() for the known
// InvestmentState shape: every numeric field swept by the generic recursive numbers()
// walk is checked explicitly field-by-field (buckets/cohorts/taxYears/pending/
// taxIncome/contributionIncome/transactions/eventIds numbers via finite(), plus
// totalValue() and bucket-level nonnegative() checks). No reflection walk, so the
// per-transition cost stays linear in history length with a much smaller constant.
// checkedFull() keeps the recursive walk for tests; parity is covered by
// structuralSharing.test.ts ("incremental checked agrees with full validation...").
// Audit history stays deep-copied element-wise by cloneInvestmentState(), never shared,
// so earlier snapshots stay stable.
export function checkBucketRecord(bucket: Bucket): void {
  if (bucket.classification === 'deposit') {
    nonnegative(bucket.value, 'amount')
  } else if (bucket.classification === 'equityFund' || bucket.classification === 'bondFund') {
    nonnegative(bucket.price, 'amount')
    for (const cohort of bucket.cohorts) {
      nonnegative(cohort.units, 'amount')
      nonnegative(cohort.basis, 'amount')
      nonnegative(cohort.assessedVP, 'amount')
      finite(cohort.acquiredYear, 'amount')
      finite(cohort.acquiredMonth, 'amount')
    }
  } else {
    throw new Error('Invalid classification')
  }
}
export function checkTaxYearRecord(taxYear: TaxYear): void {
  finite(taxYear.year, 'amount')
  finite(taxYear.openingLoss, 'amount')
  finite(taxYear.allowance, 'amount')
  finite(taxYear.churchRate, 'amount')
  finite(taxYear.income, 'amount')
  finite(taxYear.loss, 'amount')
  finite(taxYear.allowanceUsed, 'amount')
  finite(taxYear.liability, 'amount')
  finite(taxYear.paid, 'amount')
}
export function checkPendingRecord(pendingEntry: PendingVP): void {
  finite(pendingEntry.holdingYear, 'amount')
  finite(pendingEntry.receiptYear, 'amount')
  for (const pendingAmount of pendingEntry.amounts) finite(pendingAmount, 'amount')
}
export function checkIncomeRecord(incomeRecord: IncomeRecord): void {
  finite(incomeRecord.ledgerYear, 'amount')
  finite(incomeRecord.receiptYear, 'amount')
  finite(incomeRecord.gross, 'amount')
  finite(incomeRecord.exemptFraction, 'amount')
  finite(incomeRecord.amount, 'amount')
}
export function checkTransactionRecord(transactionRecord: TransactionRecord): void {
  finite(transactionRecord.year, 'amount')
  finite(transactionRecord.cash, 'amount')
  finite(transactionRecord.basis, 'amount')
  finite(transactionRecord.assessedVP, 'amount')
}
export function checked(state: InvestmentState): InvestmentState {
  finite(state.year, 'year')
  for (const bucket of state.buckets) checkBucketRecord(bucket)
  for (const taxYear of state.taxYears) checkTaxYearRecord(taxYear)
  for (const pendingEntry of state.pending) checkPendingRecord(pendingEntry)
  for (const incomeRecord of state.taxIncome) checkIncomeRecord(incomeRecord)
  for (const contributionRecord of state.contributionIncome) checkIncomeRecord(contributionRecord)
  for (const transactionRecord of state.transactions) checkTransactionRecord(transactionRecord)
  for (const eventId of state.eventIds) {
    if (typeof eventId !== 'string') throw new Error('Invalid eventId')
  }
  totalValue(state)
  return state
}
export function transition(state: InvestmentState, id: string, phases: InvestmentState['phase'][]): InvestmentState {
  identifier(id)
  if (!phases.includes(state.phase)) throw new Error('Invalid event order')
  if (state.eventIds.includes(id)) throw new Error(`Duplicate event ${id}`)
  const next = cloneInvestmentState(state)
  next.eventIds.push(id)
  return next
}
export function completeKeys(values: Record<string, number>, ids: string[]): void {
  if (Object.keys(values).length !== ids.length || ids.some(id => !Object.hasOwn(values, id))) throw new Error('Incomplete annual inputs')
  Object.values(values).forEach(v => nonnegative(v))
}
export function completeDepositRates(values: Record<string, number>, ids: string[]): void {
  if (Object.keys(values).length !== ids.length || ids.some(id => !Object.hasOwn(values, id))) throw new Error('Incomplete annual inputs')
  for (const v of Object.values(values)) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < -1) throw new Error('Invalid deposit rate')
  }
}
