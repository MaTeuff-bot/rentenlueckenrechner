import { describe, expect, it } from 'vitest';
import {
  bucketValue,
  totalValue,
  unpaidTax,
} from '../investmentTax/index.js';
import type { OpeningBucket } from '../investmentTax/index.js';
import { createLifecycleState, simulateLifecycle, simulateLifecycleYear } from './index.js';
import { prefillTargetsFromHoldings } from './index.js';
import { resolveYearlyTargetsEuro, validateLifecycleConfig } from './index.js';
import { liquidateLifecycle } from './index.js';
import type { BucketTarget, LifecycleConfig, LifecycleYearInput } from './types.js';

const stdBuckets = () => [
  { id: 'cash', name: 'Cash', kind: 'deposit' as const, priority: 1 },
  { id: 'bond', name: 'Bond', kind: 'bondFund' as const, priority: 2 },
  { id: 'equity', name: 'Equity', kind: 'equityFund' as const, priority: 3 },
];

const stdConfig = (targets: Record<string, BucketTarget>): LifecycleConfig => ({
  buckets: stdBuckets(),
  milestones: [{ name: 'all', startAge: 30, targets }],
  transitions: [],
  taxCashId: 'cash',
});

const openingOf = (equityUnits: number, equityPrice: number, equityCost: number, bondUnits: number, bondPrice: number, bondCost: number, cash: number): OpeningBucket[] => [
  { id: 'cash', name: 'Cash', classification: 'deposit', value: cash },
  { id: 'bond', name: 'Bond', classification: 'bondFund', units: bondUnits, price: bondPrice, acquisitionCost: bondCost },
  { id: 'equity', name: 'Equity', classification: 'equityFund', units: equityUnits, price: equityPrice, acquisitionCost: equityCost },
];

const yearInput = (over: Partial<LifecycleYearInput> = {}): LifecycleYearInput => ({
  age: 30,
  year: 2026,
  contribution: 0,
  withdrawalNeed: 0,
  allowance: 1000,
  churchRate: 0,
  fundPrices: { bond: 100, equity: 100 },
  depositRates: { cash: 0 },
  basisRate: 0.025,
  inflationFactor: 1,
  ...over,
});

const runYears = (config: LifecycleConfig, opening: OpeningBucket[], years: LifecycleYearInput[]) => {
  const initial = createLifecycleState(config, years[0].year, opening);
  return simulateLifecycle(config, initial, years);
};

describe('milestones and roles', () => {
  it('splits a pure-percent milestone exactly', () => {
    const config = stdConfig({
      cash: { role: 'percent', share: 0.5 },
      bond: { role: 'percent', share: 0.3 },
      equity: { role: 'percent', share: 0.2 },
    });
    const { targetsNominal, shortfall } = resolveYearlyTargetsEuro(config, 30, 10000, 1);
    expect(shortfall).toBe(0);
    expect(targetsNominal).toEqual({ cash: 5000, bond: 3000, equity: 2000 });
  });

  it('fills a fixed reserve then splits the remainder', () => {
    const config = stdConfig({
      cash: { role: 'fixedReserve', amountToday: 20000 },
      bond: { role: 'percent', share: 0.7 },
      equity: { role: 'percent', share: 0.3 },
    });
    const { targetsNominal } = resolveYearlyTargetsEuro(config, 40, 100000, 2);
    expect(targetsNominal.cash).toBe(40000);
    expect(targetsNominal.bond).toBeCloseTo(42000, 9);
    expect(targetsNominal.equity).toBeCloseTo(18000, 9);
  });

  it('rejects dual-role shapes and over-allocated shares', () => {
    const dual = stdConfig({
      cash: { role: 'percent', share: 0.5 } as BucketTarget,
      bond: { role: 'percent', share: 0.3 },
      equity: { role: 'percent', share: 0.2 },
    });
    (dual.milestones[0].targets as Record<string, unknown>).cash = { role: 'percent', share: 0.5, amountToday: 1 };
    expect(validateLifecycleConfig(dual)).toMatch(/mixes roles/);
    const over = stdConfig({
      cash: { role: 'percent', share: 0.6 },
      bond: { role: 'percent', share: 0.3 },
      equity: { role: 'percent', share: 0.2 },
    });
    expect(validateLifecycleConfig(over)).toMatch(/over-allocates/);
  });
});

