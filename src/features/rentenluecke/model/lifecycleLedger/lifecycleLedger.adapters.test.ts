import { describe, expect, it, vi } from 'vitest';
import {
  applyAnnualPricesAndInterest,
  beginInvestmentYear,
  closeWithPendingVP,
  createInvestmentState,
  reconcileTax,
} from '../investmentTax/index.js';
import type { InvestmentState } from '../investmentTax/index.js';
import type { OpeningBucket } from '../investmentTax/index.js';
import { calculateContributions } from '../contributions/contributionEngine.js';
import { liquidateLifecycle } from '../lifecycleAllocation/index.js';
import type { LifecycleBucketDef, LifecycleConfig } from '../lifecycleAllocation/index.js';
import {
  assessTerminalInsurance,
  buildContributionInput,
  createLedgerState,
  cumulativeInflationFactors,
  ledgerSurvives,
  liquidationAssessableGain,
  runLedgerBootstrap,
  runLedgerDeterministic,
  searchLedgerCapital,
  simulateLedger,
  simulateLedgerYear,
} from './index.js';
import * as terminalInsuranceModule from './terminalInsurance.js';
import { RequiredCapitalCalculationError } from './index.js';
import type { LedgerInsuranceSpec, LedgerYearInput } from './index.js';

const buckets: LifecycleBucketDef[] = [
  { id: 'cash', name: 'Cash', kind: 'deposit', priority: 1 },
  { id: 'bond', name: 'Bond fund', kind: 'bondFund', priority: 2 },
  { id: 'equity', name: 'Equity fund', kind: 'equityFund', priority: 3 },
];

function singleMilestoneConfig(): LifecycleConfig {
  return {
    buckets,
    milestones: [
      {
        name: 'only',
        startAge: 30,
        targets: {
          cash: { role: 'percent', share: 0.2 },
          bond: { role: 'percent', share: 0.3 },
          equity: { role: 'percent', share: 0.5 },
        },
      },
    ],
    transitions: [],
    taxCashId: 'cash',
  };
}

function wealthyOpening(): OpeningBucket[] {
  return [
    { id: 'cash', name: 'Cash', classification: 'deposit', value: 18000 },
    { id: 'bond', name: 'Bond fund', classification: 'bondFund', units: 270, price: 100, acquisitionCost: 27000 },
    { id: 'equity', name: 'Equity fund', classification: 'equityFund', units: 450, price: 100, acquisitionCost: 45000 },
  ];
}

function spec(patch: Partial<LedgerInsuranceSpec> = {}): LedgerInsuranceSpec {
  return {
    status: 'voluntary',
    phase: 'pension',
    calendarYear: 2026,
    cashflowBeforeInsuranceMonthly: 2500,
    insurerAdditionalRate: 0.025,
    insuredBirthYear: 1960,
    isParent: false,
    childBirthYears: [],
    statutoryPensions: [],
    occupationalPensions: [],
    rentalAssessmentMonthly: 0,
    drvSubsidy: 'not-received',
    ...patch,
  };
}

function manualZero(calendarYear: number): LedgerInsuranceSpec {
  return spec({ calendarYear, manual: { reason: 'adapter isolation', kvMonthly: 0, pvMonthly: 0 } });
}

function yi(patch: Partial<LedgerYearInput> = {}, age = 66, year = 2026): LedgerYearInput {
  const finalYear = (patch as Partial<LedgerYearInput>).year ?? year;
  const finalAge = (patch as Partial<LedgerYearInput>).age ?? age;
  return {
    age: finalAge,
    year: finalYear,
    contribution: 0,
    withdrawalNeed: 0,
    allowance: 1000,
    churchRate: 0,
    fundPrices: { bond: 100, equity: 100 },
    depositRates: { cash: 0 },
    basisRate: 0.025,
    inflationFactor: 1,
    insurance: manualZero(finalYear),
    ...patch,
  };
}

function runClosedGainYear(): { cfg: LifecycleConfig; base: number } {
  const cfg = singleMilestoneConfig();
  const st = createLedgerState(cfg, 2026, wealthyOpening());
  const r = simulateLedger(cfg, st, [yi({ age: 66, year: 2026, fundPrices: { bond: 100, equity: 150 } })]);
  return { cfg, base: r.reports[0]?.capitalAssessmentAnnual ?? 0 };
}

