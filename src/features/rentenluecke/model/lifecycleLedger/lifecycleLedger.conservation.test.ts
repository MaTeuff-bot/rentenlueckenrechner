import { describe, expect, it } from 'vitest';
import { liquidateLifecycle } from '../lifecycleAllocation/index.js';
import type { LifecycleBucketDef, LifecycleConfig } from '../lifecycleAllocation/index.js';
import type { OpeningBucket } from '../investmentTax/index.js';
import { totalValue, unpaidTax } from '../investmentTax/index.js';
import { createLedgerState, simulateLedger, simulateLedgerYear } from './index.js';
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
  return spec({ calendarYear, manual: { reason: 'conservation isolation', kvMonthly: 0, pvMonthly: 0 } });
}

function yi(patch: Partial<LedgerYearInput> = {}, age = 66, year = 2026): LedgerYearInput {
  return {
    age,
    year,
    contribution: 0,
    withdrawalNeed: 0,
    allowance: 1000,
    churchRate: 0,
    fundPrices: { bond: 100, equity: 100 },
    depositRates: { cash: 0 },
    basisRate: 0.025,
    inflationFactor: 1,
    insurance: manualZero(year),
    ...patch,
  };
}

describe('conservation', () => {
  it('flat rebalancing-only years move no net cash', () => {
    const cfg = singleMilestoneConfig();
    const st = createLedgerState(cfg, 2026, wealthyOpening());
    const step = simulateLedgerYear(cfg, st, yi());
    expect(step.report.closingValue).toBeCloseTo(step.report.openingValue, 6);
    expect(step.report.taxPaid).toBe(0);
    expect(step.report.insurancePaid).toBe(0);
    expect(step.report.withdrawal).toBe(0);
    expect(step.report.contribution).toBe(0);
  });

  it('flat year with contribution, withdrawal, tax and insurance balances exactly', () => {
    const cfg = singleMilestoneConfig();
    const st = createLedgerState(cfg, 2026, wealthyOpening());
    const step = simulateLedgerYear(
      cfg,
      st,
      yi({ contribution: 5000, withdrawalNeed: 3000, allowance: 0, depositRates: { cash: 0.02 }, insurance: spec({ calendarYear: 2026 }) }),
    );
    const { report } = step;
    expect(report.closingValue).toBeCloseTo(
      report.openingValue + 5000 + 360 - report.taxPaid - report.insurancePaid - report.withdrawal,
      4,
    );
    expect(report.withdrawal).toBeCloseTo(3000, 6);
  });

  it('funding-sale year with gains balances exactly on flat follow-on prices', () => {
    const cfg = singleMilestoneConfig();
    const st = createLedgerState(cfg, 2026, wealthyOpening());
    const step = simulateLedgerYear(
      cfg,
      st,
      yi({ withdrawalNeed: 20000, fundPrices: { bond: 100, equity: 120 }, allowance: 1000 }),
    );
    const { report } = step;
    expect(report.taxPaidCurrentYear).toBeCloseTo((Math.max(0, report.assessmentIncomeAnnual - 1000) * 1.055) / 4, 2);
    expect(report.closingValue).toBeCloseTo(
      report.openingValue + 9000 - report.taxPaid - report.insurancePaid - report.withdrawal,
      2,
    );
  });

  it('no-op-target years execute no taxable sales', () => {
    const cfg = singleMilestoneConfig();
    const st = createLedgerState(cfg, 2026, wealthyOpening());
    const step = simulateLedgerYear(cfg, st, yi());
    const yearTx = step.state.transactions.filter((t) => t.year === 2026);
    expect(yearTx.some((t) => t.kind === 'sale' || t.kind === 'purchase')).toBe(false);
  });

  it('contributionIncome copies match taxIncome events and never become cash', () => {
    const cfg = singleMilestoneConfig();
    const st = createLedgerState(cfg, 2026, wealthyOpening());
    const step = simulateLedgerYear(
      cfg,
      st,
      yi({ withdrawalNeed: 20000, fundPrices: { bond: 110, equity: 120 }, depositRates: { cash: 0.02 } }),
    );
    const byId = new Map(step.state.taxIncome.map((r) => [r.id, r]));
    for (const c of step.state.contributionIncome) {
      const t = byId.get(c.id);
      expect(t).toBeDefined();
      expect(c.gross).toBeCloseTo(t?.gross ?? NaN, 9);
      expect(c.amount).toBeCloseTo(t?.amount ?? NaN, 9);
      expect(c.exemptFraction).toBe(t?.exemptFraction);
    }
    const assessed = step.state.contributionIncome.reduce((n, r) => n + r.amount, 0);
    expect(assessed).toBeGreaterThan(0);
    expect(step.report.closingValue).toBeCloseTo(
      step.report.openingValue + 11700 + 360 - step.report.taxPaid - step.report.insurancePaid - 20000,
      2,
    );
  });

  it('basis, assessed-VP, pending-VP and loss balances roll forward', () => {
    const cfg = singleMilestoneConfig();
    const st = createLedgerState(cfg, 2026, wealthyOpening());
    const r = simulateLedger(cfg, st, [
      yi({ withdrawalNeed: 10000, fundPrices: { bond: 100, equity: 120 } }, 66, 2026),
      yi({ withdrawalNeed: 5000, fundPrices: { bond: 105, equity: 120 }, depositRates: { cash: 0.01 } }, 67, 2027),
    ]);
    for (let i = 1; i < r.reports.length; i++) {
      expect(r.reports[i]?.openingValue).toBeCloseTo(r.reports[i - 1]?.closingValue ?? NaN, 6);
    }
    const basis = r.state.buckets.reduce(
      (n, b) => n + (b.classification === 'deposit' ? 0 : b.cohorts.reduce((m, c) => m + c.basis, 0)),
      0,
    );
    expect(basis).toBeGreaterThan(0);
    for (const b of r.state.buckets) {
      if (b.classification === 'deposit') continue;
      for (const c of b.cohorts) {
        expect(c.units).toBeGreaterThan(0);
        expect(c.basis).toBeGreaterThanOrEqual(0);
        expect(c.assessedVP).toBeGreaterThanOrEqual(0);
      }
    }
    const paid = r.state.taxYears.reduce((n, t) => n + t.paid, 0);
    const liab = r.state.taxYears.reduce((n, t) => n + t.liability, 0);
    expect(paid + unpaidTax(r.state)).toBeCloseTo(liab, 4);
  });
});