describe('reserve priority and shortfall', () => {
  const priorityConfig = (): LifecycleConfig => ({
    buckets: [
      { id: 'cash', name: 'Cash', kind: 'deposit', priority: 1 },
      { id: 'reserve2', name: 'Reserve2', kind: 'deposit', priority: 2 },
      { id: 'spare', name: 'Spare', kind: 'deposit', priority: 3 },
      { id: 'equity', name: 'Equity', kind: 'equityFund', priority: 4 },
    ],
    milestones: [{
      name: 'all',
      startAge: 30,
      targets: {
        cash: { role: 'fixedReserve', amountToday: 10000 },
        reserve2: { role: 'fixedReserve', amountToday: 10000 },
        spare: { role: 'fixedReserve', amountToday: 10000 },
        equity: { role: 'percent', share: 1 },
      },
    }],
    transitions: [],
    taxCashId: 'cash',
  });

  it('fills reserves in priority order and zeroes percent targets', () => {
    const { targetsNominal, shortfall } = resolveYearlyTargetsEuro(priorityConfig(), 30, 25000, 1);
    expect(targetsNominal.cash).toBe(10000);
    expect(targetsNominal.reserve2).toBe(10000);
    expect(targetsNominal.spare).toBe(5000);
    expect(targetsNominal.equity).toBe(0);
    expect(shortfall).toBe(5000);
  });

  it('never produces negative balances through the engine', () => {
    const config = priorityConfig();
    const opening: OpeningBucket[] = [
      { id: 'cash', name: 'Cash', classification: 'deposit', value: 25000 },
      { id: 'reserve2', name: 'Reserve2', classification: 'deposit', value: 0 },
      { id: 'spare', name: 'Spare', classification: 'deposit', value: 0 },
      { id: 'equity', name: 'Equity', classification: 'equityFund', units: 0, price: 50, acquisitionCost: 0 },
    ];
    const { reports, state } = runYears(config, opening, [yearInput({ fundPrices: { equity: 50 }, depositRates: { cash: 0, reserve2: 0, spare: 0 }, age: 30 })]);
    expect(reports[0].shortfall).toBe(5000);
    for (const b of state.buckets) expect(bucketValue(b)).toBeGreaterThanOrEqual(-1e-9);
  });
});

describe('transitions', () => {
  const gliding = (): LifecycleConfig => ({
    buckets: [
      { id: 'cash', name: 'Cash', kind: 'deposit', priority: 1 },
      { id: 'equity', name: 'Equity', kind: 'equityFund', priority: 2 },
    ],
    milestones: [
      { name: 'early', startAge: 30, targets: { cash: { role: 'fixedReserve', amountToday: 10000 }, equity: { role: 'percent', share: 1 } } },
      { name: 'late', startAge: 60, targets: { cash: { role: 'fixedReserve', amountToday: 30000 }, equity: { role: 'percent', share: 1 } } },
    ],
    transitions: [{ fromMilestone: 'early', toMilestone: 'late', startAge: 60, durationYears: 5 }],
    taxCashId: 'cash',
  });

  it('pins the endpoint table for t0=60 d=5', () => {
    const config = gliding();
    const expected: Array<[number, number]> = [
      [59, 10000], [60, 10000 + 20000 / 6], [61, 10000 + 2 * 20000 / 6],
      [62, 20000], [63, 10000 + 4 * 20000 / 6], [64, 10000 + 5 * 20000 / 6], [65, 30000], [70, 30000],
    ];
    for (const [age, reserve] of expected) {
      const { targetsNominal } = resolveYearlyTargetsEuro(config, age, 1000000, 1);
      expect(targetsNominal.cash).toBeCloseTo(reserve, 9);
    }
  });

  it('handles d=1 midpoint and d=0 switch', () => {
    const one: LifecycleConfig = {
      buckets: [
        { id: 'cash', name: 'Cash', kind: 'deposit', priority: 1 },
        { id: 'equity', name: 'Equity', kind: 'equityFund', priority: 2 },
      ],
      milestones: [
        { name: 'a', startAge: 30, targets: { cash: { role: 'fixedReserve', amountToday: 0 }, equity: { role: 'percent', share: 1 } } },
        { name: 'b', startAge: 50, targets: { cash: { role: 'fixedReserve', amountToday: 10000 }, equity: { role: 'percent', share: 1 } } },
      ],
      transitions: [{ fromMilestone: 'a', toMilestone: 'b', startAge: 50, durationYears: 1 }],
      taxCashId: 'cash',
    };
    expect(resolveYearlyTargetsEuro(one, 49, 100000, 1).targetsNominal.cash).toBe(0);
    expect(resolveYearlyTargetsEuro(one, 50, 100000, 1).targetsNominal.cash).toBe(5000);
    expect(resolveYearlyTargetsEuro(one, 51, 100000, 1).targetsNominal.cash).toBe(10000);

    const instant: LifecycleConfig = {
      ...one,
      transitions: [{ fromMilestone: 'a', toMilestone: 'b', startAge: 50, durationYears: 0 }],
    };
    expect(resolveYearlyTargetsEuro(instant, 49, 100000, 1).targetsNominal.cash).toBe(0);
    expect(resolveYearlyTargetsEuro(instant, 50, 100000, 1).targetsNominal.cash).toBe(10000);
  });

  it('rejects overlap, chain gaps and unreferenced milestones', () => {
    const base = gliding();
    const overlap: LifecycleConfig = {
      ...base,
      milestones: [
        base.milestones[0],
        { name: 'mid', startAge: 55, targets: base.milestones[1].targets },
        base.milestones[1],
      ],
      transitions: [
        { fromMilestone: 'early', toMilestone: 'mid', startAge: 60, durationYears: 5 },
        { fromMilestone: 'mid', toMilestone: 'late', startAge: 62, durationYears: 2 },
      ],
    };
    expect(validateLifecycleConfig(overlap)).toMatch(/overlap/i);
    const gap: LifecycleConfig = {
      ...base,
      milestones: [
        base.milestones[0],
        { name: 'mid', startAge: 55, targets: base.milestones[1].targets },
        base.milestones[1],
      ],
      transitions: [
        { fromMilestone: 'early', toMilestone: 'mid', startAge: 55, durationYears: 2 },
        { fromMilestone: 'late', toMilestone: 'mid', startAge: 60, durationYears: 1 },
      ],
    };
    expect(validateLifecycleConfig(gap)).toMatch(/chain/i);
    const orphan: LifecycleConfig = {
      ...base,
      milestones: [...base.milestones, { name: 'ghost', startAge: 80, targets: base.milestones[1].targets }],
    };
    expect(validateLifecycleConfig(orphan)).toMatch(/not reachable/);
  });
});