describe('terminal insurance', () => {
  it('KVdR terminal with large gains creates no new KV/PV charge', () => {
    const { cfg } = runClosedGainYear();
    const st = createLedgerState(cfg, 2026, [
      { id: 'cash', name: 'Cash', classification: 'deposit', value: 20000 },
      { id: 'bond', name: 'Bond fund', classification: 'bondFund', units: 300, price: 100, acquisitionCost: 30000 },
      { id: 'equity', name: 'Equity fund', classification: 'equityFund', units: 2000, price: 100, acquisitionCost: 10000 },
    ]);
    const r = simulateLedger(cfg, st, [yi({ age: 66, year: 2026, fundPrices: { bond: 100, equity: 100 } })]);
    const res = assessTerminalInsurance({
      state: r.state,
      taxCashId: 'cash',
      cumulativeInflation: 1,
      spec: spec({ status: 'kvdr', statutoryPensions: [{ id: 'pension', grossMonthly: 1500 }] }),
      baseCapitalAssessmentAnnual: 0,
    });
    expect(res.liquidationAssessableGain).toBeGreaterThan(50000);
    expect(res.incrementalKvAnnual).toBe(0);
    expect(res.incrementalPvAnnual).toBe(0);
    expect(res.assumption).toBe('kvdr-no-new-charge');
  });

  it('voluntary terminal increment equals the with-minus-without difference', () => {
    const { cfg } = runClosedGainYear();
    const st = createLedgerState(cfg, 2026, wealthyOpening());
    const r = simulateLedger(cfg, st, [yi({ age: 66, year: 2026, fundPrices: { bond: 100, equity: 120 } })]);
    const base = r.reports[0]?.capitalAssessmentAnnual ?? 0;
    const s = spec({});
    const res = assessTerminalInsurance({ state: r.state, taxCashId: 'cash', cumulativeInflation: 1, spec: s, baseCapitalAssessmentAnnual: base });
    const oracleBase = calculateContributions(buildContributionInput(s, base, 1));
    const oracleAug = calculateContributions(buildContributionInput(s, base + res.liquidationAssessableGain, 1));
    if (oracleBase.status !== 'automatic' || oracleAug.status !== 'automatic') throw new Error('oracle setup failed');
    expect(res.incrementalKvAnnual).toBeCloseTo(oracleAug.ownKvMonthly * 12 - oracleBase.ownKvMonthly * 12, 6);
    expect(res.incrementalPvAnnual).toBeCloseTo(oracleAug.ownPvMonthly * 12 - oracleBase.ownPvMonthly * 12, 6);
    expect(res.assumption).toBe('continuing-voluntary-annual-assessment');
  });

  it('no second minimum is charged when the minimum is already satisfied', () => {
    const cfg = singleMilestoneConfig();
    const st = createLedgerState(cfg, 2026, wealthyOpening());
    const r = simulateLedger(cfg, st, [yi({ age: 66, year: 2026, fundPrices: { bond: 100, equity: 120 } })]);
    const s = spec({ statutoryPensions: [{ id: 'pension', grossMonthly: 5000 }] });
    const res = assessTerminalInsurance({
      state: r.state,
      taxCashId: 'cash',
      cumulativeInflation: 1,
      spec: s,
      baseCapitalAssessmentAnnual: 0,
    });
    const oracleBase = calculateContributions(buildContributionInput(s, 0, 1));
    const oracleAug = calculateContributions(buildContributionInput(s, res.liquidationAssessableGain, 1));
    if (oracleBase.status !== 'automatic' || oracleAug.status !== 'automatic') throw new Error('oracle setup failed');
    const minOf = (x: typeof oracleBase) => x.assessment.find((l) => l.kind === 'minimum-top-up')?.kvContributionMonthly ?? NaN;
    expect(minOf(oracleBase)).toBeCloseTo(0, 9);
    expect(minOf(oracleAug)).toBeCloseTo(0, 9);
    expect(res.incrementalKvAnnual).toBeCloseTo(oracleAug.ownKvMonthly * 12 - oracleBase.ownKvMonthly * 12, 6);
  });

  it('ceiling binding caps the terminal increment', () => {
    const cfg = singleMilestoneConfig();
    const st = createLedgerState(cfg, 2026, wealthyOpening());
    const r = simulateLedger(cfg, st, [yi({ age: 66, year: 2026, fundPrices: { bond: 100, equity: 150 } })]);
    const s = spec({ statutoryPensions: [{ id: 'pension', grossMonthly: 20000 }] });
    const res = assessTerminalInsurance({
      state: r.state,
      taxCashId: 'cash',
      cumulativeInflation: 1,
      spec: s,
      baseCapitalAssessmentAnnual: 0,
    });
    expect(res.ceilingBinding).toBe(true);
    expect(res.incrementalKvAnnual).toBeCloseTo(0, 6);
    expect(res.incrementalPvAnnual).toBeCloseTo(0, 6);
    expect(res.incrementalKvAnnual).toBeLessThan(res.liquidationAssessableGain * 0.2);
  });

  it('bond versus equity exemption is respected at the terminal', () => {
    const terminalOnlyState = (
      opening: OpeningBucket[],
      prices: Record<string, number>,
    ): InvestmentState => {
      let st = createInvestmentState(2026, opening);
      st = beginInvestmentYear(st, 2026, 1000, 0);
      st = applyAnnualPricesAndInterest(st, prices, { cash: 0 });
      st = reconcileTax(st, 'cash', 'seed:terminal:tax');
      st = closeWithPendingVP(st, prices, 0.025);
      return st;
    };
    const equityState = terminalOnlyState(
      [
        { id: 'cash', name: 'Cash', classification: 'deposit', value: 18000 },
        { id: 'bond', name: 'Bond fund', classification: 'bondFund', units: 270, price: 100, acquisitionCost: 27000 },
        { id: 'equity', name: 'Equity fund', classification: 'equityFund', units: 225, price: 200, acquisitionCost: 31500 },
      ],
      { bond: 100, equity: 200 },
    );
    const bondState = terminalOnlyState(
      [
        { id: 'cash', name: 'Cash', classification: 'deposit', value: 18000 },
        { id: 'bond', name: 'Bond fund', classification: 'bondFund', units: 135, price: 200, acquisitionCost: 13500 },
        { id: 'equity', name: 'Equity fund', classification: 'equityFund', units: 450, price: 100, acquisitionCost: 45000 },
      ],
      { bond: 200, equity: 100 },
    );
    const s = () => spec({ rentalAssessmentMonthly: 2000 });
    const resEquity = assessTerminalInsurance({
      state: equityState,
      taxCashId: 'cash',
      cumulativeInflation: 1,
      spec: s(),
      baseCapitalAssessmentAnnual: 0,
    });
    const resBond = assessTerminalInsurance({
      state: bondState,
      taxCashId: 'cash',
      cumulativeInflation: 1,
      spec: s(),
      baseCapitalAssessmentAnnual: 0,
    });
    expect(resEquity.liquidationAssessableGain).toBeCloseTo(13500 * 0.7, 0);
    expect(resBond.liquidationAssessableGain).toBeCloseTo(13500, 0);
    expect(resEquity.incrementalKvAnnual).toBeLessThan(resBond.incrementalKvAnnual);
    expect(resEquity.incrementalPvAnnual).toBeLessThan(resBond.incrementalPvAnnual);
  });

  it('terminal assessment is idempotent and leaves the continuation state untouched', () => {
    const { cfg } = runClosedGainYear();
    const st = createLedgerState(cfg, 2026, wealthyOpening());
    const r = simulateLedger(cfg, st, [yi({ age: 66, year: 2026, fundPrices: { bond: 100, equity: 120 } })]);
    const before = JSON.stringify(r.state);
    const args = { state: r.state, taxCashId: 'cash', cumulativeInflation: 1, spec: spec({}), baseCapitalAssessmentAnnual: 0 };
    const first = assessTerminalInsurance(args);
    const second = assessTerminalInsurance(args);
    expect(second).toEqual(first);
    expect(JSON.stringify(r.state)).toBe(before);
  });

  it('terminated state rejects further begins, liquidations and terminal assessments', () => {
    const { cfg } = runClosedGainYear();
    const st = createLedgerState(cfg, 2026, wealthyOpening());
    const r = simulateLedger(cfg, st, [yi({ age: 66, year: 2026 })]);
    const done = liquidateLifecycle(r.state, 'cash', 1);
    expect(done.state.phase).toBe('terminated');
    expect(() => liquidateLifecycle(done.state, 'cash', 1)).toThrow();
    expect(() => beginInvestmentYear(done.state, 2027, 1000, 0)).toThrow();
    expect(() =>
      assessTerminalInsurance({ state: done.state, taxCashId: 'cash', cumulativeInflation: 1, spec: spec({}), baseCapitalAssessmentAnnual: 0 }),
    ).toThrow();
  });

  it('afterHoldingCutoff sensitivity includes the current-year pending VP', () => {
    const cfg = singleMilestoneConfig();
    const st = createLedgerState(cfg, 2026, wealthyOpening());
    const r = simulateLedger(cfg, st, [yi({ age: 66, year: 2026, fundPrices: { bond: 100, equity: 150 } })]);
    expect(r.state.pending.length).toBeGreaterThan(0);
    const before = liquidationAssessableGain(r.state, 'cash', 1, 'beforeHoldingCutoff');
    const after = liquidationAssessableGain(r.state, 'cash', 1, 'afterHoldingCutoff');
    expect(after.gain).toBeGreaterThan(before.gain);
  });
});

