import {
  createLifecycleState,
  liquidateLifecycle,
  validateLifecycleConfig,
} from '../lifecycleAllocation/index.js';
import type { LifecycleConfig } from '../lifecycleAllocation/index.js';
import { cloneInvestmentState, totalValue, unpaidTax } from '../investmentTax/index.js';
import type { OpeningBucket } from '../investmentTax/index.js';
import { LEDGER_DUST_EUR, LedgerInsuranceError, simulateLedger } from './annualCashflow.js';
import { assessTerminalInsurance } from './terminalInsurance.js';
import type {
  LedgerBootstrapPath,
  LedgerBootstrapResult,
  LedgerPathOutcome,
  LedgerResult,
  LedgerSearchResult,
  LedgerYearInput,
} from './types.js';
import { RequiredCapitalCalculationError } from './types.js';

export const LEDGER_REQUIRED_CAPITAL_EPSILON = 1;
export const LEDGER_MAX_REQUIRED_CAPITAL = 1_000_000_000_000;
export const LEDGER_MAX_BOUNDING_ITERATIONS = 100;
export const LEDGER_MAX_BINARY_SEARCH_ITERATIONS = 200;

export function cumulativeInflationFactors(annualRates: number[]): number[] {
  const factors: number[] = [];
  let acc = 1;
  for (const r of annualRates) {
    if (!Number.isFinite(r) || r <= -1) throw new Error('Annual inflation rate must be finite and > -1');
    acc *= 1 + r;
    if (!Number.isFinite(acc) || acc <= 0) throw new Error('Cumulative inflation factor overflow');
    factors.push(acc);
  }
  return factors;
}

function coverageIdsOf(config: LifecycleConfig): { funds: string[]; deposits: string[] } {
  const funds: string[] = [];
  const deposits: string[] = [];
  for (const bucket of config.buckets) {
    if (bucket.kind === 'deposit') deposits.push(bucket.id);
    else funds.push(bucket.id);
  }
  return { funds, deposits };
}

function assertMarketCoverage(config: LifecycleConfig, fundPrices: Record<string, number>, depositRates: Record<string, number>, label: string): void {
  const { funds, deposits } = coverageIdsOf(config);
  const priceKeys = Object.keys(fundPrices ?? {});
  const rateKeys = Object.keys(depositRates ?? {});
  if (priceKeys.length !== funds.length || funds.some((id) => !Object.hasOwn(fundPrices, id))) {
    throw new Error(`${label}: fundPrices must cover exactly all fund buckets (no fallback to expected returns)`);
  }
  if (rateKeys.length !== deposits.length || deposits.some((id) => !Object.hasOwn(depositRates, id))) {
    throw new Error(`${label}: depositRates must cover exactly all deposit buckets`);
  }
}

export function runLedgerDeterministic(
  config: LifecycleConfig,
  opening: OpeningBucket[],
  firstYear: number,
  years: LedgerYearInput[],
): LedgerResult {
  if (!Number.isInteger(firstYear)) throw new Error(`Invalid first year ${firstYear}`);
  if (years.length > 0 && years[0]?.year !== firstYear) {
    throw new Error(`First ledger year ${years[0]?.year} does not match opening year ${firstYear}`);
  }
  const initialState = createLifecycleState(config, firstYear, opening);
  return simulateLedger(config, initialState, years);
}

