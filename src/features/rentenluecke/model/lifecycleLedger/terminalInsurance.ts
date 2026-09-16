import { calculateContributions } from '../contributions/contributionEngine.js';
import { indexedContributionThresholds } from '../contributions/rules2026.js';
import { valueHypotheticalLiquidation } from '../investmentTax/index.js';
import type { InvestmentState } from '../investmentTax/index.js';
import { LedgerInsuranceError } from './annualCashflow.js';
import { buildContributionInput } from './insuranceAssessment.js';
import type { LedgerInsuranceSpec, TerminalInsuranceResult } from './types.js';

export interface TerminalInsuranceArgs {
  state: InvestmentState;
  taxCashId: string;
  cumulativeInflation: number;
  spec: LedgerInsuranceSpec;
  baseCapitalAssessmentAnnual: number;
  cutoff?: 'beforeHoldingCutoff' | 'afterHoldingCutoff';
}

export function liquidationAssessableGain(
  state: InvestmentState,
  taxCashId: string,
  cumulativeInflation: number,
  cutoff: 'beforeHoldingCutoff' | 'afterHoldingCutoff' = 'beforeHoldingCutoff',
): { gain: number; terminated: InvestmentState; outstandingLiability: number; nominal: number; real: number } {
  if (!Number.isFinite(cumulativeInflation) || cumulativeInflation <= 0) {
    throw new Error('Terminal needs a cumulative inflation factor > 0');
  }
  const before = state.contributionIncome.length;
  const result = valueHypotheticalLiquidation(structuredClone(state), taxCashId, cumulativeInflation, cutoff);
  const gain = result.state.contributionIncome
    .slice(before)
    .reduce((n, r) => n + r.amount, 0);
  return { gain, terminated: result.state, outstandingLiability: result.outstandingLiability, nominal: result.nominal, real: result.real };
}

export function assessTerminalInsurance(args: TerminalInsuranceArgs): TerminalInsuranceResult {
  const { state, taxCashId, cumulativeInflation, spec, baseCapitalAssessmentAnnual } = args;
  const cutoff = args.cutoff ?? 'beforeHoldingCutoff';
  if (!Number.isFinite(baseCapitalAssessmentAnnual) || baseCapitalAssessmentAnnual < 0) {
    throw new Error('Terminal needs a finite nonneg base capital assessment');
  }
  const { gain } = liquidationAssessableGain(state, taxCashId, cumulativeInflation, cutoff);
  const augmented = baseCapitalAssessmentAnnual + gain;
  const baseResult = calculateContributions(buildContributionInput(spec, baseCapitalAssessmentAnnual, cumulativeInflation));
  const augResult = calculateContributions(buildContributionInput(spec, augmented, cumulativeInflation));
  if (baseResult.status !== 'automatic' && baseResult.status !== 'manual') {
    throw new LedgerInsuranceError([`Terminal base insurance input rejected (${baseResult.status})`]);
  }
  if (augResult.status !== 'automatic' && augResult.status !== 'manual') {
    throw new LedgerInsuranceError([`Terminal augmented insurance input rejected (${augResult.status})`]);
  }
  const baseKv = baseResult.ownKvMonthly * 12;
  const basePv = baseResult.ownPvMonthly * 12;
  const incrementalKvAnnual = Math.max(0, augResult.ownKvMonthly * 12 - baseKv);
  const incrementalPvAnnual = Math.max(0, augResult.ownPvMonthly * 12 - basePv);
  const thresholds = indexedContributionThresholds(cumulativeInflation);
  const pensionMonthly =
    spec.statutoryPensions.reduce((n, s) => n + s.grossMonthly, 0) +
    spec.occupationalPensions.reduce((n, s) => n + s.grossMonthly, 0);
  const assessedMonthly =
    spec.status === 'kvdr' || spec.manual
      ? pensionMonthly
      : pensionMonthly + spec.rentalAssessmentMonthly + augmented / 12;
  return {
    incrementalKvAnnual,
    incrementalPvAnnual,
    liquidationAssessableGain: gain,
    baseCapitalAssessmentAnnual,
    augmentedCapitalAssessmentAnnual: augmented,
    assumption: spec.status === 'kvdr' ? 'kvdr-no-new-charge' : 'continuing-voluntary-annual-assessment',
    cutoff,
    ceilingBinding: assessedMonthly > thresholds.monthlyCeiling,
  };
}