describe('role-change blending', () => {
  const morph = (): LifecycleConfig => ({
    buckets: [
      { id: 'cash', name: 'Cash', kind: 'deposit', priority: 1 },
      { id: 'flex', name: 'Flex', kind: 'bondFund', priority: 2 },
    ],
    milestones: [
      {
        name: 'early', startAge: 30,
        targets: { cash: { role: 'fixedReserve', amountToday: 10000 }, flex: { role: 'percent', share: 0.5 } },
      },
      {
        name: 'late', startAge: 40,
        targets: { cash: { role: 'fixedReserve', amountToday: 10000 }, flex: { role: 'fixedReserve', amountToday: 20000 } },
      },
    ],
    transitions: [{ fromMilestone: 'early', toMilestone: 'late', startAge: 40, durationYears: 3 }],
    taxCashId: 'cash',
  });

  it('blends old and new balances against the same anchor', () => {
    const config = morph();
    const anchor = 100000;
    const inflation = 2;
    const before = resolveYearlyTargetsEuro(config, 39, anchor, inflation).targetsNominal.flex;
    expect(before).toBeCloseTo(0.5 * (anchor - 20000), 9);
    const after = resolveYearlyTargetsEuro(config, 43, anchor, inflation).targetsNominal.flex;
    expect(after).toBe(40000);
    const mid = resolveYearlyTargetsEuro(config, 40, anchor, inflation).targetsNominal.flex;
    // p = 1/4 at age 40: fixed part 0.25 * 40000 = 10000 fills after the 20000 cash
    // reserve, leaving R = 70000 for the 0.375 coefficient: 10000 + 26250 = 36250.
    expect(mid).toBeCloseTo(36250, 9);
    const full = resolveYearlyTargetsEuro(config, 40, anchor, inflation).targetsNominal;
    const sum = Object.values(full).reduce((n, v) => n + v, 0);
    expect(sum).toBeLessThanOrEqual(anchor + 1e-6);
  });

  it('conserves mixed transitions and keeps reserve priority', () => {
    const config: LifecycleConfig = {
      buckets: [
        { id: 'cash', name: 'Cash', kind: 'deposit', priority: 1 },
        { id: 'flex', name: 'Flex', kind: 'bondFund', priority: 2 },
        { id: 'equity', name: 'Equity', kind: 'equityFund', priority: 3 },
      ],
      milestones: [
        {
          name: 'early', startAge: 30,
          targets: {
            cash: { role: 'fixedReserve', amountToday: 10000 },
            flex: { role: 'percent', share: 0.4 },
            equity: { role: 'percent', share: 0.5 },
          },
        },
        {
          name: 'late', startAge: 40,
          targets: {
            cash: { role: 'fixedReserve', amountToday: 20000 },
            flex: { role: 'fixedReserve', amountToday: 30000 },
            equity: { role: 'percent', share: 0.8 },
          },
        },
      ],
      transitions: [{ fromMilestone: 'early', toMilestone: 'late', startAge: 40, durationYears: 3 }],
      taxCashId: 'cash',
    };
    for (const age of [39, 40, 41, 42, 43]) {
      for (const anchor of [20000, 100000, 500000]) {
        const { targetsNominal } = resolveYearlyTargetsEuro(config, age, anchor, 1);
        const sum = Object.values(targetsNominal).reduce((n, v) => n + v, 0);
        expect(sum).toBeLessThanOrEqual(anchor + 1e-6);
        expect(sum).toBeGreaterThanOrEqual(-1e-9);
        for (const v of Object.values(targetsNominal)) expect(v).toBeGreaterThanOrEqual(-1e-9);
      }
    }
    const poor = resolveYearlyTargetsEuro(config, 41, 15000, 1);
    expect(poor.targetsNominal.cash).toBeLessThanOrEqual(15000);
    expect(poor.shortfall).toBeGreaterThan(0);
  });

  it('sells a zero-target bucket down while retaining history', () => {
    const config: LifecycleConfig = ({
      buckets: stdBuckets(),
      milestones: [
        {
          name: 'early', startAge: 30,
          targets: { cash: { role: 'percent', share: 0.2 }, bond: { role: 'percent', share: 0.3 }, equity: { role: 'percent', share: 0.5 } },
        },
        {
          name: 'late', startAge: 31,
          targets: { cash: { role: 'percent', share: 0.5 }, bond: { role: 'percent', share: 0.5 }, equity: { role: 'percent', share: 0 } },
        },
      ],
      transitions: [{ fromMilestone: 'early', toMilestone: 'late', startAge: 31, durationYears: 0 }],
      taxCashId: 'cash',
    });
    const opening = openingOf(100, 100, 8000, 50, 100, 4000, 5000);
    const { state } = runYears(config, opening, [
      yearInput({ age: 30, year: 2026, allowance: 100000 }),
      yearInput({ age: 31, year: 2027, allowance: 100000, fundPrices: { bond: 100, equity: 100 } }),
    ]);
    const equity = state.buckets.find((b) => b.id === 'equity');
    expect(equity).toBeDefined();
    expect(bucketValue(equity!)).toBe(0);
    expect(state.transactions.some((t) => t.kind === 'sale')).toBe(true);
  });
});