describe('reference fixtures', () => {
  it('two-year equity/bond/deposit mix with funding sale matches hand values to the cent', () => {
    const cfg = singleMilestoneConfig();
    const st = createLedgerState(cfg, 2026, wealthyOpening());
    const y0 = simulateLedgerYear(cfg, st, yi({ age: 66, year: 2026 }));
    expect(y0.report.closingValue).toBeCloseTo(90000, 6);
    expect(y0.report.taxPaid).toBe(0);
    expect(y0.report.capitalAssessmentAnnual).toBe(0);
    const y1 = simulateLedgerYear(
      cfg,
      y0.state,
      yi({ age: 67, year: 2027, withdrawalNeed: 20000, fundPrices: { bond: 100, equity: 110 } }),
    );
    expect(y1.report.openingValue).toBeCloseTo(90000, 6);
    expect(y1.report.withdrawal).toBeCloseTo(20000, 6);
    expect(y1.report.closingValue).toBeCloseTo(74500, 2);
    expect(y1.report.assessmentIncomeAnnual).toBeCloseTo(779.55, 2);
    expect(y1.report.capitalAssessmentAnnual).toBe(0);
    expect(y1.report.taxPaidCurrentYear).toBe(0);
    expect(y1.report.valuesNominal['cash']).toBeCloseTo(14900, 2);
    expect(y1.report.valuesNominal['bond']).toBeCloseTo(22350, 2);
    expect(y1.report.valuesNominal['equity']).toBeCloseTo(37250, 2);
  });

  it('solvent funding-sale year settles in full with no next-year arrears', () => {
    const cfg = singleMilestoneConfig();
    const st = createLedgerState(cfg, 2026, wealthyOpening());
    const y0 = simulateLedgerYear(
      cfg,
      st,
      yi({ age: 66, year: 2026, withdrawalNeed: 20000, fundPrices: { bond: 100, equity: 150 }, allowance: 0 }),
    );
    const gainBased = y0.report.assessmentIncomeAnnual;
    expect(gainBased).toBeGreaterThan(0);
    expect(y0.report.taxPaidCurrentYear).toBeCloseTo((gainBased * 1.055) / 4, 2);
    const y1 = simulateLedgerYear(cfg, y0.state, yi({ age: 67, year: 2027, contribution: 3000 }));
    expect(y1.report.taxPaidCurrentYear).toBeCloseTo(0, 6);
    expect(Object.keys(y1.report.arrearsPaidByYear).length).toBe(0);
    expect(unpaidTax(y1.state)).toBeCloseTo(0, 6);
  });

  it('terminal reconciliation settles sale taxes exactly once with no loss refund', () => {
    const cfg = singleMilestoneConfig();
    const st = createLedgerState(cfg, 2026, wealthyOpening());
    const r = simulateLedger(cfg, st, [
      yi({ age: 66, year: 2026 }),
      yi({ age: 67, year: 2027, withdrawalNeed: 20000, fundPrices: { bond: 100, equity: 110 } }),
      yi({ age: 68, year: 2028, fundPrices: { bond: 100, equity: 110 } }),
    ]);
    const pre = totalValue(r.state);
    expect(pre).toBeCloseTo(74500, 2);
    const first = liquidateLifecycle(r.state, 'cash', 1);
    const second = liquidateLifecycle(r.state, 'cash', 1);
    expect(second.nominal).toBeCloseTo(first.nominal, 9);
    expect(second.outstandingLiability).toBeCloseTo(first.outstandingLiability, 9);
    const terminalTaxPaid = -(first.state.transactions.find((t) => t.id.startsWith('terminal-tax:'))?.cash ?? NaN);
    expect(Number.isFinite(terminalTaxPaid)).toBe(true);
    expect(first.nominal + first.outstandingLiability + terminalTaxPaid).toBeCloseTo(pre, 2);
    expect(first.outstandingLiability).toBeGreaterThanOrEqual(0);
    expect(first.state.phase).toBe('terminated');
    expect(() => liquidateLifecycle(first.state, 'cash', 1)).toThrow();
  });
});

