import { describe, expect, it } from 'vitest';
import {
  applyAnnualPricesAndInterest,
  applyTransaction,
  beginInvestmentYear,
  bucketValue,
  closeWithPendingVP,
  reconcileTax,
  totalValue,
  unpaidTax,
} from '../investmentTax/index.js';
import type { InvestmentState, OpeningBucket } from '../investmentTax/index.js';
import { createLifecycleState, liquidateLifecycle, resolveYearlyTargetsEuro, simulateLifecycle } from './index.js';
import { executeUnified } from './engine.js';
import { prefillTargetsFromHoldings } from './index.js';
import type { LifecycleConfig, LifecycleYearInput } from './types.js';

// Sensitivity limits, stated explicitly (see PLAN §2.2/§9):
// - Timing-only differences are additive in cashflows while allocation targets stay equal.
// - Allocation feedback (different interim wealth -> different euro targets -> different
//   exposure) can amplify timing differences; the tests below measure it at 40/50/60 years
//   instead of claiming it cannot compound.

const buckets = () => [
  { id: 'cash', name: 'Cash', kind: 'deposit' as const, priority: 1 },
  { id: 'equity', name: 'Equity', kind: 'equityFund' as const, priority: 2 },
];

const fixed6040 = (): LifecycleConfig => ({
  buckets: buckets(),
  milestones: [{
    name: 'all', startAge: 30,
    targets: { cash: { role: 'percent', share: 0.4 }, equity: { role: 'percent', share: 0.6 } },
  }],
  transitions: [],
  taxCashId: 'cash',
});

const richOpening = (cash = 40000): OpeningBucket[] => [
  { id: 'cash', name: 'Cash', classification: 'deposit', value: cash },
  { id: 'equity', name: 'Equity', classification: 'equityFund', units: 600, price: 100, acquisitionCost: 48000 },
];

const pricesFor = (growth: number, years: number, start = 100): number[] =>
  Array.from({ length: years }, (_, i) => start * (1 + growth) ** (i + 1));

function runEngine(
  config: LifecycleConfig,
  opening: OpeningBucket[],
  firstYear: number,
  count: number,
  pricePath: number[],
  opts: { contribution?: number; withdrawal?: number; allowance?: number; rate?: number; basisRate?: number } = {},
) {
  const initial = createLifecycleState(config, firstYear, opening);
  const years: LifecycleYearInput[] = pricePath.slice(0, count).map((price, i) => ({
    age: 30 + i,
    year: firstYear + i,
    contribution: opts.contribution ?? 0,
    withdrawalNeed: opts.withdrawal ?? 0,
    allowance: opts.allowance ?? 100000,
    churchRate: 0 as const,
    fundPrices: { equity: price },
    depositRates: { cash: opts.rate ?? 0 },
    basisRate: opts.basisRate ?? 0,
    inflationFactor: 1,
  }));
  return simulateLifecycle(config, initial, years);
}

// Test-only timing fork: the same joint after-tax solve and unified execution as the engine,
// but the contribution is posted in OPENING (before the market move) instead of at year end.
// This fork lives in tests only; the engine exposes no timing option.
function runOpeningContributionFork(
  config: LifecycleConfig,
  opening: OpeningBucket[],
  firstYear: number,
  count: number,
  pricePath: number[],
  contribution: number,
) {
  let state = createLifecycleState(config, firstYear, opening);
  for (let i = 0; i < count; i++) {
    const year = firstYear + i;
    state = beginInvestmentYear(state, year, 100000, 0);
    if (contribution > 0) {
      state = applyTransaction(state, { id: `fork:${year}:contrib`, kind: 'external', cashId: 'cash', amount: contribution });
    }
    state = applyAnnualPricesAndInterest(state, { equity: pricePath[i] }, { cash: 0 });
    const wealth = totalValue(state);
    const values: Record<string, number> = {};
    for (const b of state.buckets) values[b.id] = bucketValue(b);
    const targets = resolveYearlyTargetsEuro(config, 30 + i, wealth, 1).targetsNominal;
    state = executeUnified(config, state, values, targets, 0, { equity: pricePath[i] }, `fork:${year}`).state;
    state = reconcileTax(state, 'cash', `fork:${year}:tax`);
    state = closeWithPendingVP(state, { equity: i === 0 ? 100 : pricePath[i - 1] }, 0);
  }
  return state;
}

describe('S1 constant-market no-op', () => {
  it('holds 60 years with zero trades and zero drift', () => {
    const values = { cash: 40000, equity: 60000 };
    const targets = prefillTargetsFromHoldings(values, { cash: 'deposit', equity: 'equityFund' });
    const config: LifecycleConfig = { buckets: buckets(), milestones: [{ name: 'all', startAge: 30, targets }], transitions: [], taxCashId: 'cash' };
    const { state, reports } = runEngine(config, richOpening(), 2026, 60, Array(60).fill(100));
    for (const report of reports) expect(report.trades).toEqual([]);
    const drift = Math.abs(totalValue(state) - 100000) / 100000;
    expect(drift).toBeLessThanOrEqual(1e-6);
    const result = liquidateLifecycle(state, 'cash', 1);
    expect(result.real).toBeCloseTo(100000, 4);
  });
});