describe('annual full rebalance', () => {
  it('restores the reserve after a downturn', () => {
    const config = stdConfig({
      cash: { role: 'fixedReserve', amountToday: 6000 },
      bond: { role: 'percent', share: 0.4 },
      equity: { role: 'percent', share: 0.6 },
    });
    const opening = openingOf(100, 100, 8000, 40, 100, 3200, 6000);
    const { reports } = runYears(config, opening, [
      yearInput({ fundPrices: { bond: 100, equity: 70 }, depositRates: { cash: 0 }, allowance: 100000 }),
    ]);
    const report = reports[0];
    expect(report.trades.some((t) => t.bucketId === 'equity' && t.kind === 'sell')).toBe(true);
    expect(report.valuesNominal.cash).toBeCloseTo(6000, 6);
  });

  it('nets contributions and withdrawals into fewer trades', () => {
    const config = stdConfig({
      cash: { role: 'fixedReserve', amountToday: 5000 },
      bond: { role: 'percent', share: 0.5 },
      equity: { role: 'percent', share: 0.5 },
    });
    const opening = openingOf(100, 100, 8000, 40, 100, 3200, 5000);
    const flat = { fundPrices: { bond: 100, equity: 100 }, depositRates: { cash: 0 } };
    const baseline = runYears(config, opening, [yearInput({ ...flat, allowance: 100000 })]);
    const netted = runYears(config, opening, [
      yearInput({ ...flat, allowance: 100000, contribution: 10000, withdrawalNeed: 6000 }),
    ]);
    expect(baseline.reports[0].trades.length).toBeLessThanOrEqual(2);
    expect(netted.reports[0].trades.length).toBeLessThanOrEqual(4);
    for (const run of [baseline, netted]) {
      const seen = new Map<string, Set<string>>();
      for (const t of run.reports[0].trades) {
        if (!seen.has(t.bucketId)) seen.set(t.bucketId, new Set());
        seen.get(t.bucketId)!.add(t.kind);
      }
      for (const kinds of seen.values()) expect(kinds.size).toBeLessThanOrEqual(1);
    }
  });

  it('emits zero transactions in a no-op year', () => {
    const values = { cash: 5000, bond: 3000, equity: 2000 };
    const targets = prefillTargetsFromHoldings(values, { cash: 'deposit', bond: 'bondFund', equity: 'equityFund' });
    const config = stdConfig(targets);
    const opening = openingOf(20, 100, 1600, 30, 100, 2400, 5000);
    const { reports } = runYears(config, opening, [yearInput({ allowance: 100000 })]);
    expect(reports[0].trades).toEqual([]);
  });
});

describe('initial allocation', () => {
  it('treats exact prefill as a no-op within the same tax year', () => {
    const values = { cash: 4000, bond: 4000, equity: 8000 };
    const targets = prefillTargetsFromHoldings(values, { cash: 'deposit', bond: 'bondFund', equity: 'equityFund' });
    const config = stdConfig(targets);
    const opening = openingOf(80, 100, 6400, 40, 100, 3200, 4000);
    const initial = createLifecycleState(config, 2026, opening);
    const { state, report } = simulateLifecycleYear(config, initial, yearInput({ allowance: 1000 }));
    expect(report.trades).toEqual([]);
    expect(state.taxYears).toHaveLength(1);
    expect(state.taxYears[0].allowanceUsed).toBe(0);
  });

  it('records non-prefilled opening trades in year zero without a new allowance', () => {
    const config = stdConfig({
      cash: { role: 'percent', share: 0.2 },
      bond: { role: 'percent', share: 0.3 },
      equity: { role: 'percent', share: 0.5 },
    });
    const opening = openingOf(20, 100, 1600, 30, 100, 2400, 11000);
    const initial = createLifecycleState(config, 2026, opening);
    const { state, report } = simulateLifecycleYear(config, initial, yearInput({ allowance: 1000 }));
    expect(report.trades.length).toBeGreaterThan(0);
    for (const income of state.taxIncome) expect(income.ledgerYear).toBe(2026);
    expect(state.taxYears).toHaveLength(1);
    const fund = state.buckets.find((b) => b.id === 'equity');
    expect(fund).toBeDefined();
  });

  it('funds explicit targets at zero wealth from the year-zero contribution', () => {
    const config = stdConfig({
      cash: { role: 'percent', share: 0.2 },
      bond: { role: 'percent', share: 0.3 },
      equity: { role: 'percent', share: 0.5 },
    });
    const opening: OpeningBucket[] = [
      { id: 'cash', name: 'Cash', classification: 'deposit', value: 0 },
      { id: 'bond', name: 'Bond', classification: 'bondFund', units: 0, price: 100, acquisitionCost: 0 },
      { id: 'equity', name: 'Equity', classification: 'equityFund', units: 0, price: 100, acquisitionCost: 0 },
    ];
    const { reports, state } = runYears(config, opening, [yearInput({ contribution: 12000, allowance: 100000 })]);
    expect(reports[0].closingValue).toBeCloseTo(12000, 6);
    expect(totalValue(state)).toBeCloseTo(12000, 6);
    expect(() => prefillTargetsFromHoldings({ cash: 0, bond: 0, equity: 0 }, { cash: 'deposit', bond: 'bondFund', equity: 'equityFund' })).toThrow(/zero wealth/);
  });
});

