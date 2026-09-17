import { calculateContributions } from '../contributions/contributionEngine.js';
import type { ContributionResult } from '../contributions/contributionEngine.js';
import { indexedContributionThresholds } from '../contributions/rules2026.js';
import type { InvestmentState } from '../investmentTax/index.js';
import type { LedgerInsuranceAssumption, LedgerInsuranceSpec } from './types.js';

export const EXPENSE_ALLOWANCE_BASE_EUR = 51;

export function expenseAllowanceForYear(inflationFactor: number, overrideAnnual?: number): number {
  if (!Number.isFinite(inflationFactor) || inflationFactor <= 0) throw new Error('Invalid cumulative inflation factor');
  if (overrideAnnual !== undefined) {
    if (!Number.isFinite(overrideAnnual) || overrideAnnual < 0) throw new Error('Invalid expense allowance override');
    return overrideAnnual;
  }
  return EXPENSE_ALLOWANCE_BASE_EUR * inflationFactor;
}

export function sumAssessmentIncomeAnnual(state: InvestmentState, ledgerYear: number): number {
  return state.contributionIncome
    .filter((r) => r.ledgerYear === ledgerYear)
    .reduce((n, r) => n + r.amount, 0);
}

export function mapCapitalAssessmentAnnual(
  state: InvestmentState,
  ledgerYear: number,
  inflationFactor: number,
  expenseAnnual?: number,
): number {
  const signed = sumAssessmentIncomeAnnual(state, ledgerYear);
  const expense = expenseAllowanceForYear(inflationFactor, expenseAnnual);
  return Math.max(0, signed - expense);
}

export type CompleteInsuranceResult = Extract<ContributionResult, { status: 'automatic' | 'manual' }>;

export interface InsuranceBurdenSuccess {
  converged: true;
  result: CompleteInsuranceResult;
  capitalAssessmentAnnual: number;
  assessmentIncomeAnnual: number;
  assumption: LedgerInsuranceAssumption;
}

export interface InsuranceBurdenFailure {
  converged: false;
  kind: ContributionResult['status'];
  residual: number;
  diagnostics: string[];
}

export type InsuranceBurden = InsuranceBurdenSuccess | InsuranceBurdenFailure;

export function buildContributionInput(
  spec: LedgerInsuranceSpec,
  capitalAssessmentAnnual: number,
  inflationFactor: number,
): unknown {
  const thresholds = indexedContributionThresholds(inflationFactor);
  const common = {
    personId: 'ledger-person',
    phaseId: spec.phase,
    calendarYear: spec.calendarYear,
    phase: spec.phase,
    cashflowBeforeInsuranceMonthly: spec.cashflowBeforeInsuranceMonthly,
  };
  if (spec.manual) {
    return {
      ...common,
      mode: 'manual',
      reason: spec.manual.reason,
      kvMonthly: spec.manual.kvMonthly,
      pvMonthly: spec.manual.pvMonthly,
    };
  }
  const manualCapitalToday = spec.manualCapitalAssessmentMonthlyToday;
  if (manualCapitalToday !== undefined && (!Number.isFinite(manualCapitalToday) || manualCapitalToday < 0)) {
    throw new Error('Invalid manual capital assessment');
  }
  const effectiveCapitalAnnual =
    manualCapitalToday !== undefined ? manualCapitalToday * 12 * inflationFactor : capitalAssessmentAnnual;
  const capitalMonthly =
    spec.status === 'kvdr' ? undefined : effectiveCapitalAnnual / 12;
  const input: Record<string, unknown> = {
    ...common,
    mode: 'automatic',
    status: spec.status,
    scope: { kind: 'standard-domestic-no-employment' },
    thresholds,
    insurerAdditionalRate: spec.insurerAdditionalRate,
    insuredBirthYear: spec.insuredBirthYear,
    family: { isParent: spec.isParent, childBirthYears: spec.childBirthYears },
    statutoryPensions: spec.statutoryPensions.map((s) => ({ id: s.id, grossMonthly: s.grossMonthly })),
    occupationalPensions: spec.occupationalPensions.map((s) => ({ id: s.id, grossMonthly: s.grossMonthly })),
    drvSubsidy: spec.phase === 'pension' ? spec.drvSubsidy : undefined,
  };
  if (spec.status !== 'kvdr') {
    input.rentalAssessmentMonthly = spec.rentalAssessmentMonthly;
    input.capitalAssessmentMonthly = capitalMonthly;
  }
  if (spec.rateOverrides) input.rateOverrides = spec.rateOverrides;
  return input;
}

export function resolveInsuranceBurden(
  spec: LedgerInsuranceSpec,
  trialState: InvestmentState,
  ledgerYear: number,
  inflationFactor: number,
): InsuranceBurden {
  const assessmentIncomeAnnual = sumAssessmentIncomeAnnual(trialState, ledgerYear);
  if (spec.manual && spec.manualCapitalAssessmentMonthlyToday !== undefined) {
    return {
      converged: false,
      kind: 'invalid',
      residual: 0,
      diagnostics: [`Year ${ledgerYear}: manual replacement and manual capital assessment must not combine`],
    };
  }
  if (spec.manual) {
    const result = calculateContributions(buildContributionInput(spec, 0, inflationFactor));
    if (result.status === 'automatic' || result.status === 'manual') {
      return { converged: true, result, capitalAssessmentAnnual: 0, assessmentIncomeAnnual, assumption: 'manual-replacement' };
    }
    return {
      converged: false,
      kind: result.status,
      residual: 0,
      diagnostics: [`Year ${ledgerYear}: manual replacement input rejected (${result.status})`],
    };
  }
  const manualToday = spec.manualCapitalAssessmentMonthlyToday;
  if (manualToday !== undefined && (!Number.isFinite(manualToday) || manualToday < 0)) {
    return {
      converged: false,
      kind: 'invalid',
      residual: 0,
      diagnostics: [`Year ${ledgerYear}: manual capital assessment must be >= 0`],
    };
  }
  if (spec.status === 'kvdr' && manualToday !== undefined) {
    return {
      converged: false,
      kind: 'invalid',
      residual: 0,
      diagnostics: [`Year ${ledgerYear}: kvdr excludes capital assessment; clear the manual capital estimate`],
    };
  }
  const automaticCapitalAnnual =
    spec.status === 'kvdr'
      ? 0
      : mapCapitalAssessmentAnnual(trialState, ledgerYear, inflationFactor, spec.expenseAllowanceAnnual);
  const capitalAssessmentAnnual =
    manualToday !== undefined ? manualToday * 12 * inflationFactor : automaticCapitalAnnual;
  const result = calculateContributions(buildContributionInput(spec, automaticCapitalAnnual, inflationFactor));
  if (result.status === 'automatic' || result.status === 'manual') {
    return {
      converged: true,
      result,
      capitalAssessmentAnnual,
      assessmentIncomeAnnual,
      assumption:
        spec.status === 'kvdr'
          ? 'kvdr-excluded'
          : manualToday !== undefined
            ? 'manual-capital-assessment'
            : 'per-bucket',
    };
  }
  const diagnostics =
    result.status === 'incomplete' || result.status === 'invalid'
      ? result.issues.map((i) => `${i.field}: ${i.message}`)
      : result.status === 'manual-required'
        ? result.reasons
        : [`Unexpected insurance status ${result.status}`];
  return {
    converged: false,
    kind: result.status,
    residual: 0,
    diagnostics: [`Year ${ledgerYear}: insurance callback nonconverged (${result.status})`, ...diagnostics],
  };
}