export function runLedgerBootstrap(
  config: LifecycleConfig,
  opening: OpeningBucket[],
  firstYear: number,
  baseYears: LedgerYearInput[],
  paths: LedgerBootstrapPath[],
  precomputedReference?: LedgerResult,
): LedgerBootstrapResult {
  if (baseYears.length === 0) throw new Error('Bootstrap needs at least one base year');
  // The deterministic reference depends only on (config, opening, firstYear,
  // baseYears). Callers that already simulated exactly this tuple pass the result
  // through instead of paying for a byte-identical recomputation.
  const reference = precomputedReference ?? runLedgerDeterministic(config, opening, firstYear, baseYears);
  const outcomes: LedgerPathOutcome[] = paths.map((path, index) => {
    try {
      let years: LedgerYearInput[];
      if (path.fullYears) {
        if (path.fullYears.length !== baseYears.length) {
          throw new Error(`Bootstrap path ${index}: ${path.fullYears.length} full years do not match ${baseYears.length} ledger years`);
        }
        for (let i = 0; i < path.fullYears.length; i++) {
          const full = path.fullYears[i];
          if (!full) throw new Error(`Bootstrap path ${index}: missing full year ${i}`);
          assertMarketCoverage(config, full.fundPrices, full.depositRates, `Bootstrap path ${index} year ${i}`);
          if (!Number.isFinite(full.inflationFactor) || full.inflationFactor <= 0) {
            throw new Error(`Bootstrap path ${index} year ${i}: invalid cumulative inflation factor`);
          }
          if (full.year !== baseYears[i]?.year || full.age !== baseYears[i]?.age) {
            throw new Error(`Bootstrap path ${index} year ${i}: full-year age/calendar mismatch`);
          }
        }
        years = path.fullYears;
      } else {
        if (path.years.length !== baseYears.length) {
          throw new Error(`Bootstrap path ${index}: ${path.years.length} market years do not match ${baseYears.length} ledger years`);
        }
        years = baseYears.map((base, i) => {
          const market = path.years[i];
          if (!market) throw new Error(`Bootstrap path ${index}: missing market year ${i}`);
          assertMarketCoverage(config, market.fundPrices, market.depositRates, `Bootstrap path ${index} year ${i}`);
          if (!Number.isFinite(market.inflationFactor) || market.inflationFactor <= 0) {
            throw new Error(`Bootstrap path ${index} year ${i}: invalid cumulative inflation factor`);
          }
          return { ...base, fundPrices: market.fundPrices, depositRates: market.depositRates, inflationFactor: market.inflationFactor };
        });
      }
      const result = runLedgerDeterministic(config, opening, firstYear, years);
      let unfunded = 0;
      let unfundedInsuranceKv = 0;
      let unfundedInsurancePv = 0;
      let exhausted = false;
      const yearlyClosingNominal: number[] = [];
      const yearlyAnchorNominal: number[] = [];
      for (const r of result.reports) {
        unfunded += r.unfundedWithdrawal;
        unfundedInsuranceKv += r.unfundedInsuranceKv;
        unfundedInsurancePv += r.unfundedInsurancePv;
        if (r.solverExhausted) exhausted = true;
        yearlyClosingNominal.push(r.closingValue);
        yearlyAnchorNominal.push(r.anchorNominal);
      }
      const remaining = result.reports.at(-1)?.remainingLiabilities ?? {};
      let stranded = 0;
      for (const k in remaining) { if (Object.hasOwn(remaining, k)) stranded += (remaining as Record<string, number>)[k] as number; }
      const insuranceGap = unfundedInsuranceKv + unfundedInsurancePv;
      if (exhausted) {
        return {
          status: 'failed',
          kind: 'nonconvergence',
          error: `Bootstrap path ${index}: solver exhausted (nonconvergence)`,
        } as LedgerPathOutcome;
      }
      const yearlyInflationFactors: number[] = [];
      for (const y of years) yearlyInflationFactors.push(y.inflationFactor);
      if (unfunded > LEDGER_DUST_EUR || stranded > LEDGER_DUST_EUR || insuranceGap > LEDGER_DUST_EUR) {
        return {
          status: 'depleted',
          closingValue: result.reports.at(-1)?.closingValue ?? totalValue(result.state),
          unfundedWithdrawal: unfunded,
          unfundedInsuranceKv,
          unfundedInsurancePv,
          remainingLiabilities: remaining,
          yearlyClosingNominal,
          yearlyAnchorNominal,
          yearlyInflationFactors,
        } as LedgerPathOutcome;
      }
      return {
        status: 'survived',
        closingValue: result.reports.at(-1)?.closingValue ?? totalValue(result.state),
        yearlyClosingNominal,
        yearlyAnchorNominal,
        yearlyInflationFactors,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        status: 'failed',
        kind: error instanceof LedgerInsuranceError ? 'nonconvergence' : 'error',
        error: message,
      } as LedgerPathOutcome;
    }
  });
  let failureCount = 0;
  let depletionCount = 0;
  for (const o of outcomes) {
    if (o.status === 'failed') failureCount++;
    else if (o.status === 'depleted') depletionCount++;
  }
  return { reference, paths: outcomes, failureCount, depletionCount, summaryBlocked: failureCount > 0 };
}

export interface LedgerSearchOptions {
  actualOpening: OpeningBucket[];
  terminalInflation: number;
}

function hasFixedReserve(config: LifecycleConfig): boolean {
  return config.milestones.some((m) =>
    Object.values(m.targets).some((t) => t.role === 'fixedReserve' && t.amountToday > 0),
  );
}

export function openingTotal(opening: OpeningBucket[]): number {
  return opening.reduce((n, b) => {
    if (b.classification === 'deposit') return n + b.value;
    return n + b.units * b.price;
  }, 0);
}

export type BankOnlySupport =
  | { supported: true; actualTotal: number; bucketId: string }
  | { supported: false; reason: string };