describe('savings routing', () => {
  it('fills reserve shortfalls in priority order before percent buckets', () => {
    const config: LifecycleConfig = {
      buckets: [
        { id: 'cash', name: 'Cash', kind: 'deposit', priority: 1 },
        { id: 'reserve2', name: 'Reserve2', kind: 'deposit', priority: 2 },
        { id: 'equity', name: 'Equity', kind: 'equityFund', priority: 3 },
      ],
      milestones: [{
        name: 'all', startAge: 30,
        targets: {
          cash: { role: 'fixedReserve', amountToday: 10000 },
          reserve2: { role: 'fixedReserve', amountToday: 10000 },
          equity: { role: 'percent', share: 1 },
        },
      }],
      transitions: [],
      taxCashId: 'cash',
    };
    const opening: OpeningBucket[] = [
      { id: 'cash', name: 'Cash', classification: 'deposit', value: 4000 },
      { id: 'reserve2', name: 'Reserve2', classification: 'deposit', value: 0 },
      { id: 'equity', name: 'Equity', classification: 'equityFund', units: 0, price: 100, acquisitionCost: 0 },
    ];
    const { reports } = runYears(config, opening, [
      yearInput({ fundPrices: { equity: 100 }, depositRates: { cash: 0, reserve2: 0 }, contribution: 8000, allowance: 100000 }),
    ]);
    expect(reports[0].valuesNominal.cash).toBeCloseTo(10000, 6);
    expect(reports[0].valuesNominal.reserve2).toBeCloseTo(2000, 6);
    expect(reports[0].valuesNominal.equity).toBe(0);
  });

  it('keeps an all-targets-met contribution in cash with zero sales', () => {
    const config: LifecycleConfig = {
      buckets: [
        { id: 'cash', name: 'Cash', kind: 'deposit', priority: 1 },
        { id: 'bond', name: 'Bond', kind: 'bondFund', priority: 2 },
      ],
      milestones: [{
        name: 'all', startAge: 30,
        targets: { cash: { role: 'fixedReserve', amountToday: 5000 }, bond: { role: 'fixedReserve', amountToday: 9000 } },
      }],
      transitions: [],
      taxCashId: 'cash',
    };
    const opening: OpeningBucket[] = [
      { id: 'cash', name: 'Cash', classification: 'deposit', value: 5000 },
      { id: 'bond', name: 'Bond', classification: 'bondFund', units: 90, price: 100, acquisitionCost: 9000 },
    ];
    const { reports } = runYears(config, opening, [
      yearInput({ fundPrices: { bond: 100 }, depositRates: { cash: 0 }, contribution: 2000, allowance: 100000 }),
    ]);
    expect(reports[0].valuesNominal.cash).toBeCloseTo(7000, 6);
    expect(reports[0].trades.some((t) => t.kind === 'sell')).toBe(false);
  });
});