describe('deterministic adapter', () => {
  it('rejects mismatched first year and inexact price coverage', () => {
    const cfg = singleMilestoneConfig();
    expect(() => runLedgerDeterministic(cfg, wealthyOpening(), 2027, [yi({}, 66, 2026)])).toThrow();
    expect(() =>
      runLedgerDeterministic(cfg, wealthyOpening(), 2026, [yi({ fundPrices: { bond: 100 } }, 66, 2026)]),
    ).toThrow();
  });

  it('compounds cumulative inflation factors', () => {
    const factors = cumulativeInflationFactors([0.02, 0.02, 0.02]);
    expect(factors.length).toBe(3);
    factors.forEach((f, i) => expect(f).toBeCloseTo(1.02 ** (i + 1), 12));
    expect(() => cumulativeInflationFactors([0.02, -1])).toThrow();
  });

  it('zero-price purchases are rejected explicitly', () => {
    const cfg = singleMilestoneConfig();
    const st = createLedgerState(cfg, 2026, wealthyOpening());
    const before = JSON.stringify(st);
    expect(() =>
      simulateLedgerYear(
        cfg,
        st,
        yi({ age: 66, year: 2026, contribution: 50000, allowance: 100000, fundPrices: { bond: 100, equity: 0 } }),
      ),
    ).toThrow(/zero-price/i);
    expect(JSON.stringify(st)).toBe(before);
  });
});

