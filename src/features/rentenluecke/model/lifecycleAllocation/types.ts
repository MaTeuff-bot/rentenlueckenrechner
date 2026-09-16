import type { InvestmentState } from '../investmentTax/index.js';

export type LifecycleBucketKind = 'equityFund' | 'bondFund' | 'deposit';

export interface LifecycleBucketDef {
  id: string;
  name: string;
  kind: LifecycleBucketKind;
  priority: number;
}

export type BucketTarget =
  | { role: 'fixedReserve'; amountToday: number }
  | { role: 'percent'; share: number };

export interface Milestone {
  name: string;
  startAge: number;
  targets: Record<string, BucketTarget>;
}

export interface AllocationTransition {
  fromMilestone: string;
  toMilestone: string;
  startAge: number;
  durationYears: number;
}

export interface LifecycleConfig {
  buckets: LifecycleBucketDef[];
  milestones: Milestone[];
  transitions: AllocationTransition[];
  taxCashId: string;
}

export interface LifecycleYearInput {
  age: number;
  year: number;
  contribution: number;
  withdrawalNeed: number;
  allowance: number;
  churchRate: 0 | 0.08 | 0.09;
  fundPrices: Record<string, number>;
  depositRates: Record<string, number>;
  basisRate: number;
  /**
   * Cumulative purchasing-power factor F for this year: nominal reserve target =
   * `amountToday * F`, terminal `real = nominal / F_last`. `F` is finite `> 0` with
   * `F = 1` meaning today's purchasing power. Compounding `F_n = Prod(1 + infl)`;
   * deflation (`F < 1`) and non-monotonic paths are allowed. Annual-vs-cumulative
   * confusion is a bug: always pass the cumulative factor, never the annual rate.
   */
  inflationFactor: number;
}

export interface LifecycleTrade {
  bucketId: string;
  kind: 'buy' | 'sell';
  euros: number;
  units: number;
}

export interface LifecycleYearReport {
  age: number;
  year: number;
  openingValue: number;
  closingValue: number;
  contribution: number;
  withdrawal: number;
  taxPaid: number;
  unpaidTax: number;
  anchorNominal: number;
  iterations: number;
  solverExhausted: boolean;
  trades: LifecycleTrade[];
  targetsNominal: Record<string, number>;
  valuesNominal: Record<string, number>;
  shortfall: number;
  unfundedWithdrawal: number;
}

export interface LifecycleResult {
  state: InvestmentState;
  reports: LifecycleYearReport[];
}