describe('withdrawal ordering and after-tax targets', () => {
  // Opening wealth is W0 = 20000 with the withdrawal pre-staged as settlement overweight:
  // WTO anchor0 = W0 - S gives bond/equity targets exactly equal to holdings, so the
  // opening rebalance is empty and the closing unified execution alone funds the
  // withdrawal: cash first, then the overweight sale, never the underweight bucket.
  const diverging = (withdrawalNeed: number, allowance: number) => {
    const config = stdConfig({
      cash: { role: 'fixedReserve', amountToday: 5000 },
      bond: { role: 'percent', share: 0.5 },
      equity: { role: 'percent', share: 0.5 },
    });
    const half = (15000 - withdrawalNeed) / 2;
    return {
      config,
      half,
      opening: openingOf(half / 100, 100, half * 0.8, half / 100, 100, half * 0.8, 5000 + withdrawalNeed),
      input: yearInput({
        withdrawalNeed, allowance,
        fundPrices: { bond: 50, equity: 140 },
      }),
    };
  };

  it('draws overweight cash before overweight equity and spares underweight bond', () => {
    const { config, opening, input } = diverging(1000, 100000);
    const { reports } = runYears(config, opening, [input]);
    const report = reports[0];
    expect(report.trades.filter((t) => t.bucketId === 'cash')).toEqual([]);
    expect(report.withdrawal).toBe(1000);
    expect(report.unfundedWithdrawal).toBe(0);
    const sold = new Set(report.trades.filter((t) => t.kind === 'sell').map((t) => t.bucketId));
    expect(sold.has('bond')).toBe(false);
    expect(sold.has('equity')).toBe(true);
  });

  it('resolves accepted targets against wealth after spending and taxes', () => {
    const { config, opening, input, half } = diverging(1000, 100000);
    const taxed = { ...input, allowance: 100 };
    void half;
    const { reports } = runYears(config, opening, [taxed]);
    const report = reports[0];
    const targetSum = Object.values(report.targetsNominal).reduce((n, v) => n + v, 0);
    expect(targetSum).toBeLessThanOrEqual(report.anchorNominal + 1e-6);
    // Independent market delta from the staged units (half/100 each side).
    const units = half / 100;
    const marketDelta = units * (50 - 100) + units * (140 - 100);
    expect(report.anchorNominal).toBeCloseTo(report.openingValue + marketDelta - report.withdrawal - report.taxPaid, 4);
    expect(report.closingValue).toBeCloseTo(report.anchorNominal, 2);
    const byBucket = new Map<string, Set<string>>();
    for (const t of report.trades) {
      if (!byBucket.has(t.bucketId)) byBucket.set(t.bucketId, new Set());
      byBucket.get(t.bucketId)!.add(t.kind);
    }
    for (const kinds of byBucket.values()) expect(kinds.size).toBeLessThanOrEqual(1);
  });

  it('never double-books trial sales and surfaces insufficiency', () => {
    const { config, opening, input } = diverging(1000, 500);
    const initial = createLifecycleState(config, 2026, opening);
    const before = structuredClone(initial);
    const { state, report } = simulateLifecycleYear(config, initial, input);
    expect(initial).toEqual(before);
    expect(state.eventIds.some((id) => id.includes('trial'))).toBe(false);
    expect(report.iterations).toBeGreaterThanOrEqual(1);
    const sales = state.transactions.filter((t) => t.kind === 'sale').length;
    const buys = state.transactions.filter((t) => t.kind === 'purchase').length;
    expect(sales + buys).toBeLessThanOrEqual(report.trades.length + 2);

    const broke = simulateLifecycleYear(config, state, yearInput({
      age: 31, year: 2027, withdrawalNeed: totalValue(state) + 5000, allowance: 100000,
      fundPrices: { bond: 50, equity: 140 },
    }));
    expect(broke.report.unfundedWithdrawal).toBeCloseTo(5000, 6);
    expect(broke.report.withdrawal).toBeLessThanOrEqual(totalValue(state) + 1e-6);
    for (const b of broke.state.buckets) expect(bucketValue(b)).toBeGreaterThanOrEqual(-1e-9);
    expect(broke.report.unpaidTax).toBeGreaterThanOrEqual(0);
  });
});

describe('bank deposits', () => {
  it('credits interest once and leaves principal moves untaxed', () => {
    const config: LifecycleConfig = {
      buckets: [
        { id: 'cash', name: 'Cash', kind: 'deposit', priority: 1 },
        { id: 'savings', name: 'Savings', kind: 'deposit', priority: 2 },
        { id: 'equity', name: 'Equity', kind: 'equityFund', priority: 3 },
      ],
      milestones: [{
        name: 'all', startAge: 30,
        targets: {
          cash: { role: 'percent', share: 0.5 },
          savings: { role: 'percent', share: 0.3 },
          equity: { role: 'percent', share: 0.2 },
        },
      }],
      transitions: [],
      taxCashId: 'cash',
    };
    const opening: OpeningBucket[] = [
      { id: 'cash', name: 'Cash', classification: 'deposit', value: 5000 },
      { id: 'savings', name: 'Savings', classification: 'deposit', value: 3000 },
      { id: 'equity', name: 'Equity', classification: 'equityFund', units: 20, price: 100, acquisitionCost: 1600 },
    ];
    const prefilled = prefillTargetsFromHoldings(
      { cash: 5000, savings: 3000, equity: 2000 },
      { cash: 'deposit', savings: 'deposit', equity: 'equityFund' },
    );
    const exact = stdConfig(prefilled);
    void exact;
    const initial = createLifecycleState(config, 2026, opening);
    const before = structuredClone(initial);
    const equityBefore = before.buckets.find((b) => b.id === 'equity');
    const basisBefore = equityBefore?.classification !== 'deposit'
      ? equityBefore!.cohorts.reduce((n, c) => n + c.basis, 0)
      : 0;
    const { state } = simulateLifecycleYear(config, initial, yearInput({
      fundPrices: { equity: 100 }, depositRates: { cash: 0.02, savings: 0.04 }, allowance: 100000,
    }));
    const interest = state.taxIncome.filter((r) => r.kind === 'interest');
    expect(interest).toHaveLength(2);
    expect(interest.find((r) => r.bucketId === 'cash')?.gross).toBeCloseTo(100, 9);
    expect(interest.find((r) => r.bucketId === 'savings')?.gross).toBeCloseTo(120, 9);
    // Principal moves are income-free: only interest records exist, and the engine never
    // mutates its input. Fund basis moves only by executed purchase euros.
    expect(state.taxIncome.every((r) => r.kind === 'interest')).toBe(true);
    expect(before).toEqual(initial);
    const equityAfter = state.buckets.find((b) => b.id === 'equity');
    const basisAfter = equityAfter?.classification !== 'deposit'
      ? equityAfter!.cohorts.reduce((n, c) => n + c.basis, 0)
      : 0;
    const bought = state.transactions
      .filter((t) => t.kind === 'purchase')
      .reduce((n, t) => n + t.basis, 0);
    expect(basisAfter - basisBefore).toBeCloseTo(bought, 9);
  });
});