describe('bootstrap adapter', () => {
  function threeYears(): LedgerYearInput[] {
    return [0, 1, 2].map((i) =>
      yi({ allowance: 100000, fundPrices: { bond: 100 + i, equity: 100 + 2 * i }, inflationFactor: 1.02 ** (i + 1) }, 66 + i, 2026 + i),
    );
  }

  it('degenerate path matches the deterministic ledger and survives() agrees', () => {
    const cfg = singleMilestoneConfig();
    const years = threeYears();
    const ref = runLedgerDeterministic(cfg, wealthyOpening(), 2026, years);
    const out = runLedgerBootstrap(cfg, wealthyOpening(), 2026, years, [
      { years: years.map((y) => ({ fundPrices: y.fundPrices, depositRates: y.depositRates, inflationFactor: y.inflationFactor })) },
    ]);
    expect(out.failureCount).toBe(0);
    expect(out.summaryBlocked).toBe(false);
    expect(out.paths[0]?.status).toBe('survived');
    const refClose = ref.reports.at(-1)?.closingValue ?? NaN;
    if (out.paths[0]?.status === 'survived') {
      expect(out.paths[0].closingValue).toBeCloseTo(refClose, 6);
    } else {
      throw new Error('degenerate path should survive');
    }
    expect(ledgerSurvives(cfg, wealthyOpening(), years, 1.02 ** 3)).toBe(true);
  });

  it('precomputed reference is byte-identical to the recomputed reference', () => {
    const cfg = singleMilestoneConfig();
    const years = threeYears();
    const opening = wealthyOpening();
    const reference = runLedgerDeterministic(cfg, opening, 2026, years);
    const pathInput = [
      { years: years.map((y) => ({ fundPrices: y.fundPrices, depositRates: y.depositRates, inflationFactor: y.inflationFactor })) },
    ];
    const direct = runLedgerBootstrap(cfg, wealthyOpening(), 2026, years, pathInput);
    const threaded = runLedgerBootstrap(cfg, wealthyOpening(), 2026, years, pathInput, reference);
    expect(threaded.reference).toBe(reference);
    expect(JSON.stringify(threaded)).toBe(JSON.stringify(direct));
  });

  it('failed paths block the summary while the reference still completes', () => {
    const cfg = singleMilestoneConfig();
    const years = threeYears();
    const out = runLedgerBootstrap(cfg, wealthyOpening(), 2026, years, [
      { years: years.map((y) => ({ fundPrices: y.fundPrices, depositRates: y.depositRates, inflationFactor: y.inflationFactor })) },
      { years: years.slice(0, 2).map((y) => ({ fundPrices: y.fundPrices, depositRates: y.depositRates, inflationFactor: y.inflationFactor })) },
    ]);
    expect(out.reference.reports.length).toBe(3);
    expect(out.failureCount).toBe(1);
    expect(out.summaryBlocked).toBe(true);
    expect(out.paths[1]?.status).toBe('failed');
  });

  it('missing buckets fail closed and depletion differs from failure', () => {
    const cfg = singleMilestoneConfig();
    const years = [0, 1, 2].map((i) =>
      yi(
        { allowance: 100000, withdrawalNeed: 30000, fundPrices: { bond: 100, equity: 100 }, inflationFactor: 1 },
        66 + i,
        2026 + i,
      ),
    );
    const crash = { bond: 1, equity: 1 };
    const out = runLedgerBootstrap(cfg, wealthyOpening(), 2026, years, [
      {
        years: years.map((y) => ({ fundPrices: { bond: 100 }, depositRates: y.depositRates, inflationFactor: y.inflationFactor })),
      },
      {
        years: years.map((y, i) => ({
          fundPrices: i === 2 ? crash : y.fundPrices,
          depositRates: y.depositRates,
          inflationFactor: y.inflationFactor,
        })),
      },
    ]);
    expect(out.paths[0]?.status).toBe('failed');
    if (out.paths[0]?.status === 'failed') expect(out.paths[0].kind).toBe('error');
    expect(out.paths[1]?.status).toBe('depleted');
    expect(out.summaryBlocked).toBe(true);
  });

  it('future holding gains a bootstrap price path', () => {
    const futureCfg: LifecycleConfig = {
      buckets: [
        { id: 'cash', name: 'Cash', kind: 'deposit', priority: 1 },
        { id: 'equity', name: 'Equity fund', kind: 'equityFund', priority: 2 },
        { id: 'future', name: 'Future fund', kind: 'equityFund', priority: 3 },
      ],
      milestones: [
        {
          name: 'only',
          startAge: 30,
          targets: {
            cash: { role: 'percent', share: 0.2 },
            equity: { role: 'percent', share: 0.4 },
            future: { role: 'percent', share: 0.4 },
          },
        },
      ],
      transitions: [],
      taxCashId: 'cash',
    };
    const opening: OpeningBucket[] = [
      { id: 'cash', name: 'Cash', classification: 'deposit', value: 20000 },
      { id: 'equity', name: 'Equity fund', classification: 'equityFund', units: 400, price: 100, acquisitionCost: 40000 },
      { id: 'future', name: 'Future fund', classification: 'equityFund', units: 0, price: 50, acquisitionCost: 0 },
    ];
    const base: LedgerYearInput[] = [0, 1].map((i) =>
      yi(
        { allowance: 100000, fundPrices: { equity: 100, future: 50 + 10 * i }, depositRates: { cash: 0 }, inflationFactor: 1 },
        30 + i,
        2026 + i,
      ),
    );
    const out = runLedgerBootstrap(futureCfg, opening, 2026, base, [
      {
        years: base.map((y) => ({ fundPrices: y.fundPrices, depositRates: y.depositRates, inflationFactor: y.inflationFactor })),
      },
    ]);
    expect(out.failureCount).toBe(0);
    expect(out.paths[0]?.status).toBe('survived');
    expect(out.reference.reports[1]?.valuesNominal['future'] ?? 0).toBeGreaterThan(0);
  });
});

