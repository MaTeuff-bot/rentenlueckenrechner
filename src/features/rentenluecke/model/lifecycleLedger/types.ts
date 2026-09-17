import type { ContributionResult } from '../contributions/contributionEngine.js';
import type { InvestmentState, OpeningBucket } from '../investmentTax/index.js';
import type {
  LifecycleConfig,
  LifecycleTrade,
  LifecycleYearInput,
  LifecycleYearReport,
} from '../lifecycleAllocation/index.js';

export type { ContributionResult, InvestmentState, LifecycleConfig, LifecycleTrade, LifecycleYearInput, LifecycleYearReport, OpeningBucket };

export type LedgerInsuranceStatus = 'kvdr' | 'voluntary' | 'unknown';
export type LedgerPhase = 'bridge' | 'pension';

export interface LedgerPensionStream {
  id: string;
  grossMonthly: number;
}

export interface LedgerManualReplacement {
  reason: string;
  kvMonthly: number;
  pvMonthly: number;
}

export interface LedgerInsuranceSpec {
  status: LedgerInsuranceStatus;
  phase: LedgerPhase;
  calendarYear: number;
  cashflowBeforeInsuranceMonthly: number;
  insurerAdditionalRate: number;
  insuredBirthYear: number;
  isParent: boolean;
  childBirthYears: number[];
  statutoryPensions: LedgerPensionStream[];
  occupationalPensions: LedgerPensionStream[];
  rentalAssessmentMonthly: number;
  drvSubsidy?: 'confirmed' | 'not-received';
  expenseAllowanceAnnual?: number;
  manual?: LedgerManualReplacement | null;
  rateOverrides?: {
    kvGeneralRate?: number;
    kvReducedRate?: number;
    pvBaseRate?: number;
  };
}

export interface LedgerYearInput extends LifecycleYearInput {
  insurance: LedgerInsuranceSpec;
}

export type LedgerInsuranceAssumption = 'per-bucket' | 'kvdr-excluded' | 'manual-replacement';

export interface LedgerYearReport extends LifecycleYearReport {
  taxPaidCurrentYear: number;
  arrearsPaidByYear: Record<number, number>;
  remainingLiabilities: Record<number, number>;
  insurancePaidKv: number;
  insurancePaidPv: number;
  insurancePaid: number;
  unfundedInsuranceKv: number;
  unfundedInsurancePv: number;
  assessmentIncomeAnnual: number;
  capitalAssessmentAnnual: number;
  insuranceStatus: 'automatic' | 'manual';
  insuranceEffectiveStatus: 'kvdr' | 'voluntary';
  insuranceConverged: true;
  insuranceAssumption: LedgerInsuranceAssumption;
}

export interface LedgerResult {
  state: InvestmentState;
  reports: LedgerYearReport[];
}

export interface LedgerMarketYear {
  fundPrices: Record<string, number>;
  depositRates: Record<string, number>;
  inflationFactor: number;
}

export interface LedgerBootstrapPath {
  years: LedgerMarketYear[];
}

export type LedgerPathOutcome =
  | { status: 'survived'; closingValue: number }
  | {
      status: 'depleted';
      closingValue: number;
      unfundedWithdrawal: number;
      unfundedInsuranceKv: number;
      unfundedInsurancePv: number;
      remainingLiabilities: Record<number, number>;
    }
  | { status: 'failed'; kind: 'nonconvergence' | 'error'; error: string };

export interface LedgerBootstrapResult {
  reference: LedgerResult;
  paths: LedgerPathOutcome[];
  failureCount: number;
  depletionCount: number;
  summaryBlocked: boolean;
}

export class RequiredCapitalCalculationError extends Error {
  constructor() {
    super('Required capital upper bound could not be found');
    this.name = 'RequiredCapitalCalculationError';
  }
}

export type LedgerSearchResult =
  | { status: 'converged'; requiredCapital: number; boundingIterations: number; binaryIterations: number }
  | { status: 'nonconverged'; reason: string }
  | { status: 'unsupported'; reason: string };

export type TerminalInsuranceAssumption = 'continuing-voluntary-annual-assessment' | 'kvdr-no-new-charge';

export interface TerminalInsuranceResult {
  incrementalKvAnnual: number;
  incrementalPvAnnual: number;
  liquidationAssessableGain: number;
  baseCapitalAssessmentAnnual: number;
  augmentedCapitalAssessmentAnnual: number;
  assumption: TerminalInsuranceAssumption;
  cutoff: 'beforeHoldingCutoff' | 'afterHoldingCutoff';
  ceilingBinding: boolean;
}