describe('future holdings', () => {
  const futureConfig = (): LifecycleConfig => ({
    buckets: stdBuckets(),
    milestones: [
      {
        name: 'early', startAge: 30,
        targets: { cash: { role: 'percent', share: 0.5 }, bond: { role: 'percent', share: 0 }, equity: { role: 'percent', share: 0.5 } },
      },
      {
        name: 'late', startAge: 32,
        targets: { cash: { role: 'percent', share: 0.4 }, bond: { role: 'percent', share: 0.3 }, equity: { role: 'percent', share: 0.3 } },
      },
    ],
    transitions: [{ fromMilestone: 'early', toMilestone: 'late', startAge: 32, durationYears: 0 }],
    taxCashId: 'cash',
  });

  it('buys a future bucket with fresh cohorts and keeps emptied buckets', () => {
    const opening = openingOf(50, 100, 4000, 0, 100, 0, 5000);
    const years = [2026, 2027, 2028].map((year, i) => yearInput({
      age: 30 + i, year, allowance: 100000, fundPrices: { bond: 100, equity: 100 }, depositRates: { cash: 0 },
    }));
    const { state } = runYears(futureConfig(), opening, years);
    const bond = state.buckets.find((b) => b.id === 'bond');
    if (!bond || bond.classification === 'deposit') throw new Error('Test setup: bond bucket missing');
    expect(bond.cohorts.length).toBeGreaterThan(0);
    for (const c of bond.cohorts) {
      expect(c.acquiredYear).toBeGreaterThanOrEqual(2028);
      expect(c.assessedVP).toBe(0);
    }
    expect(bucketValue(bond)).toBeGreaterThan(0);
  });

  it('throws pre-mutation on incomplete price maps', () => {
    const config = futureConfig();
    const opening = openingOf(50, 100, 4000, 0, 100, 0, 5000);
    const initial = createLifecycleState(config, 2026, opening);
    const before = structuredClone(initial);
    expect(() => simulateLifecycleYear(config, initial, yearInput({ fundPrices: { equity: 100 } as Record<string, number> }))).toThrow(/fundPrices/);
    expect(initial).toEqual(before);
  });
});

describe('terminal liquidation', () => {
  it('settles within the horizon with no new allowance and real conversion', () => {
    const config = stdConfig({
      cash: { role: 'percent', share: 0.2 },
      bond: { role: 'percent', share: 0.3 },
      equity: { role: 'percent', share: 0.5 },
    });
    const opening = openingOf(80, 100, 6400, 40, 100, 3200, 4000);
    const years = Array.from({ length: 10 }, (_, i) => yearInput({
      age: 30 + i, year: 2026 + i, allowance: 200,
      fundPrices: { bond: 100 + 2 * (i + 1), equity: 100 + 5 * (i + 1) },
      basisRate: 0.025, inflationFactor: 1 + 0.02 * i,
    }));
    const { state } = runYears(config, opening, years);
    const yearsBefore = state.taxYears.length;
    const inflation = 1.2;
    const result = liquidateLifecycle(state, 'cash', inflation);
    expect(result.state.taxYears).toHaveLength(yearsBefore);
    expect(result.real).toBeCloseTo(result.nominal / inflation, 9);
    const lifetimeLiability = result.state.taxYears.reduce((n, t) => n + t.liability, 0);
    const lifetimePaid = result.state.taxYears.reduce((n, t) => n + t.paid, 0);
    expect(lifetimePaid + result.outstandingLiability).toBeCloseTo(lifetimeLiability, 6);
  });

  it('keeps terminal losses as balances without refund credit', () => {
    const config = stdConfig({
      cash: { role: 'percent', share: 0.1 },
      bond: { role: 'percent', share: 0.1 },
      equity: { role: 'percent', share: 0.8 },
    });
    const opening = openingOf(100, 100, 10000, 10, 100, 1000, 1000);
    const years = [2026, 2027].map((year, i) => yearInput({
      age: 30 + i, year, allowance: 0,
      fundPrices: { bond: 90 - 10 * i, equity: 60 - 10 * i },
      basisRate: 0,
    }));
    const { state } = runYears(config, opening, years);
    const result = liquidateLifecycle(state, 'cash', 1);
    const loss = result.state.taxYears.reduce((n, t) => n + t.loss, 0);
    expect(loss).toBeGreaterThan(0);
    expect(result.outstandingLiability).toBe(0);
    expect(result.nominal).toBeCloseTo(totalValue(result.state), 6);
  });
});