describe('search adapter', () => {
  function spendYears(n: number, need: number): LedgerYearInput[] {
    return Array.from({ length: n }, (_, i) =>
      yi({ allowance: 1_000_000_000, withdrawalNeed: need, inflationFactor: 1, insurance: manualZero(2026 + i) }, 66 + i, 2026 + i),
    );
  }

  function bankConfig(): LifecycleConfig {
    return {
      buckets: [{ id: 'cash', name: 'Cash', kind: 'deposit', priority: 1 }],
      milestones: [{ name: 'only', startAge: 30, targets: { cash: { role: 'percent', share: 1 } } }],
      transitions: [],
      taxCashId: 'cash',
    };
  }

  function bankYears(n: number, need: number): LedgerYearInput[] {
    return Array.from({ length: n }, (_, i) => ({
      age: 66 + i,
      year: 2026 + i,
      contribution: 0,
      withdrawalNeed: need,
      allowance: 1_000_000_000,
      churchRate: 0 as const,
      fundPrices: {},
      depositRates: { cash: 0 },
      basisRate: 0.025,
      inflationFactor: 1,
      insurance: manualZero(2026 + i),
    }));
  }

  function bankOpening(value: number): OpeningBucket[] {
    return [{ id: 'cash', name: 'Cash', classification: 'deposit', value }];
  }

  it('bank-only search converges to the euro bracket', () => {
    const cfg = bankConfig();
    const years = bankYears(10, 20000);
    const res = searchLedgerCapital(cfg, years, { actualOpening: bankOpening(200000), terminalInflation: 1 });
    expect(res.status).toBe('converged');
    if (res.status !== 'converged') throw new Error('bank-only search should converge');
    expect(Math.abs(res.requiredCapital - 200000)).toBeLessThanOrEqual(2);
    expect(ledgerSurvives(cfg, bankOpening(res.requiredCapital), years, 1)).toBe(true);
  });

  it('fixed-reserve search without proof returns unsupported', () => {
    const cfg: LifecycleConfig = {
      ...singleMilestoneConfig(),
      milestones: [
        {
          name: 'only',
          startAge: 30,
          targets: {
            cash: { role: 'fixedReserve', amountToday: 10000 },
            bond: { role: 'percent', share: 0.4 },
            equity: { role: 'percent', share: 0.6 },
          },
        },
      ],
    };
    const res = searchLedgerCapital(cfg, spendYears(3, 5000), {
      actualOpening: [
        { id: 'cash', name: 'Cash', classification: 'deposit', value: 18000 },
        { id: 'bond', name: 'Bond fund', classification: 'bondFund', units: 270, price: 100, acquisitionCost: 27000 },
        { id: 'equity', name: 'Equity fund', classification: 'equityFund', units: 450, price: 100, acquisitionCost: 45000 },
      ],
      terminalInflation: 1,
    });
    expect(res.status).toBe('unsupported');
  });

  it('fixed-reserve search remains unsupported (no proof bypass)', () => {
    const cfg: LifecycleConfig = {
      buckets: [{ id: 'cash', name: 'Cash', kind: 'deposit', priority: 1 }],
      milestones: [{ name: 'only', startAge: 30, targets: { cash: { role: 'fixedReserve', amountToday: 10000 } } }],
      transitions: [],
      taxCashId: 'cash',
    };
    const years = bankYears(3, 5000);
    const res = searchLedgerCapital(cfg, years, { actualOpening: bankOpening(50000), terminalInflation: 1 });
    expect(res.status).toBe('unsupported');
  });

  it('nonmonotone inflation always unsupported (no proof bypass)', () => {
    const cfg = bankConfig();
    const years = bankYears(3, 5000);
    const dipped = years.map((y, i) => ({ ...y, inflationFactor: i === 2 ? 0.9 : 1 }));
    const blocked = searchLedgerCapital(cfg, dipped, { actualOpening: bankOpening(50000), terminalInflation: 1 });
    expect(blocked.status).toBe('unsupported');
  });

  it('zero actual opening remains unsupported', () => {
    const cfg = bankConfig();
    const res = searchLedgerCapital(cfg, bankYears(3, 5000), { actualOpening: bankOpening(0), terminalInflation: 1 });
    expect(res.status).toBe('unsupported');
  });

  it('mixed-fund search remains unsupported (no monotone proof)', () => {
    const cfg = singleMilestoneConfig();
    const res = searchLedgerCapital(cfg, spendYears(3, 5000), {
      actualOpening: [
        { id: 'cash', name: 'Cash', classification: 'deposit', value: 18000 },
        { id: 'bond', name: 'Bond fund', classification: 'bondFund', units: 270, price: 100, acquisitionCost: 27000 },
        { id: 'equity', name: 'Equity fund', classification: 'equityFund', units: 450, price: 100, acquisitionCost: 45000 },
      ],
      terminalInflation: 1,
    });
    expect(res.status).toBe('unsupported');
  });

  it('unfunded candidates fail and impossible bank-only burdens throw a bounding error', () => {
    const cfg = singleMilestoneConfig();
    expect(ledgerSurvives(cfg, wealthyOpening(), spendYears(1, 1_000_000_000), 1)).toBe(false);
    const bankCfg = bankConfig();
    const crushing = bankYears(3, 1000).map((y) => ({
      ...y,
      insurance: spec({ calendarYear: y.year, manual: { reason: 'crushing burden', kvMonthly: 1e12, pvMonthly: 0 } }),
    }));
    expect(() => searchLedgerCapital(bankCfg, crushing, { actualOpening: bankOpening(50000), terminalInflation: 1 })).toThrow(
      RequiredCapitalCalculationError,
    );
    const mixedCrushing = spendYears(3, 1000).map((y) => ({
      ...y,
      insurance: spec({ calendarYear: y.year, manual: { reason: 'crushing burden', kvMonthly: 1e12, pvMonthly: 0 } }),
    }));
    const mixedRes = searchLedgerCapital(cfg, mixedCrushing, {
      actualOpening: [
        { id: 'cash', name: 'Cash', classification: 'deposit', value: 18000 },
        { id: 'bond', name: 'Bond fund', classification: 'bondFund', units: 270, price: 100, acquisitionCost: 27000 },
        { id: 'equity', name: 'Equity fund', classification: 'equityFund', units: 450, price: 100, acquisitionCost: 45000 },
      ],
      terminalInflation: 1,
    });
    expect(mixedRes.status).toBe('unsupported');
  });
});