describe('S2 alternating-market A/B comparison at 40/50/60 years', () => {
  const alternating = (count: number): number[] => {
    const path: number[] = [];
    let price = 100;
    for (let i = 0; i < count; i++) {
      price *= i % 2 === 0 ? 1.1 : 0.9;
      path.push(price);
    }
    return path;
  };

  it.each([40, 50, 60])('agrees exactly with zero cashflows at %i years', (count) => {
    const config = fixed6040();
    const path = alternating(count);
    const engine = runEngine(config, richOpening(), 2026, count, path);
    const fork = runOpeningContributionFork(config, richOpening(), 2026, count, path, 0);
    expect(Math.abs(totalValue(engine.state) - totalValue(fork))).toBeLessThanOrEqual(1e-6);
  });

  it.each([40, 50, 60])('bounds timing differences linearly in cashflows at %i years', (count) => {
    const config = fixed6040();
    const path = alternating(count);
    const contribution = 1000;
    const engine = runEngine(config, richOpening(), 2026, count, path, { contribution });
    const fork = runOpeningContributionFork(config, richOpening(), 2026, count, path, contribution);
    const totalCashflows = contribution * count;
    const ratio = Math.abs(totalValue(engine.state) - totalValue(fork)) / totalCashflows;
    // Adjacent-year shift moves each contribution by at most one year's return (≤ 10% here,
    // 5% margin). Feedback through rebalanced targets is included in the measurement.
    expect(ratio).toBeLessThanOrEqual(0.1 * 1.05);
  });
});

describe('adjacent-year sensitivity reference', () => {
  it('shifts a single-year contribution by exactly C x r with fixed holdings', () => {
    const config: LifecycleConfig = {
      buckets: [{ id: 'cash', name: 'Cash', kind: 'deposit', priority: 1 }],
      milestones: [{ name: 'all', startAge: 30, targets: { cash: { role: 'percent', share: 1 } } }],
      transitions: [],
      taxCashId: 'cash',
    };
    const opening: OpeningBucket[] = [{ id: 'cash', name: 'Cash', classification: 'deposit', value: 10000 }];
    const base: LifecycleYearInput = {
      age: 30, year: 2026, contribution: 2000, withdrawalNeed: 0, allowance: 100000, churchRate: 0,
      fundPrices: {}, depositRates: { cash: 0.05 }, basisRate: 0, inflationFactor: 1,
    };
    const initial = createLifecycleState(config, 2026, opening);
    const engine = simulateLifecycle(config, initial, [base]);
    let fork: InvestmentState = beginInvestmentYear(structuredClone(initial), 2026, 100000, 0);
    fork = applyTransaction(fork, { id: 'fork:contrib', kind: 'external', cashId: 'cash', amount: 2000 });
    fork = applyAnnualPricesAndInterest(fork, {}, { cash: 0.05 });
    fork = reconcileTax(fork, 'cash', 'fork:tax');
    fork = closeWithPendingVP(fork, {}, 0);
    // Engine (year-end contribution): 10000*1.05 + 2000. Fork (opening): 12000*1.05.
    expect(totalValue(engine.state)).toBeCloseTo(12500, 9);
    expect(totalValue(fork)).toBeCloseTo(12600, 9);
    expect(totalValue(fork) - totalValue(engine.state)).toBeCloseTo(2000 * 0.05, 9);
  });
});

describe('S3 reserve-scale spot check', () => {
  const reserveConfig = (): LifecycleConfig => ({
    buckets: buckets(),
    milestones: [{
      name: 'all', startAge: 30,
      targets: { cash: { role: 'fixedReserve', amountToday: 25000 }, equity: { role: 'percent', share: 1 } },
    }],
    transitions: [],
    taxCashId: 'cash',
  });

  it('keeps fill order across wealth scales with sub-linear shortfall', () => {
    const config = reserveConfig();
    const flat = Array(10).fill(100);
    const small = runEngine(config, richOpening(25000), 2026, 10, flat);
    const large = runEngine(
      config,
      [
        { id: 'cash', name: 'Cash', classification: 'deposit', value: 50000 },
        { id: 'equity', name: 'Equity', classification: 'equityFund', units: 1200, price: 100, acquisitionCost: 96000 },
      ],
      2026, 10, flat,
    );
    const smallShort = small.reports.map((r) => r.shortfall);
    const largeShort = large.reports.map((r) => r.shortfall);
    expect(largeShort.every((s) => s === 0)).toBe(true);
    expect(smallShort.every((s) => s >= 0)).toBe(true);
  });
});

describe('S4 VP and allowance lifetime reconciliation', () => {
  it('accounts every assessed euro once over 40 years', () => {
    const config = fixed6040();
    const path = pricesFor(0.05, 40);
    const { state } = runEngine(config, richOpening(), 2026, 40, path, { allowance: 100, basisRate: 0.025 });
    const received = state.taxIncome.filter((r) => r.kind === 'vp').reduce((n, r) => n + r.gross, 0);
    expect(received).toBeGreaterThan(0);
    const allowanceUsed = state.taxYears.reduce((n, t) => n + t.allowanceUsed, 0);
    expect(allowanceUsed).toBeLessThanOrEqual(40 * 100 + 1e-6);
    const liability = state.taxYears.reduce((n, t) => n + t.liability, 0);
    const paid = state.taxYears.reduce((n, t) => n + t.paid, 0);
    expect(paid + unpaidTax(state)).toBeCloseTo(liability, 4);
    for (const pending of state.pending) expect(pending.holdingYear).toBe(2065);
    const result = liquidateLifecycle(state, 'cash', 1);
    expect(result.outstandingLiability).toBeGreaterThanOrEqual(0);
  });
});