describe('timing identity and acquisition months', () => {
  it('conserves W_close = W0 + M + C - S - T_paid', () => {
    // Net-zero flows (C == S) keep the opening rebalance empty, so the market move
    // applies to the raw opening balances and the hand-computed M is exact.
    const config = stdConfig({
      cash: { role: 'percent', share: 0.25 },
      bond: { role: 'percent', share: 0.25 },
      equity: { role: 'percent', share: 0.5 },
    });
    const opening = openingOf(80, 100, 6400, 40, 100, 3200, 4000);
    const initial = createLifecycleState(config, 2026, opening);
    const input = yearInput({
      fundPrices: { bond: 110, equity: 120 }, depositRates: { cash: 0.03 },
      contribution: 1500, withdrawalNeed: 1500, allowance: 100,
    });
    const expectedMarket = 80 * (120 - 100) + 40 * (110 - 100) + 4000 * 0.03;
    const { report } = simulateLifecycleYear(config, initial, input);
    for (const trade of report.trades) expect(trade.euros).toBeGreaterThanOrEqual(0.01);
    expect(report.closingValue).toBeCloseTo(
      report.openingValue + expectedMarket + 1500 - report.withdrawal - report.taxPaid, 4,
    );
  });

  it('stamps opening purchases with month 1 and closing purchases with month 12', () => {
    const config = stdConfig({
      cash: { role: 'percent', share: 0.1 },
      bond: { role: 'percent', share: 0.1 },
      equity: { role: 'percent', share: 0.8 },
    });
    const opening = openingOf(10, 100, 1000, 10, 100, 1000, 14000);
    const initial = createLifecycleState(config, 2026, opening);
    const { state } = simulateLifecycleYear(config, initial, yearInput({
      fundPrices: { bond: 100, equity: 100 }, allowance: 100000,
    }));
    const equity = state.buckets.find((b) => b.id === 'equity');
    if (!equity || equity.classification === 'deposit') throw new Error('Test setup: equity bucket missing');
    expect(equity.cohorts.some((c) => c.acquiredYear === 2026 && c.acquiredMonth === 1)).toBe(true);
    const second = simulateLifecycleYear(config, state, yearInput({
      age: 31, year: 2027, contribution: 5000,
      fundPrices: { bond: 100, equity: 100 }, allowance: 100000,
    }));
    const equity2 = second.state.buckets.find((b) => b.id === 'equity');
    if (!equity2 || equity2.classification === 'deposit') throw new Error('Test setup: equity bucket missing');
    const late = equity2.cohorts.filter((c) => c.acquiredYear === 2027);
    expect(late.length).toBeGreaterThan(0);
    for (const c of late) expect(c.acquiredMonth).toBe(12);
  });
});

describe('conservation suite', () => {
  it('rolls wealth, basis and tax state forward without invention', () => {
    const config = stdConfig({
      cash: { role: 'fixedReserve', amountToday: 5000 },
      bond: { role: 'percent', share: 0.5 },
      equity: { role: 'percent', share: 0.5 },
    });
    const opening = openingOf(80, 100, 6400, 40, 100, 3200, 5000);
    const years = Array.from({ length: 5 }, (_, i) => yearInput({
      age: 30 + i, year: 2026 + i, allowance: 500,
      contribution: i % 2 === 0 ? 1000 : 0, withdrawalNeed: i % 2 === 1 ? 800 : 0,
      fundPrices: { bond: 100 + 3 * i, equity: 100 + 7 * i },
      depositRates: { cash: 0.01 }, inflationFactor: 1 + 0.02 * i,
    }));
    const { state, reports } = runYears(config, opening, years);
    for (let i = 1; i < reports.length; i++) {
      expect(reports[i].openingValue).toBeCloseTo(reports[i - 1].closingValue, 9);
    }
    for (const report of reports) {
      expect(report.closingValue).toBeCloseTo(report.anchorNominal, 2);
      const targetSum = Object.values(report.targetsNominal).reduce((n, v) => n + v, 0);
      expect(targetSum).toBeLessThanOrEqual(report.anchorNominal + 1e-6);
      for (const v of Object.values(report.valuesNominal)) expect(v).toBeGreaterThanOrEqual(-1e-9);
    }
    expect(state.phase).toBe('closed');
    for (const pending of state.pending) expect(pending.holdingYear).toBe(2030);
    expect(unpaidTax(state)).toBeGreaterThanOrEqual(0);
    const saleGains = state.taxIncome.filter((r) => r.kind === 'sale');
    for (const record of saleGains) {
      expect(record.amount).toBeLessThanOrEqual(record.gross + 1e-9);
    }
  });
});

describe('inactivity and isolation', () => {
  it('imports only the investmentTax barrel', () => {
    const modules = import.meta.glob('./*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    const files = Object.entries(modules).filter(([file]) => !file.endsWith('.test.ts'));
    expect(files.length).toBeGreaterThan(0);
    for (const [file, source] of files) {
      for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        const spec = match[1];
        if (spec.startsWith('../')) {
          expect(spec).toBe('../investmentTax/index.js');
        } else if (spec.startsWith('./') || spec.startsWith('node:')) {
          continue;
        } else {
          throw new Error(`Forbidden import ${spec} in ${file}`);
        }
        expect(spec).not.toMatch(/simulateAccumulation|portfolioBuckets|capitalIncome|hooks|components|recharts|react/i);
      }
      expect(source).not.toMatch(/localStorage|window\.|document\./);
    }
  });
});
