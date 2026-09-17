import {
  createLifecycleState,
  liquidateLifecycle,
  validateLifecycleConfig,
} from '../lifecycleAllocation/index.js';
import type { LifecycleConfig } from '../lifecycleAllocation/index.js';
import { totalValue, unpaidTax } from '../investmentTax/index.js';
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

function bucketIds(config: LifecycleConfig, kind: 'fund' | 'deposit'): string[] {
  return config.buckets
    .filter((b) => (kind === 'fund' ? b.kind !== 'deposit' : b.kind === 'deposit'))
    .map((b) => b.id);
}

function assertMarketCoverage(config: LifecycleConfig, fundPrices: Record<string, number>, depositRates: Record<string, number>, label: string): void {
  const funds = bucketIds(config, 'fund');
  const deposits = bucketIds(config, 'deposit');
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
): LedgerBootstrapResult {
  if (baseYears.length === 0) throw new Error('Bootstrap needs at least one base year');
  const reference = runLedgerDeterministic(config, opening, firstYear, baseYears);
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
      const unfunded = result.reports.reduce((n, r) => n + r.unfundedWithdrawal, 0);
      const remaining = result.reports.at(-1)?.remainingLiabilities ?? {};
      const stranded = Object.values(remaining).reduce((n, v) => n + v, 0);
      const unfundedInsuranceKv = result.reports.reduce((n, r) => n + r.unfundedInsuranceKv, 0);
      const unfundedInsurancePv = result.reports.reduce((n, r) => n + r.unfundedInsurancePv, 0);
      const insuranceGap = unfundedInsuranceKv + unfundedInsurancePv;
      const exhausted = result.reports.some((r) => r.solverExhausted);
      if (exhausted) {
        return {
          status: 'failed',
          kind: 'nonconvergence',
          error: `Bootstrap path ${index}: solver exhausted (nonconvergence)`,
        } as LedgerPathOutcome;
      }
      const yearlyClosingNominal = result.reports.map((r) => r.closingValue);
      const yearlyAnchorNominal = result.reports.map((r) => r.anchorNominal);
      const yearlyInflationFactors = years.map((y) => y.inflationFactor);
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
  const failureCount = outcomes.filter((o) => o.status === 'failed').length;
  const depletionCount = outcomes.filter((o) => o.status === 'depleted').length;
  return { reference, paths: outcomes, failureCount, depletionCount, summaryBlocked: failureCount > 0 };
}

export interface LedgerSearchOptions {
  openingForCapital: (capital: number) => OpeningBucket[];
  terminalInflation: number;
  allowFixedReserve?: boolean;
  allowNonmonotoneF?: boolean;
  allowZeroStart?: boolean;
}

function hasFixedReserve(config: LifecycleConfig): boolean {
  return config.milestones.some((m) =>
    Object.values(m.targets).some((t) => t.role === 'fixedReserve' && t.amountToday > 0),
  );
}

function openingTotal(opening: OpeningBucket[]): number {
  return opening.reduce((n, b) => {
    if (b.classification === 'deposit') return n + b.value;
    return n + b.units * b.price;
  }, 0);
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
    const terminal = liquidateLifecycle(structuredClone(result.state), config.taxCashId, terminalInflation);
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
  if (hasFixedReserve(config) && !options.allowFixedReserve) {
    return {
      status: 'unsupported',
      reason: 'fixed-reserve search without a bounded monotonicity proof returns unsupported instead of a capital number',
    };
  }
  for (let i = 1; i < years.length; i++) {
    const prev = years[i - 1]?.inflationFactor ?? 0;
    const cur = years[i]?.inflationFactor ?? 0;
    if (cur < prev && !options.allowNonmonotoneF) {
      return {
        status: 'unsupported',
        reason: 'nonmonotone cumulative-inflation path without a monotone-safe proof returns unsupported',
      };
    }
  }
  if (openingTotal(options.openingForCapital(0)) <= 0 && !options.allowZeroStart) {
    return {
      status: 'unsupported',
      reason: 'zero-total-start search without an explicit-target proof returns unsupported',
    };
  }
  const survives = (capital: number): boolean =>
    ledgerSurvives(config, options.openingForCapital(capital), years, options.terminalInflation);

  const nominalGap = years.reduce((n, y) => n + Math.max(0, y.withdrawalNeed - y.contribution), 0);
  let high = Math.max(1, nominalGap);
  let boundingIterations = 0;
  while (!survives(high)) {
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
    if (survives(mid)) high = mid;
    else low = mid;
    binaryIterations += 1;
  }
  if (high - low > LEDGER_REQUIRED_CAPITAL_EPSILON) {
    return { status: 'nonconverged', reason: 'binary search exhausted its iteration budget above the euro bracket' };
  }
  return { status: 'converged', requiredCapital: high, boundingIterations, binaryIterations };
}
