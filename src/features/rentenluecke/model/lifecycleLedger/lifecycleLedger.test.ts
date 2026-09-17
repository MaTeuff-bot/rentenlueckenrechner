import { describe, expect, it } from 'vitest';
import {
  applyAnnualPricesAndInterest,
  applyTransaction,
  beginInvestmentYear,
  closeWithPendingVP,
  reconcileTax,
  unpaidTax,
} from '../investmentTax/index.js';
import type { OpeningBucket } from '../investmentTax/index.js';
import { prefillTargetsFromHoldings } from '../lifecycleAllocation/index.js';
import type { LifecycleBucketDef, LifecycleConfig } from '../lifecycleAllocation/index.js';
import { LedgerInsuranceError, createLedgerState, settleArrears, simulateLedger, simulateLedgerYear } from './index.js';
import type { LedgerInsuranceSpec, LedgerYearInput } from './index.js';

const buckets: LifecycleBucketDef[] = [
  { id: 'cash', name: 'Cash', kind: 'deposit', priority: 1 },
  { id: 'bond', name: 'Bond fund', kind: 'bondFund', priority: 2 },
  { id: 'equity', name: 'Equity fund', kind: 'equityFund', priority: 3 },
];

function percentConfig(): LifecycleConfig {
  return {
    buckets,
    milestones: [
      {
        name: 'accum',
        startAge: 30,
        targets: {
          cash: { role: 'percent', share: 0.2 },
          bond: { role: 'percent', share: 0.3 },
          equity: { role: 'percent', share: 0.5 },
        },
      },
      {
        name: 'retired',
        startAge: 65,
        targets: {
          cash: { role: 'percent', share: 0.3 },
          bond: { role: 'percent', share: 0.3 },
          equity: { role: 'percent', share: 0.4 },
        },
      },
    ],
    transitions: [{ fromMilestone: 'accum', toMilestone: 'retired', startAge: 65, durationYears: 0 }],
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

function manualZeroSpec(calendarYear: number): LedgerInsuranceSpec {
  return spec({ calendarYear, manual: { reason: 'test isolation', kvMonthly: 0, pvMonthly: 0 } });
}

function yearInput(patch: Partial<LedgerYearInput> = {}, age = 66, year = 2026): LedgerYearInput {
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
    depositRates: { cash: 0.02 },
    basisRate: 0.025,
    inflationFactor: 1,
    insurance: spec({ calendarYear: finalYear }),
    ...patch,
  };
}

describe('import lint and isolation', () => {
  it('imports only the allowed barrel and engine surfaces', () => {
    const modules = import.meta.glob('./*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    const files = Object.entries(modules).filter(([file]) => !file.endsWith('.test.ts'));
    expect(files.length).toBe(7);
    for (const [file, source] of files) {
      for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        const ref = match[1];
        if (ref.startsWith('../')) {
          const ok =
            ref === '../investmentTax/index.js' ||
            ref === '../lifecycleAllocation/index.js' ||
            ref.startsWith('../contributions/') ||
            ref === '../retirementInsurance.js' ||
            ref === '../retirementIncomeStreams.js';
          if (!ok) throw new Error(`Forbidden import ${ref} in ${file}`);
        } else if (ref.startsWith('../../')) {
          if (!ref.startsWith('../../mortality/')) throw new Error(`Forbidden import ${ref} in ${file}`);
        } else if (ref.startsWith('./') || ref.startsWith('node:')) {
          continue;
        } else {
          throw new Error(`Forbidden import ${ref} in ${file}`);
        }
        expect(ref).not.toMatch(/simulateAccumulation|simulateScenario|portfolioBuckets|capitalIncome|insuranceEstimator|hooks|components|recharts|react/i);
      }
      expect(source).not.toMatch(/localStorage|window\.|document\./);
      expect(source).not.toMatch(/from\s+['"]\.\.\/capitalIncome\//);
    }
  });
});

describe('arrears', () => {
  function seedUnpaid(cfg: LifecycleConfig, year: number, interestRate: number, allowance: number) {
    const firstPrices = { bond: 100, equity: 100 };
    let st = createLedgerState(cfg, year, [
      { id: 'cash', name: 'Cash', classification: 'deposit', value: 50000 },
      { id: 'bond', name: 'Bond fund', classification: 'bondFund', units: 100, price: 100, acquisitionCost: 10000 },
      { id: 'equity', name: 'Equity fund', classification: 'equityFund', units: 100, price: 100, acquisitionCost: 10000 },
    ]);
    st = beginInvestmentYear(st, year, allowance, 0);
    st = applyAnnualPricesAndInterest(st, firstPrices, { cash: interestRate });
    st = applyTransaction(st, {
      id: `seed:${year}:invest`,
      kind: 'purchase',
      fundId: 'equity',
      cashId: 'cash',
      amount: 49000 + 50000 * interestRate,
    });
    st = reconcileTax(st, 'cash', `seed:${year}:tax`);
    st = closeWithPendingVP(st, firstPrices, 0.025);
    return st;
  }

  it('recovery via contribution pays dated arrears and reports splits separately', () => {
    const cfg = percentConfig();
    const st0 = seedUnpaid(cfg, 2026, 1.0, 1000);
    const owed = unpaidTax(st0);
    expect(owed).toBeGreaterThan(1000);
    const current = st0.taxYears.find((t) => t.year === 2026);
    expect(current?.paid ?? -1).toBeCloseTo(1000, 6);
    const step = simulateLedgerYear(cfg, st0, yearInput({ age: 66, year: 2027, contribution: owed + 5000, insurance: manualZeroSpec(2027) }));
    expect(step.report.arrearsPaidByYear[2026] ?? 0).toBeCloseTo(owed, 2);
    expect(step.report.remainingLiabilities[2026] ?? 0).toBeCloseTo(0, 6);
    expect(step.report.taxPaidCurrentYear).toBeCloseTo(0, 6);
    expect(step.report.taxPaid).toBeCloseTo(owed, 2);
    expect(unpaidTax(step.state)).toBeCloseTo(0, 6);
  });

  it('recovery via taxable sale includes tax on funding sales in the anchor', () => {
    const cfg = percentConfig();
    const st0 = seedUnpaid(cfg, 2026, 1.0, 1000);
    const owed = unpaidTax(st0);
    const step = simulateLedgerYear(
      cfg,
      st0,
      yearInput({ age: 66, year: 2027, withdrawalNeed: 30000, fundPrices: { bond: 110, equity: 120 }, insurance: manualZeroSpec(2027) }),
    );
    expect(step.report.arrearsPaidByYear[2026] ?? 0).toBeCloseTo(owed, 2);
    expect(step.report.remainingLiabilities[2026] ?? 0).toBeCloseTo(0, 6);
    expect(step.report.withdrawal).toBeCloseTo(30000, 2);
    expect(step.report.unfundedWithdrawal).toBeCloseTo(0, 6);
  });

  it('partial recovery pays the oldest year first', () => {
    const cfg = percentConfig();
    let st = seedUnpaid(cfg, 2026, 1.0, 1000);
    const owed2026 = unpaidTax(st);
    st = beginInvestmentYear(st, 2027, 0, 0);
    st = applyTransaction(st, { id: 'seed:2027:external', kind: 'external', cashId: 'cash', amount: 20000 });
    st = applyAnnualPricesAndInterest(st, { bond: 100, equity: 100 }, { cash: 1.0 });
    st = applyTransaction(st, { id: 'seed:2027:invest', kind: 'purchase', fundId: 'equity', cashId: 'cash', amount: 39500 });
    st = reconcileTax(st, 'cash', 'seed:2027:tax');
    const entry2027 = st.taxYears.find((t) => t.year === 2027);
    const owed2027 = Math.max(0, (entry2027?.liability ?? 0) - (entry2027?.paid ?? 0));
    expect(owed2027).toBeGreaterThan(1000);
    st = closeWithPendingVP(st, { bond: 100, equity: 100 }, 0.025);
    st = beginInvestmentYear(st, 2028, 0, 0);
    st = applyTransaction(st, { id: 'seed:2028:external', kind: 'external', cashId: 'cash', amount: owed2026 + owed2027 / 2 });
    st = applyAnnualPricesAndInterest(st, { bond: 100, equity: 100 }, { cash: 0 });
    st = reconcileTax(st, 'cash', 'seed:2028:tax');
    const settled = settleArrears(st, 'cash', 2028);
    expect(settled.paidByYear[2026] ?? 0).toBeCloseTo(owed2026, 2);
    expect(settled.remaining[2026] ?? 0).toBeCloseTo(0, 6);
    expect(settled.paidByYear[2027] ?? 0).toBeCloseTo(owed2027 / 2, 2);
    expect(settled.remaining[2027] ?? 0).toBeCloseTo(owed2027 / 2, 2);
    st = closeWithPendingVP(settled.state, { bond: 100, equity: 100 }, 0.025);
    expect(st.taxYears.find((t) => t.year === 2026)?.paid ?? -1).toBeCloseTo(
      st.taxYears.find((t) => t.year === 2026)?.liability ?? -2, 6,
    );
  });

  it('market-crash insolvency leaves dated liabilities explicit', () => {
    const cfg = percentConfig();
    const st0 = seedUnpaid(cfg, 2026, 1.0, 1000);
    const owed = unpaidTax(st0);
    expect(owed).toBeGreaterThan(5000);
    const step = simulateLedgerYear(
      cfg,
      st0,
      yearInput({
        age: 66,
        year: 2027,
        fundPrices: { bond: 1, equity: 1 },
        depositRates: { cash: 0 },
        insurance: manualZeroSpec(2027),
      }),
    );
    const paid = Object.values(step.report.arrearsPaidByYear).reduce((n, v) => n + v, 0);
    expect(paid).toBeGreaterThanOrEqual(0);
    expect(paid).toBeLessThan(owed);
    expect(step.report.remainingLiabilities[2026] ?? 0).toBeCloseTo(owed - paid, 0);
    expect(unpaidTax(step.state)).toBeCloseTo(owed - paid, 0);
    expect(step.report.unfundedWithdrawal).toBe(0);
  });

  it('zero-cash-target year with arrears still recovers from contributions', () => {
    const cfg = percentConfig();
    const st0 = seedUnpaid(cfg, 2026, 0.5, 500);
    const owed = unpaidTax(st0);
    expect(owed).toBeGreaterThan(0);
    const step = simulateLedgerYear(
      cfg,
      st0,
      yearInput({ age: 66, year: 2027, withdrawalNeed: 0, contribution: owed + 1000, insurance: manualZeroSpec(2027) }),
    );
    expect(step.report.arrearsPaidByYear[2026] ?? 0).toBeCloseTo(owed, 2);
    expect(step.report.withdrawal).toBe(0);
  });

  it('arrears survive a milestone boundary without resetting dated years', () => {
    const cfg = percentConfig();
    const st0 = seedUnpaid(cfg, 2026, 0.5, 500);
    const owed = unpaidTax(st0);
    const step = simulateLedgerYear(
      cfg,
      st0,
      yearInput({ age: 65, year: 2027, contribution: owed + 2000, insurance: manualZeroSpec(2027) }),
    );
    expect(step.report.arrearsPaidByYear[2026] ?? 0).toBeCloseTo(owed, 2);
    const tax2026 = step.state.taxYears.find((t) => t.year === 2026);
    expect(tax2026?.paid ?? -1).toBeCloseTo(tax2026?.liability ?? -2, 6);
    const anchor = step.report.anchorNominal;
    expect(step.report.targetsNominal['cash'] ?? 0).toBeCloseTo(0.3 * anchor, 0);
  });

  it('arrears recover in a manual-override year', () => {
    const cfg = percentConfig();
    const st0 = seedUnpaid(cfg, 2026, 0.5, 500);
    const owed = unpaidTax(st0);
    const step = simulateLedgerYear(
      cfg,
      st0,
      yearInput({
        age: 64,
        year: 2027,
        contribution: owed + 5000,
        insurance: spec({ calendarYear: 2027, phase: 'bridge', manual: { reason: 'unsupported receipt flips phase', kvMonthly: 200, pvMonthly: 100 } }),
      }),
    );
    expect(step.report.arrearsPaidByYear[2026] ?? 0).toBeCloseTo(owed, 2);
    expect(step.report.insuranceAssumption).toBe('manual-replacement');
    expect(step.report.insurancePaid).toBeCloseTo(3600, 2);
  });
});

describe('spending, tax and insurance', () => {
  it('voluntary year couples funding-sale gains into tax and insurance', () => {
    const cfg = percentConfig();
    const st = createLedgerState(cfg, 2026, wealthyOpening());
    const step = simulateLedgerYear(
      cfg,
      st,
      yearInput({ age: 66, year: 2026, withdrawalNeed: 20000, fundPrices: { bond: 100, equity: 120 } }),
    );
    expect(step.report.withdrawal).toBeCloseTo(20000, 2);
    expect(step.report.taxPaidCurrentYear).toBeGreaterThan(0);
    expect(step.report.assessmentIncomeAnnual).toBeGreaterThan(0);
    expect(step.report.capitalAssessmentAnnual).toBeGreaterThan(0);
    expect(step.report.insurancePaid).toBeGreaterThan(0);
    expect(step.report.insuranceAssumption).toBe('per-bucket');
    expect(step.report.insuranceConverged).toBe(true);
  });

  it('KVdR year taxes funding sales but excludes capital from assessment', () => {
    const cfg = percentConfig();
    const st = createLedgerState(cfg, 2026, wealthyOpening());
    const step = simulateLedgerYear(
      cfg,
      st,
      yearInput({
        age: 66,
        year: 2026,
        withdrawalNeed: 20000,
        fundPrices: { bond: 100, equity: 120 },
        insurance: spec({
          calendarYear: 2026,
          status: 'kvdr',
          statutoryPensions: [{ id: 'pension', grossMonthly: 1500 }],
        }),
      }),
    );
    expect(step.report.taxPaidCurrentYear).toBeGreaterThan(0);
    expect(step.report.assessmentIncomeAnnual).toBeGreaterThan(0);
    expect(step.report.capitalAssessmentAnnual).toBe(0);
    expect(step.report.insuranceAssumption).toBe('kvdr-excluded');
    expect(step.report.insuranceEffectiveStatus).toBe('kvdr');
    expect(step.report.insurancePaid).toBeGreaterThan(0);
  });

  it('unknown status uses the conservative voluntary assumption', () => {
    const cfg = percentConfig();
    const twin = yearInput({ age: 66, year: 2026, withdrawalNeed: 20000, fundPrices: { bond: 100, equity: 120 } });
    const a = simulateLedgerYear(cfg, createLedgerState(cfg, 2026, wealthyOpening()), twin);
    const b = simulateLedgerYear(
      cfg,
      createLedgerState(cfg, 2026, wealthyOpening()),
      { ...twin, insurance: spec({ calendarYear: 2026, status: 'unknown' }) },
    );
    expect(b.report.insuranceEffectiveStatus).toBe('voluntary');
    expect(b.report.insurancePaid).toBeCloseTo(a.report.insurancePaid, 6);
  });

  it('manual bridge plus automatic pension fund in the same run', () => {
    const cfg = percentConfig();
    const st = createLedgerState(cfg, 2026, wealthyOpening());
    const r = simulateLedger(cfg, st, [
      yearInput({
        age: 64,
        year: 2026,
        withdrawalNeed: 10000,
        insurance: spec({ calendarYear: 2026, phase: 'bridge', manual: { reason: 'bridge totals', kvMonthly: 200, pvMonthly: 100 } }),
      }),
      yearInput({ age: 65, year: 2027, withdrawalNeed: 10000 }),
    ]);
    expect(r.reports[0]?.insuranceAssumption).toBe('manual-replacement');
    expect(r.reports[0]?.insurancePaid).toBeCloseTo(3600, 2);
    expect(r.reports[1]?.insuranceAssumption).toBe('per-bucket');
    expect(r.reports[1]?.insuranceConverged).toBe(true);
    expect(r.reports[1]?.openingValue).toBeCloseTo(r.reports[0]?.closingValue ?? 0, 6);
  });

  it('automatic bridge plus manual pension fund in the same run', () => {
    const cfg = percentConfig();
    const st = createLedgerState(cfg, 2026, wealthyOpening());
    const r = simulateLedger(cfg, st, [
      yearInput({ age: 64, year: 2026, withdrawalNeed: 5000, insurance: spec({ calendarYear: 2026, phase: 'bridge' }) }),
      yearInput({
        age: 65,
        year: 2027,
        withdrawalNeed: 5000,
        insurance: spec({ calendarYear: 2027, manual: { reason: 'pension totals', kvMonthly: 150, pvMonthly: 80 } }),
      }),
    ]);
    expect(r.reports[0]?.insuranceAssumption).toBe('per-bucket');
    expect(r.reports[1]?.insuranceAssumption).toBe('manual-replacement');
    expect(r.reports[1]?.insurancePaid).toBeCloseTo(2760, 2);
  });

  it('manual replacement ignores funding-sale gains', () => {
    const cfg = percentConfig();
    const mk = (prices: Record<string, number>) =>
      simulateLedgerYear(
        cfg,
        createLedgerState(cfg, 2026, wealthyOpening()),
        yearInput({
          age: 64,
          year: 2026,
          withdrawalNeed: 20000,
          fundPrices: prices,
          insurance: spec({ calendarYear: 2026, phase: 'bridge', manual: { reason: 'phase totals', kvMonthly: 200, pvMonthly: 100 } }),
        }),
      );
    const flat = mk({ bond: 100, equity: 100 });
    const gains = mk({ bond: 100, equity: 160 });
    expect(gains.report.assessmentIncomeAnnual).toBeGreaterThan(flat.report.assessmentIncomeAnnual);
    expect(gains.report.insurancePaid).toBeCloseTo(flat.report.insurancePaid, 6);
    expect(gains.report.capitalAssessmentAnnual).toBe(0);
  });

  it('unsupported bridge pensions fail closed without committing state', () => {
    const cfg = percentConfig();
    const st = createLedgerState(cfg, 2026, wealthyOpening());
    const before = JSON.stringify(st);
    expect(() =>
      simulateLedgerYear(
        cfg,
        st,
        yearInput({
          age: 64,
          year: 2026,
          insurance: spec({ calendarYear: 2026, phase: 'bridge', statutoryPensions: [{ id: 'pension', grossMonthly: 1000 }] }),
        }),
      ),
    ).toThrow(LedgerInsuranceError);
    expect(JSON.stringify(st)).toBe(before);
  });

  it('minimum top-up applies with zero assessment income', () => {
    const cfg = percentConfig();
    const st = createLedgerState(cfg, 2026, wealthyOpening());
    const step = simulateLedgerYear(
      cfg,
      st,
      yearInput({ age: 66, year: 2026, allowance: 100000, depositRates: { cash: 0 }, insurance: spec({ calendarYear: 2026 }) }),
    );
    expect(step.report.capitalAssessmentAnnual).toBe(0);
    expect(step.report.insurancePaid).toBeCloseTo(1318.33 * (0.14 + 0.025 + 0.042) * 12, 2);
  });

  it('binding ceiling caps the capital increment', () => {
    const cfg = percentConfig();
    const mk = (prices: Record<string, number>) =>
      simulateLedgerYear(
        cfg,
        createLedgerState(cfg, 2026, wealthyOpening()),
        yearInput({
          age: 66,
          year: 2026,
          withdrawalNeed: 20000,
          fundPrices: prices,
          insurance: spec({ calendarYear: 2026, statutoryPensions: [{ id: 'pension', grossMonthly: 20000 }] }),
        }),
      );
    const base = mk({ bond: 100, equity: 100 });
    const gains = mk({ bond: 100, equity: 160 });
    expect(gains.report.assessmentIncomeAnnual).toBeGreaterThan(base.report.assessmentIncomeAnnual + 1);
    expect(gains.report.insurancePaid).toBeCloseTo(base.report.insurancePaid, 2);
  });

  it('loss carry corresponds without negative contributions', () => {
    const cfg = percentConfig();
    const st = createLedgerState(cfg, 2026, wealthyOpening());
    const step = simulateLedgerYear(
      cfg,
      st,
      yearInput({ age: 66, year: 2026, withdrawalNeed: 30000, fundPrices: { bond: 100, equity: 50 }, depositRates: { cash: 0 } }),
    );
    expect(step.report.assessmentIncomeAnnual).toBeLessThan(0);
    expect(step.report.capitalAssessmentAnnual).toBe(0);
    const taxYear = step.state.taxYears.find((t) => t.year === 2026);
    expect(taxYear?.loss ?? 0).toBeGreaterThan(0);
  });

  it('the 51 euro expense allowance applies once per person across buckets', () => {
    const cfg: LifecycleConfig = {
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
    const st = createLedgerState(cfg, 2026, wealthyOpening());
    const step = simulateLedgerYear(
      cfg,
      st,
      yearInput({
        age: 40,
        year: 2026,
        allowance: 0,
        depositRates: { cash: 0.02 },
        insurance: spec({ calendarYear: 2026 }),
      }),
    );
    expect(step.report.assessmentIncomeAnnual).toBeCloseTo(360, 6);
    expect(step.report.capitalAssessmentAnnual).toBeCloseTo(309, 6);
    expect(step.report.taxPaidCurrentYear).toBeCloseTo((360 * 1.055) / 4, 6);
  });
});

describe('convergence', () => {
  it('exhausted solve reports the executed plan with a flag, never as converged', () => {
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
    const st = createLedgerState(cfg, 2026, [
      { id: 'cash', name: 'Cash', classification: 'deposit', value: 10000 },
      { id: 'bond', name: 'Bond fund', classification: 'bondFund', units: 0, price: 100, acquisitionCost: 0 },
      { id: 'equity', name: 'Equity fund', classification: 'equityFund', units: 50000, price: 100, acquisitionCost: 1000000 },
    ]);
    const step = simulateLedgerYear(
      cfg,
      st,
      yearInput({ age: 40, year: 2026, withdrawalNeed: 500000, allowance: 0, depositRates: { cash: 0 }, insurance: manualZeroSpec(2026) }),
    );
    expect(step.report.solverExhausted).toBe(true);
    expect(step.report.iterations).toBe(8);
    expect(step.report.withdrawal).toBeCloseTo(500000, 2);
    expect(step.report.unfundedWithdrawal).toBeCloseTo(0, 6);
    expect(step.report.taxPaidCurrentYear).toBeGreaterThan(0);
    expect(Object.keys(step.report.targetsNominal).sort()).toEqual(['bond', 'cash', 'equity']);
  });

  it('insurance nonconvergence commits no next state', () => {
    const cfg = percentConfig();
    const st = createLedgerState(cfg, 2026, wealthyOpening());
    const before = JSON.stringify(st);
    let caught: unknown = null;
    try {
      simulateLedgerYear(
        cfg,
        st,
        yearInput({ age: 66, year: 2026, insurance: spec({ calendarYear: 2026, drvSubsidy: undefined }) }),
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(LedgerInsuranceError);
    expect((caught as LedgerInsuranceError).diagnostics.join(' ')).toMatch(/incomplete/i);
    expect(JSON.stringify(st)).toBe(before);
  });
});

describe('zero wealth and future holdings', () => {
  it('zero-start with explicit targets runs on contributions', () => {
    const cfg = percentConfig();
    const st = createLedgerState(cfg, 2026, [
      { id: 'cash', name: 'Cash', classification: 'deposit', value: 0 },
      { id: 'bond', name: 'Bond fund', classification: 'bondFund', units: 0, price: 100, acquisitionCost: 0 },
      { id: 'equity', name: 'Equity fund', classification: 'equityFund', units: 0, price: 100, acquisitionCost: 0 },
    ]);
    const step = simulateLedgerYear(
      cfg,
      st,
      yearInput({ age: 30, year: 2026, contribution: 5000, allowance: 100000, insurance: manualZeroSpec(2026) }),
    );
    expect(step.report.closingValue).toBeCloseTo(5000, 2);
    expect(step.report.solverExhausted).toBe(false);
  });

  it('prefill at zero wealth throws', () => {
    expect(() =>
      prefillTargetsFromHoldings({ cash: 0, bond: 0, equity: 0 }, { cash: 'deposit', bond: 'bondFund', equity: 'equityFund' }),
    ).toThrow(/positive total wealth/);
  });

  it('future holding with zero opening gains a price path', () => {
    const cfg: LifecycleConfig = {
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
    const st = createLedgerState(cfg, 2026, [
      { id: 'cash', name: 'Cash', classification: 'deposit', value: 20000 },
      { id: 'equity', name: 'Equity fund', classification: 'equityFund', units: 400, price: 100, acquisitionCost: 40000 },
      { id: 'future', name: 'Future fund', classification: 'equityFund', units: 0, price: 50, acquisitionCost: 0 },
    ]);
    const step = simulateLedgerYear(
      cfg,
      st,
      {
        ...yearInput({ age: 30, year: 2026, allowance: 100000, insurance: manualZeroSpec(2026) }),
        fundPrices: { equity: 100, future: 60 },
        depositRates: { cash: 0 },
      },
    );
    expect(step.report.valuesNominal['future'] ?? 0).toBeGreaterThan(0);
  });
});

describe('review fix round 1', () => {
  it('insurance calendarYear mismatch throws fail-closed LedgerInsuranceError', () => {
    const cfg = percentConfig();
    const st = createLedgerState(cfg, 2026, wealthyOpening());
    expect(() =>
      simulateLedgerYear(
        cfg,
        st,
        yearInput({ age: 66, year: 2027, insurance: spec({ calendarYear: 2026 }) }),
      ),
    ).toThrow(LedgerInsuranceError);
  });
});