export function isBankOnlySearchSupported(
  config: LifecycleConfig,
  years: LedgerYearInput[],
  actualOpening: OpeningBucket[],
  terminalInflation: number,
): BankOnlySupport {
  if (config.buckets.length !== 1) {
    return { supported: false, reason: 'bank-only: supported domain is exactly one deposit bucket (mixed funds/multiple deposits unsupported)' };
  }
  const sole = config.buckets[0]!;
  if (sole.kind !== 'deposit') {
    return { supported: false, reason: 'bank-only: sole bucket must be a deposit (fund search unsupported)' };
  }
  if (config.taxCashId !== sole.id) {
    return { supported: false, reason: 'bank-only: deposit, settlement and contribution bucket must share one id' };
  }
  if (!Array.isArray(actualOpening) || actualOpening.length !== 1) {
    return { supported: false, reason: 'bank-only: actual opening must be the single validated deposit bucket' };
  }
  const actual = actualOpening[0]!;
  if (actual.id !== sole.id || actual.classification !== 'deposit') {
    return { supported: false, reason: 'bank-only: actual opening id/kind must match the single deposit bucket' };
  }
  if (typeof actual.value !== 'number' || !Number.isFinite(actual.value) || actual.value <= 0) {
    return { supported: false, reason: 'bank-only: actual validated opening value must be > 0 (true zero unsupported; low=0 is only a search artefact)' };
  }
  const actualTotal = openingTotal(actualOpening);
  if (!Number.isFinite(actualTotal) || actualTotal <= 0) {
    return { supported: false, reason: 'bank-only: actual validated opening value must be > 0 (true zero unsupported; low=0 is only a search artefact)' };
  }
  if (hasFixedReserve(config)) {
    return { supported: false, reason: 'bank-only: fixed reserves unsupported (no bounded monotonicity proof)' };
  }
  for (const m of config.milestones) {
    const target = (m.targets as Record<string, { role: string; share?: number }>)[sole.id];
    if (!target || target.role !== 'percent' || typeof target.share !== 'number' || !Number.isFinite(target.share) || Math.abs(target.share - 1) > 1e-12) {
      return { supported: false, reason: 'bank-only: explicit 100% percent targets required throughout (no fixed reserves)' };
    }
  }
  if (years.length === 0) {
    return { supported: false, reason: 'bank-only: search needs at least one ledger year' };
  }
  if (!Number.isFinite(terminalInflation) || terminalInflation <= 0) {
    return { supported: false, reason: 'bank-only: cumulative terminal inflation factor must be finite > 0' };
  }
  for (let i = 0; i < years.length; i++) {
    const y = years[i]!;
    if (!Number.isFinite(y.inflationFactor) || y.inflationFactor <= 0) {
      return { supported: false, reason: `bank-only: year ${y.year}: cumulative inflation factor F must be finite > 0` };
    }
    if (i > 0 && y.inflationFactor < (years[i - 1]?.inflationFactor ?? 0)) {
      return { supported: false, reason: 'bank-only: nonmonotone cumulative-inflation path unsupported' };
    }
    if (typeof y.allowance !== 'number' || !Number.isFinite(y.allowance) || y.allowance < 0) {
      return { supported: false, reason: `bank-only: year ${y.year}: allowance must be finite >= 0` };
    }
    if (![0, 0.08, 0.09].includes(y.churchRate)) {
      return { supported: false, reason: `bank-only: year ${y.year}: invalid church rate` };
    }
    const rate = y.depositRates?.[sole.id];
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < -1) {
      return { supported: false, reason: `bank-only: year ${y.year}: deposit rate must be finite >= -1` };
    }
    if (Object.keys(y.fundPrices ?? {}).length !== 0) {
      return { supported: false, reason: 'bank-only: fund prices must be empty (no fund sales/VP)' };
    }
    const spec = y.insurance;
    if (!spec || typeof spec !== 'object') {
      return { supported: false, reason: `bank-only: year ${y.year}: insurance spec required` };
    }
    const manualCapital = (spec as { manualCapitalAssessmentMonthlyToday?: number }).manualCapitalAssessmentMonthlyToday;
    const manual = (spec as { manual?: unknown }).manual;
    if (manual && manualCapital !== undefined) {
      return { supported: false, reason: `bank-only: year ${y.year}: manual replacement and manual capital assessment must not combine` };
    }
    if (spec.status === 'kvdr') {
      if (manualCapital !== undefined) {
        return { supported: false, reason: `bank-only: year ${y.year}: kvdr excludes capital assessment` };
      }
      continue;
    }
    if (manual) continue;
    if ((spec.status === 'voluntary' || spec.status === 'unknown') && manualCapital !== undefined) {
      if (!Number.isFinite(manualCapital) || (manualCapital as number) < 0) {
        return { supported: false, reason: `bank-only: year ${y.year}: manual capital assessment must be finite >= 0` };
      }
      continue;
    }
    return { supported: false, reason: `bank-only: year ${y.year}: automatic voluntary capital-dependent insurance unsupported (use manual replacement, KVdR, or explicit manualCapitalAssessmentMonthlyToday)` };
  }
  return { supported: true, actualTotal, bucketId: sole.id };
}

