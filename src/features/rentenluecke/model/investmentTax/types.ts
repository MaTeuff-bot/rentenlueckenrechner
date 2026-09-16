export type FundClassification = 'equityFund' | 'bondFund'
export interface Cohort {
  units: number
  basis: number
  assessedVP: number
  acquiredYear: number
  acquiredMonth: number
}
export interface FundBucket {
  id: string
  name: string
  classification: FundClassification
  price: number
  cohorts: Cohort[]
}
export interface DepositBucket { id: string; name: string; classification: 'deposit'; value: number }
export type Bucket = FundBucket | DepositBucket
export type OpeningBucket = DepositBucket | {
  id: string; name: string; classification: FundClassification
  units: number; price: number; acquisitionCost: number
}
export interface IncomeRecord {
  id: string
  bucketId: string
  kind: 'sale' | 'interest' | 'vp'
  ledgerYear: number
  receiptYear: number
  gross: number
  exemptFraction: number
  amount: number
}
export interface PendingVP {
  id: string; bucketId: string; holdingYear: number; receiptYear: number
  amounts: number[]
}
export interface TransactionRecord {
  id: string; year: number; kind: string; bucketId: string
  cash: number; basis: number; assessedVP: number
}
export interface TaxYear {
  year: number; openingLoss: number; allowance: number; churchRate: 0 | 0.08 | 0.09
  income: number; loss: number; allowanceUsed: number; liability: number; paid: number
}
export interface InvestmentState {
  year: number
  phase: 'closed' | 'opening' | 'closing' | 'terminated'
  buckets: Bucket[]
  pending: PendingVP[]
  taxIncome: IncomeRecord[]
  contributionIncome: IncomeRecord[]
  transactions: TransactionRecord[]
  taxYears: TaxYear[]
  eventIds: string[]
}
export type Transaction =
  | { id: string; kind: 'purchase'; fundId: string; cashId: string; amount: number }
  | { id: string; kind: 'sale'; fundId: string; cashId: string; units: number }
  | { id: string; kind: 'transfer'; fromId: string; toId: string; amount: number }
  | { id: string; kind: 'external'; cashId: string; amount: number }
export interface AnnualInput {
  year: number; allowance: number; churchRate: 0 | 0.08 | 0.09
  opening: Transaction[]; closing: Transaction[]
  closingPrices: Record<string, number>
  interestRates: Record<string, number>
  basisRate: number; taxCashId: string
}
export interface AnnualResult {
  openingValue: number; closingValue: number
  externalCash: number; priceIncome: number; interest: number; taxCash: number
  state: InvestmentState
}