describe('review fix round 1 (blocking + coordinator ruling)', () => {
  it('solver-exhausted but funded bootstrap path reports failed/nonconvergence and blocks summary', () => {
    const cfg: LifecycleConfig = {
      buckets,
      milestones: [
        {
          name: 'only',
          startAge: 30,
          targets: {
            cash: { role: 'percent', share: 0 },
            bond: { role: 'percent', share: 0 },
            equity: { role: 'percent', share: 1 },
          },
        },
      ],
      transitions: [],
      taxCashId: 'cash',
    };
    const opening: OpeningBucket[] = [
      { id: 'cash', name: 'Cash', classification: 'deposit', value: 10000 },
      { id: 'bond', name: 'Bond fund', classification: 'bondFund', units: 0, price: 100, acquisitionCost: 0 },
      { id: 'equity', name: 'Equity fund', classification: 'equityFund', units: 50000, price: 100, acquisitionCost: 1000000 },
    ];
    const base: LedgerYearInput[] = [
      yi(
        { age: 40, year: 2026, withdrawalNeed: 500000, allowance: 0, depositRates: { cash: 0 }, insurance: manualZero(2026) },
        40,
        2026,
      ),
    ];
    const ref = runLedgerDeterministic(cfg, opening, 2026, base);
    expect(ref.reports[0]?.solverExhausted).toBe(true);
    expect(ref.reports[0]?.unfundedWithdrawal ?? NaN).toBeCloseTo(0, 6);
    const out = runLedgerBootstrap(cfg, opening, 2026, base, [
      {
        years: base.map((y) => ({ fundPrices: y.fundPrices, depositRates: y.depositRates, inflationFactor: y.inflationFactor })),
      },
    ]);
    expect(out.paths[0]?.status).toBe('failed');
    if (out.paths[0]?.status !== 'failed') throw new Error('exhausted path must be failed');
    expect(out.paths[0].kind).toBe('nonconvergence');
    expect(out.failureCount).toBe(1);
    expect(out.depletionCount).toBe(0);
    expect(out.summaryBlocked).toBe(true);
  });

  it('insurance-driven depletion keeps summed KV/PV unfunded amounts visible (never zero)', () => {
    const cfg = singleMilestoneConfig();
    const crushing: LedgerYearInput[] = [
      yi(
        {
          age: 66,
          year: 2026,
          withdrawalNeed: 0,
          allowance: 100000,
          insurance: spec({
            calendarYear: 2026,
            manual: { reason: 'insurance-gap payload', kvMonthly: 10000, pvMonthly: 500 },
          }),
        },
        66,
        2026,
      ),
    ];
    const ref = runLedgerDeterministic(cfg, wealthyOpening(), 2026, crushing);
    const gapKv = ref.reports[0]?.unfundedInsuranceKv ?? 0;
    const gapPv = ref.reports[0]?.unfundedInsurancePv ?? 0;
    expect(gapKv + gapPv).toBeGreaterThan(0);
    expect(ref.reports[0]?.unfundedWithdrawal ?? NaN).toBeCloseTo(0, 6);
    const out = runLedgerBootstrap(cfg, wealthyOpening(), 2026, crushing, [
      {
        years: crushing.map((y) => ({ fundPrices: y.fundPrices, depositRates: y.depositRates, inflationFactor: y.inflationFactor })),
      },
    ]);
    expect(out.paths[0]?.status).toBe('depleted');
    if (out.paths[0]?.status !== 'depleted') throw new Error('insurance gap must deplete');
    expect(out.paths[0].unfundedInsuranceKv).toBeCloseTo(gapKv, 6);
    expect(out.paths[0].unfundedInsurancePv).toBeCloseTo(gapPv, 6);
    expect(out.paths[0].unfundedInsuranceKv + out.paths[0].unfundedInsurancePv).toBeGreaterThan(0);
    expect(out.paths[0].unfundedWithdrawal).toBeCloseTo(0, 6);
    expect(out.failureCount).toBe(0);
    expect(out.summaryBlocked).toBe(false);
  });

  it('terminal-insurance-unfunded candidate fails survives() even when withdrawals survive', () => {
    const cfg = singleMilestoneConfig();
    const years: LedgerYearInput[] = [yi({ age: 66, year: 2026, withdrawalNeed: 0 }, 66, 2026)];
    expect(ledgerSurvives(cfg, wealthyOpening(), years, 1)).toBe(true);
    const spy = vi
      .spyOn(terminalInsuranceModule, 'assessTerminalInsurance')
      .mockReturnValue({
        incrementalKvAnnual: 1_000_000_000,
        incrementalPvAnnual: 0,
        liquidationAssessableGain: 0,
        baseCapitalAssessmentAnnual: 0,
        augmentedCapitalAssessmentAnnual: 0,
        assumption: 'continuing-voluntary-annual-assessment',
        cutoff: 'beforeHoldingCutoff',
        ceilingBinding: false,
      });
    try {
      expect(ledgerSurvives(cfg, wealthyOpening(), years, 1)).toBe(false);
    } finally {
      spy.mockRestore();
    }
    expect(ledgerSurvives(cfg, wealthyOpening(), years, 1)).toBe(true);
  });

  it('ledgerSurvives rethrows input errors instead of masking them as candidate failure', () => {
    const cfg = singleMilestoneConfig();
    const good: LedgerYearInput[] = [yi({ age: 66, year: 2026, withdrawalNeed: 0 }, 66, 2026)];
    expect(ledgerSurvives(cfg, wealthyOpening(), good, 1)).toBe(true);
    const missingBucket: LedgerYearInput[] = [
      yi({ age: 66, year: 2026, fundPrices: { bond: 100 } } as unknown as LedgerYearInput, 66, 2026),
    ];
    expect(() => ledgerSurvives(cfg, wealthyOpening(), missingBucket, 1)).toThrow();
    const huge: LedgerYearInput[] = [yi({ age: 66, year: 2026, withdrawalNeed: 1_000_000_000 }, 66, 2026)];
    expect(ledgerSurvives(cfg, wealthyOpening(), huge, 1)).toBe(false);
  });

  it('manual terminal specs never report ceilingBinding', () => {
    const cfg = singleMilestoneConfig();
    const st = createLedgerState(cfg, 2026, wealthyOpening());
    const r = simulateLedger(cfg, st, [yi({ age: 66, year: 2026 }, 66, 2026)]);
    const base = r.reports[0]?.capitalAssessmentAnnual ?? 0;
    const manualSpec = spec({
      calendarYear: 2026,
      statutoryPensions: [{ id: 'pension', grossMonthly: 20000 }],
      manual: { reason: 'ceiling gate', kvMonthly: 200, pvMonthly: 100 },
    });
    const res = assessTerminalInsurance({
      state: r.state,
      taxCashId: 'cash',
      cumulativeInflation: 1,
      spec: manualSpec,
      baseCapitalAssessmentAnnual: base,
    });
    expect(res.ceilingBinding).toBe(false);
  });
});