describe('long horizon', () => {
  function equityOnlyConfig(): LifecycleConfig {
    return {
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
  }

  it('40/50/60-year real values track the matching deflator without bias', () => {
    const cfg = equityOnlyConfig();
    const st = createLedgerState(cfg, 2026, [
      { id: 'cash', name: 'Cash', classification: 'deposit', value: 0 },
      { id: 'bond', name: 'Bond fund', classification: 'bondFund', units: 0, price: 100, acquisitionCost: 0 },
      { id: 'equity', name: 'Equity fund', classification: 'equityFund', units: 900, price: 100, acquisitionCost: 90000 },
    ]);
    const years: LedgerYearInput[] = [];
    let price = 100;
    for (let i = 0; i < 60; i++) {
      price *= 1.02;
      years.push(
        yi(
          {
            allowance: 1_000_000_000,
            fundPrices: { bond: 100, equity: price },
            depositRates: { cash: 0 },
            inflationFactor: 1.02 ** (i + 1),
            insurance: manualZero(2026 + i),
          },
          30 + i,
          2026 + i,
        ),
      );
    }
    const r = simulateLedger(cfg, st, years);
    expect(r.reports.length).toBe(60);
    for (const i of [39, 49, 59]) {
      const rep = r.reports[i];
      const real = (rep?.closingValue ?? 0) / (1.02 ** (i + 1));
      expect(Math.abs(real / 90000 - 1)).toBeLessThan(1e-6);
    }
    for (const rep of r.reports) {
      expect(rep.solverExhausted).toBe(false);
      expect(rep.unfundedWithdrawal).toBe(0);
    }
    const end = liquidateLifecycle(r.state, 'cash', 1.02 ** 60);
    expect(end.real).toBeCloseTo(end.nominal / 1.02 ** 60, 6);
  });

  it('nonmonotone deflation-dip path completes the deterministic ledger', () => {
    const cfg = equityOnlyConfig();
    const st = createLedgerState(cfg, 2026, [
      { id: 'cash', name: 'Cash', classification: 'deposit', value: 0 },
      { id: 'bond', name: 'Bond fund', classification: 'bondFund', units: 0, price: 100, acquisitionCost: 0 },
      { id: 'equity', name: 'Equity fund', classification: 'equityFund', units: 900, price: 100, acquisitionCost: 90000 },
    ]);
    const factors: number[] = [];
    let acc = 1;
    for (let i = 0; i < 10; i++) {
      acc *= i === 5 ? 0.95 : 1.02;
      factors.push(acc);
    }
    const r = simulateLedger(
      cfg,
      st,
      factors.map((f, i) =>
        yi(
          {
            allowance: 1_000_000_000,
            fundPrices: { bond: 100, equity: 100 * 1.02 ** (i + 1) },
            depositRates: { cash: 0 },
            inflationFactor: f,
            insurance: manualZero(2026 + i),
          },
          30 + i,
          2026 + i,
        ),
      ),
    );
    expect(r.reports.length).toBe(10);
    expect(r.reports[9]?.closingValue ?? 0).toBeGreaterThan(0);
  });
});