export function proportionalBankOpening(actualOpening: OpeningBucket[], capital: number): OpeningBucket[] {
  const src = actualOpening[0]!;
  if (!Number.isFinite(capital) || capital < 0) throw new Error(`Invalid trial capital ${capital}`);
  if (src.classification !== 'deposit') throw new Error('proportionalBankOpening needs the single deposit opening');
  return [{ id: src.id, name: src.name, classification: 'deposit', value: capital }];
}

export function ledgerSurvives(
  config: LifecycleConfig,
  opening: OpeningBucket[],
  years: LedgerYearInput[],
  terminalInflation: number,
): boolean {
  if (years.length === 0) return true;
  try {
    const result = runLedgerDeterministic(config, opening, years[0]?.year ?? 0, years);
    for (const report of result.reports) {
      if (report.solverExhausted) return false;
      if (!report.insuranceConverged) return false;
      if (report.unfundedWithdrawal > LEDGER_DUST_EUR) return false;
      if (report.unfundedInsuranceKv > LEDGER_DUST_EUR || report.unfundedInsurancePv > LEDGER_DUST_EUR) return false;
      if (Object.values(report.remainingLiabilities).some((v) => v > LEDGER_DUST_EUR)) return false;
    }
    void unpaidTax(result.state);
    const terminal = liquidateLifecycle(cloneInvestmentState(result.state), config.taxCashId, terminalInflation);
    if (terminal.outstandingLiability > LEDGER_DUST_EUR) return false;
    const horizonSpec = years.at(-1)?.insurance;
    const baseAssessment = result.reports.at(-1)?.capitalAssessmentAnnual ?? 0;
    if (horizonSpec) {
      const terminalInsurance = assessTerminalInsurance({
        state: result.state,
        taxCashId: config.taxCashId,
        cumulativeInflation: terminalInflation,
        spec: horizonSpec,
        baseCapitalAssessmentAnnual: baseAssessment,
      });
      const incremental = terminalInsurance.incrementalKvAnnual + terminalInsurance.incrementalPvAnnual;
      if (incremental > terminal.nominal + LEDGER_DUST_EUR) return false;
    }
    return true;
  } catch (error) {
    if (error instanceof LedgerInsuranceError) return false;
    throw error;
  }
}

type TrialAssessment = 'survived' | 'depleted' | 'nonconverged';

export function assessTrialForSearch(
  config: LifecycleConfig,
  opening: OpeningBucket[],
  years: LedgerYearInput[],
  terminalInflation: number,
): TrialAssessment {
  const configError = validateLifecycleConfig(config);
  if (configError) throw new Error(`assessTrialForSearch: invalid config (${configError})`);
  if (!Array.isArray(years) || years.length === 0) throw new Error('assessTrialForSearch: needs at least one ledger year');
  if (!Array.isArray(opening) || opening.length === 0) throw new Error('assessTrialForSearch: needs a trial opening');
  if (!Number.isFinite(terminalInflation) || terminalInflation <= 0) {
    throw new Error('assessTrialForSearch: needs a cumulative terminal inflation factor > 0');
  }
  let result: LedgerResult;
  try {
    result = runLedgerDeterministic(config, opening, years[0]?.year ?? 0, years);
  } catch (error) {
    if (error instanceof LedgerInsuranceError) return 'nonconverged';
    throw error;
  }
  for (const report of result.reports) {
    if (report.solverExhausted) return 'nonconverged';
    if (!report.insuranceConverged) return 'nonconverged';
  }
  let terminalDepleted = false;
  let terminalIncrementalDepleted = false;
  void unpaidTax(result.state);
  const terminal = liquidateLifecycle(cloneInvestmentState(result.state), config.taxCashId, terminalInflation);
  if (terminal.outstandingLiability > LEDGER_DUST_EUR) terminalDepleted = true;
  const horizonSpec = years.at(-1)?.insurance;
  const baseAssessment = result.reports.at(-1)?.capitalAssessmentAnnual ?? 0;
  if (horizonSpec) {
    try {
      const terminalInsurance = assessTerminalInsurance({
        state: result.state,
        taxCashId: config.taxCashId,
        cumulativeInflation: terminalInflation,
        spec: horizonSpec,
        baseCapitalAssessmentAnnual: baseAssessment,
      });
      const incremental = terminalInsurance.incrementalKvAnnual + terminalInsurance.incrementalPvAnnual;
      if (incremental > terminal.nominal + LEDGER_DUST_EUR) terminalIncrementalDepleted = true;
    } catch (error) {
      if (error instanceof LedgerInsuranceError) return 'nonconverged';
      throw error;
    }
  }
  for (const report of result.reports) {
    if (report.unfundedWithdrawal > LEDGER_DUST_EUR) return 'depleted';
    if (report.unfundedInsuranceKv > LEDGER_DUST_EUR || report.unfundedInsurancePv > LEDGER_DUST_EUR) return 'depleted';
    if (Object.values(report.remainingLiabilities).some((v) => v > LEDGER_DUST_EUR)) return 'depleted';
  }
  if (terminalDepleted || terminalIncrementalDepleted) return 'depleted';
  return 'survived';
}

export function searchLedgerCapital(
  config: LifecycleConfig,
  years: LedgerYearInput[],
  options: LedgerSearchOptions,
): LedgerSearchResult {
  const configError = validateLifecycleConfig(config);
  if (configError) throw new Error(configError);
  if (years.length === 0) throw new Error('Search needs at least one ledger year');
  if (!Number.isFinite(options.terminalInflation) || options.terminalInflation <= 0) {
    throw new Error('Search needs a cumulative terminal inflation factor > 0');
  }
  const gate = isBankOnlySearchSupported(config, years, options.actualOpening, options.terminalInflation);
  if (!gate.supported) return { status: 'unsupported', reason: gate.reason };
  // Supported bank-only proof (single deposit, 100% percent, no fixed reserves,
  // nondecreasing F > 0, capital-independent insurance, actual opening > 0):
  // no fund sales/VP/loss creation, initial tax loss 0, tax rate k=(1+0.055+church)/(4+church)<1,
  // insurance burden fixed independent of trial wealth. Funded wealth follows
  // G(W)=W*(1+r)+c-withdrawal-k*max(0,W*max(r,0)-allowance)-fixedInsurance.
  // For r>=0 slope >=1+r*(1-k)>0; for -1<=r<0 slope 1+r>=0. Each step is monotone
  // nondecreasing in W; composition over years preserves order by induction, so prefix
  // solvency inequalities are monotone and survives(C) is monotone. Solver/insurance
  // numeric failures are scoped to nonconverged here and never become depleted.
  // low=0 is only a search artefact; the gate is on concrete actualTotal>0.
  const openingForCapital = (capital: number): OpeningBucket[] =>
    proportionalBankOpening(options.actualOpening, capital);
  const nominalGap = years.reduce((n, y) => n + Math.max(0, y.withdrawalNeed - y.contribution), 0);
  let high = Math.max(1, nominalGap);
  let boundingIterations = 0;
  for (;;) {
    const outcome = assessTrialForSearch(config, openingForCapital(high), years, options.terminalInflation);
    if (outcome === 'survived') break;
    if (outcome === 'nonconverged') {
      return { status: 'nonconverged', reason: `trial capital ${high} nonconverged (numeric/insurance failure, not insolvency)` };
    }
    high *= 2;
    boundingIterations += 1;
    if (high > LEDGER_MAX_REQUIRED_CAPITAL || boundingIterations > LEDGER_MAX_BOUNDING_ITERATIONS) {
      throw new RequiredCapitalCalculationError();
    }
  }
  let low = 0;
  let binaryIterations = 0;
  while (high - low > LEDGER_REQUIRED_CAPITAL_EPSILON && binaryIterations < LEDGER_MAX_BINARY_SEARCH_ITERATIONS) {
    const mid = (low + high) / 2;
    const outcome = assessTrialForSearch(config, openingForCapital(mid), years, options.terminalInflation);
    if (outcome === 'survived') high = mid;
    else if (outcome === 'depleted') low = mid;
    else {
      return { status: 'nonconverged', reason: `trial capital ${mid} nonconverged (numeric/insurance failure, not insolvency)` };
    }
    binaryIterations += 1;
  }
  if (high - low > LEDGER_REQUIRED_CAPITAL_EPSILON) {
    return { status: 'nonconverged', reason: 'binary search exhausted its iteration budget above the euro bracket' };
  }
  return { status: 'converged', requiredCapital: high, boundingIterations, binaryIterations };
}
