import {
  applyAnnualPricesAndInterestInBatch,
  applyTransactionInBatch,
  beginInvestmentYear,
  beginInvestmentYearInBatch,
  bucketValue,
  closeWithPendingVPInBatch,
  finite,
  finishTransactionBatch,
  reconcileTaxInBatch,
  startTransactionBatch,
  totalValue,
  unpaidTax,
} from '../investmentTax/index.js';
import type { InvestmentState, ReconcileBaseYearIncome } from '../investmentTax/index.js';
import {
  buildRebalancePlan,
  createLifecycleState,
  resolveYearlyTargetsEuroUnchecked,
  validateLifecycleConfig,
} from '../lifecycleAllocation/index.js';
import type {
  LifecycleBucketKind,
  LifecycleConfig,
  LifecycleTrade,
} from '../lifecycleAllocation/index.js';
import type { OpeningBucket } from '../investmentTax/index.js';
import { outstandingByYear } from './arrears.js';
import { isCapitalIndependentInsuranceSpec, resolveInsuranceBurden, sumAssessmentIncomeAnnual } from './insuranceAssessment.js';
import type {
  LedgerResult,
  LedgerYearInput,
  LedgerYearReport,
} from './types.js';

export const LEDGER_DUST_EUR = 0.01;
export const LEDGER_MAX_SOLVER_ITERATIONS = 8;
export const LEDGER_SOLVER_TOLERANCE_EUR = 0.005;
export class LedgerInsuranceError extends Error {
  readonly diagnostics: string[];
  constructor(diagnostics: string[]) {
    super(`Ledger insurance funding callback nonconverged: ${diagnostics.join('; ')}`);
    this.name = 'LedgerInsuranceError';
    this.diagnostics = diagnostics;
  }
}

interface LifecycleConfigDerived {
  kinds: Record<string, LifecycleBucketKind>;
  priorities: Record<string, number>;
  fundIds: string[];
  depositIds: string[];
}

const lifecycleConfigDerivedCache = new WeakMap<LifecycleConfig, LifecycleConfigDerived>();

function derivedOf(config: LifecycleConfig): LifecycleConfigDerived {
  let derived = lifecycleConfigDerivedCache.get(config);
  if (derived === undefined) {
    const kinds: Record<string, LifecycleBucketKind> = {};
    const priorities: Record<string, number> = {};
    const fundIds: string[] = [];
    const depositIds: string[] = [];
    for (const b of config.buckets) {
      kinds[b.id] = b.kind;
      priorities[b.id] = b.priority;
      (b.kind === 'deposit' ? depositIds : fundIds).push(b.id);
    }
    derived = { kinds, priorities, fundIds, depositIds };
    lifecycleConfigDerivedCache.set(config, derived);
  }
  return derived;
}

function kindsOf(config: LifecycleConfig): Record<string, LifecycleBucketKind> {
  return derivedOf(config).kinds;
}

function prioritiesOf(config: LifecycleConfig): Record<string, number> {
  return derivedOf(config).priorities;
}

function fundIds(config: LifecycleConfig): string[] {
  return derivedOf(config).fundIds;
}

function depositIds(config: LifecycleConfig): string[] {
  return derivedOf(config).depositIds;
}

function assertStateMatchesConfig(config: LifecycleConfig, state: InvestmentState, year: number): void {
  for (const b of config.buckets) {
    const found = state.buckets.find((x) => x.id === b.id);
    if (!found) throw new Error(`Year ${year}: ledger misses bucket ${b.id}`);
    const actual = found.classification;
    const expected = b.kind === 'deposit' ? 'deposit' : b.kind;
    if (actual !== expected) throw new Error(`Year ${year}: bucket ${b.id} kind ${expected} does not match ledger`);
  }
}

function valuesSnapshot(state: InvestmentState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of state.buckets) out[b.id] = bucketValue(b);
  return out;
}

function priceOf(state: InvestmentState, fundId: string): number {
  const b = state.buckets.find((x) => x.id === fundId);
  if (!b || b.classification === 'deposit') throw new Error(`Unknown fund ${fundId}`);
  return b.price;
}

function unitsHeld(state: InvestmentState, fundId: string): number {
  const b = state.buckets.find((x) => x.id === fundId);
  if (!b || b.classification === 'deposit') throw new Error(`Unknown fund ${fundId}`);
  let total = 0;
  for (const c of b.cohorts) total += c.units;
  return total;
}

function cashOf(state: InvestmentState, cashId: string): number {
  const b = state.buckets.find((x) => x.id === cashId);
  if (!b || b.classification !== 'deposit') throw new Error(`Unknown deposit ${cashId}`);
  return b.value;
}

function validateLedgerYearInput(config: LifecycleConfig, input: LedgerYearInput): void {
  if (!Number.isInteger(input.age)) throw new Error(`Year ${input.year}: age must be an integer`);
  if (!Number.isInteger(input.year)) throw new Error(`Invalid calendar year ${input.year}`);
  for (const [label, v] of [
    ['contribution', input.contribution],
    ['withdrawalNeed', input.withdrawalNeed],
    ['allowance', input.allowance],
  ] as const) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new Error(`Year ${input.year}: ${label} must be >= 0`);
  }
  if (input.churchRate !== 0 && input.churchRate !== 0.08 && input.churchRate !== 0.09) throw new Error(`Year ${input.year}: invalid church rate`);
  if (!Number.isFinite(input.basisRate)) throw new Error(`Year ${input.year}: invalid basis rate`);
  if (!Number.isFinite(input.inflationFactor) || input.inflationFactor <= 0) {
    throw new Error(`Year ${input.year}: invalid cumulative inflation factor`);
  }
  const funds = fundIds(config);
  const deposits = depositIds(config);
  const priceKeys = Object.keys(input.fundPrices ?? {});
  const rateKeys = Object.keys(input.depositRates ?? {});
  if (priceKeys.length !== funds.length || funds.some((id) => !Object.hasOwn(input.fundPrices, id))) {
    throw new Error(`Year ${input.year}: fundPrices must cover exactly all fund buckets`);
  }
  if (rateKeys.length !== deposits.length || deposits.some((id) => !Object.hasOwn(input.depositRates, id))) {
    throw new Error(`Year ${input.year}: depositRates must cover exactly all deposit buckets`);
  }
  for (const v of Object.values(input.fundPrices)) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new Error(`Year ${input.year}: invalid fund price`);
  }
  for (const v of Object.values(input.depositRates)) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < -1) throw new Error(`Year ${input.year}: invalid deposit rate`);
  }
  const spec = input.insurance;
  if (!spec || typeof spec !== 'object') throw new Error(`Year ${input.year}: insurance spec is required`);
  if (spec.status !== 'kvdr' && spec.status !== 'voluntary' && spec.status !== 'unknown') throw new Error(`Year ${input.year}: invalid insurance status`);
  if (spec.phase !== 'bridge' && spec.phase !== 'pension') throw new Error(`Year ${input.year}: invalid insurance phase`);
  if (!Number.isInteger(spec.calendarYear)) throw new Error(`Year ${input.year}: invalid insurance calendar year`);
  if (spec.calendarYear !== input.year) {
    throw new LedgerInsuranceError([
      `Year ${input.year}: insurance calendarYear ${spec.calendarYear} does not match ledger year ${input.year}`,
    ]);
  }
  if (!Number.isFinite(spec.cashflowBeforeInsuranceMonthly)) throw new Error(`Year ${input.year}: invalid cashflow before insurance`);
  if (!Number.isFinite(spec.insurerAdditionalRate) || spec.insurerAdditionalRate < 0) {
    throw new Error(`Year ${input.year}: invalid insurer additional rate`);
  }
  if (!Number.isInteger(spec.insuredBirthYear)) throw new Error(`Year ${input.year}: invalid insured birth year`);
  if (typeof spec.isParent !== 'boolean' || !Array.isArray(spec.childBirthYears)) {
    throw new Error(`Year ${input.year}: invalid insurance family inputs`);
  }
  if (!Number.isFinite(spec.rentalAssessmentMonthly) || spec.rentalAssessmentMonthly < 0) {
    throw new Error(`Year ${input.year}: invalid rental assessment`);
  }
  if (spec.expenseAllowanceAnnual !== undefined && (!Number.isFinite(spec.expenseAllowanceAnnual) || spec.expenseAllowanceAnnual < 0)) {
    throw new Error(`Year ${input.year}: invalid expense allowance`);
  }
}

interface RebalanceLeg {
  bucketId: string;
  euros: number;
}

function planLegs(
  valuesBefore: Record<string, number>,
  targets: Record<string, number>,
  priorities: Record<string, number>,
): { sells: RebalanceLeg[]; buys: RebalanceLeg[] } {
  if (Math.abs(LEDGER_DUST_EUR - 0.01) > 1e-12) throw new Error('Ledger dust must mirror allocation dust');
  return buildRebalancePlan(valuesBefore, targets, priorities);
}

function applyLedgerTradesInBatch(
  next: InvestmentState,
  seen: Set<string>,
  config: LifecycleConfig,
  valuesBefore: Record<string, number>,
  targets: Record<string, number>,
  withdrawal: number,
  prices: Record<string, number>,
  idPrefix: string,
  reserve = 0,
  enforceReserve = false,
): { trades: LifecycleTrade[]; fundedWithdrawal: number } {
  const kinds = kindsOf(config);
  const settlement = config.taxCashId;
  const plan = planLegs(valuesBefore, targets, prioritiesOf(config));
  const trades: LifecycleTrade[] = [];
  let seq = 0;
  const id = (op: string): string => `${idPrefix}:${seq++}:${op}`;

  const sells: typeof plan.sells = [];
  const buys: typeof plan.buys = [];
  for (const l of plan.sells) { if (l.bucketId !== settlement) sells.push(l); }
  for (const l of plan.buys) { if (l.bucketId !== settlement) buys.push(l); }

  for (const leg of sells) {
    if (kinds[leg.bucketId] === 'deposit') {
      const available = cashOf(next, leg.bucketId);
      const amount = Math.min(leg.euros, available);
      if (amount < LEDGER_DUST_EUR) continue;
      applyTransactionInBatch(next, seen, { id: id(`sell-${leg.bucketId}`), kind: 'transfer', fromId: leg.bucketId, toId: settlement, amount });
      trades.push({ bucketId: leg.bucketId, kind: 'sell', euros: amount, units: amount });
    } else {
      const price = prices[leg.bucketId] ?? priceOf(next, leg.bucketId);
      const held = unitsHeld(next, leg.bucketId);
      if (held <= 0) continue;
      if (!(price > 0)) continue;
      let units = leg.euros / price;
      units = Math.min(units, held);
      if (units <= 0) continue;
      if (leg.euros > 0 && units === 0) continue;
      applyTransactionInBatch(next, seen, { id: id(`sell-${leg.bucketId}`), kind: 'sale', fundId: leg.bucketId, cashId: settlement, units });
      trades.push({ bucketId: leg.bucketId, kind: 'sell', euros: units * price, units });
    }
  }

  let funded = 0;
  if (withdrawal > 0) {
    const need = withdrawal;
    const buyByBucket = new Map<string, number>();
    for (const l of buys) buyByBucket.set(l.bucketId, l.euros);
    if (!enforceReserve) {
      while (need > 0 && cashOf(next, settlement) < need) {
        const missing = need - cashOf(next, settlement);
        const selectBest = (excludePending: boolean): string | null => {
          let best: string | null = null;
          let bestValue = 0;
          for (const b of config.buckets) {
            if (b.id === settlement) continue;
            if (excludePending && (buyByBucket.get(b.id) ?? 0) > LEDGER_DUST_EUR) continue;
            const v = kinds[b.id] === 'deposit' ? cashOf(next, b.id) : unitsHeld(next, b.id) * (prices[b.id] ?? 0);
            if (v > bestValue + LEDGER_DUST_EUR) {
              bestValue = v;
              best = b.id;
            }
          }
          return best;
        };
        const best = selectBest(true) ?? selectBest(false);
        if (!best) break;
        if (kinds[best] === 'deposit') {
          const amount = Math.min(missing, cashOf(next, best));
          if (amount < LEDGER_DUST_EUR) break;
          applyTransactionInBatch(next, seen, { id: id(`draw-${best}`), kind: 'transfer', fromId: best, toId: settlement, amount });
          trades.push({ bucketId: best, kind: 'sell', euros: amount, units: amount });
          const pending = buyByBucket.get(best) ?? 0;
          if (pending > 0) buyByBucket.set(best, Math.max(0, pending - amount));
        } else {
          const price = prices[best] ?? 0;
          const held = unitsHeld(next, best);
          if (!(price > 0) || held <= 0) break;
          const units = Math.min(missing / price, held);
          if (units <= 0) break;
          applyTransactionInBatch(next, seen, { id: id(`draw-${best}`), kind: 'sale', fundId: best, cashId: settlement, units });
          trades.push({ bucketId: best, kind: 'sell', euros: units * price, units });
          const pending = buyByBucket.get(best) ?? 0;
          if (pending > 0) buyByBucket.set(best, Math.max(0, pending - units * price));
        }
      }
    }
    for (const leg of buys) {
      const adjusted = buyByBucket.get(leg.bucketId);
      if (adjusted !== undefined) leg.euros = adjusted;
    }
    const available = cashOf(next, settlement);
    funded = enforceReserve ? Math.min(need, Math.max(0, available - reserve)) : Math.min(need, available);
    if (funded > 0) {
      applyTransactionInBatch(next, seen, { id: id('withdraw'), kind: 'external', cashId: settlement, amount: -funded });
    }
  }

  for (const leg of buys) {
    if (leg.euros < LEDGER_DUST_EUR) continue;
    const cash = cashOf(next, settlement);
    if (cash < LEDGER_DUST_EUR) break;
    if (kinds[leg.bucketId] === 'deposit') {
      const amount = Math.min(leg.euros, cash);
      if (amount < LEDGER_DUST_EUR) continue;
      applyTransactionInBatch(next, seen, { id: id(`buy-${leg.bucketId}`), kind: 'transfer', fromId: settlement, toId: leg.bucketId, amount });
      trades.push({ bucketId: leg.bucketId, kind: 'buy', euros: amount, units: amount });
    } else {
      const price = prices[leg.bucketId] ?? 0;
      if (!(price > 0)) {
        if (leg.euros >= LEDGER_DUST_EUR && cash >= LEDGER_DUST_EUR) {
          throw new Error(`Year ${next.year}: zero-price purchase rejected for ${leg.bucketId} (no disposal or loss fiction)`);
        }
        continue;
      }
      const amount = Math.min(leg.euros, cash);
      if (amount < LEDGER_DUST_EUR) continue;
      if (amount / price === 0) continue;
      applyTransactionInBatch(next, seen, { id: id(`buy-${leg.bucketId}`), kind: 'purchase', fundId: leg.bucketId, cashId: settlement, amount });
      trades.push({ bucketId: leg.bucketId, kind: 'buy', euros: amount, units: amount / price });
    }
  }

  return { trades, fundedWithdrawal: funded };
}

export function executeLedgerTrialUnified(
  config: LifecycleConfig,
  state: InvestmentState,
  valuesBefore: Record<string, number>,
  targets: Record<string, number>,
  withdrawal: number,
  prices: Record<string, number>,
  idPrefix: string,
  taxId: string,
): { state: InvestmentState; trades: LifecycleTrade[]; fundedWithdrawal: number } {
  const batch = startTransactionBatch(state);
  const applied = applyLedgerTradesInBatch(batch.next, batch.seen, config, valuesBefore, targets, withdrawal, prices, idPrefix);
  reconcileTaxInBatch(batch.next, batch.seen, config.taxCashId, taxId);
  const finished = finishTransactionBatch(batch.next, batch);
  return { state: finished, trades: applied.trades, fundedWithdrawal: applied.fundedWithdrawal };
}

class TrialSeenSet extends Set<string> {
  private readonly baseIds: ReadonlySet<string>;
  constructor(baseIds: ReadonlySet<string>) {
    super();
    this.baseIds = baseIds;
  }
  has(id: string): boolean {
    return this.baseIds.has(id) || super.has(id);
  }
}

export interface LedgerTrialWorkspace {
  readonly next: InvestmentState;
  readonly baseSeen: ReadonlySet<string>;
}

export function startLedgerTrialWorkspace(state: InvestmentState): LedgerTrialWorkspace {
  const batch = startTransactionBatch(state);
  return { next: batch.next, baseSeen: batch.seen };
}

export function executeLedgerTrialInWorkspace(
  workspace: LedgerTrialWorkspace,
  config: LifecycleConfig,
  valuesBefore: Record<string, number>,
  targets: Record<string, number>,
  withdrawal: number,
  prices: Record<string, number>,
  idPrefix: string,
  taxId: string,
  baseYearIncome?: ReconcileBaseYearIncome,
): { trial: InvestmentState; trades: LifecycleTrade[]; fundedWithdrawal: number; rollback: () => void } {
  const next = workspace.next;
  const snapshot = {
    buckets: next.buckets.map((bucket) =>
      bucket.classification === 'deposit'
        ? { ...bucket }
        : { ...bucket, cohorts: bucket.cohorts.map((cohort) => ({ ...cohort })) },
    ),
    taxYears: next.taxYears.map((taxYear) => ({ ...taxYear })),
    transactions: next.transactions.length,
    taxIncome: next.taxIncome.length,
    contributionIncome: next.contributionIncome.length,
    eventIds: next.eventIds.length,
    pending: next.pending.length,
    year: next.year,
    phase: next.phase,
  };
  let rolledBack = false;
  const rollback = (): void => {
    if (rolledBack) return;
    rolledBack = true;
    next.buckets = snapshot.buckets;
    next.taxYears = snapshot.taxYears;
    next.transactions.length = snapshot.transactions;
    next.taxIncome.length = snapshot.taxIncome;
    next.contributionIncome.length = snapshot.contributionIncome;
    next.eventIds.length = snapshot.eventIds;
    if (next.pending.length !== snapshot.pending || next.year !== snapshot.year || next.phase !== snapshot.phase) {
      throw new Error('Ledger trial touched immutable trial scope (pending/year/phase)');
    }
  };
  try {
    const seen = new TrialSeenSet(workspace.baseSeen);
    const applied = applyLedgerTradesInBatch(next, seen, config, valuesBefore, targets, withdrawal, prices, idPrefix);
    reconcileTaxInBatch(next, seen, config.taxCashId, taxId, undefined, baseYearIncome);
    finishTransactionBatch(next, {
      baseCounts: {
        transactions: snapshot.transactions,
        taxIncome: snapshot.taxIncome,
        contributionIncome: snapshot.contributionIncome,
        eventIds: snapshot.eventIds,
      },
    });
    return { trial: next, trades: applied.trades, fundedWithdrawal: applied.fundedWithdrawal, rollback };
  } catch (error) {
    rollback();
    throw error;
  }
}

function applyOpeningTradesInBatch(
  next: InvestmentState,
  seen: Set<string>,
  config: LifecycleConfig,
  valuesBefore: Record<string, number>,
  targets: Record<string, number>,
  year: number,
): LifecycleTrade[] {
  const kinds = kindsOf(config);
  const settlement = config.taxCashId;
  const plan = planLegs(valuesBefore, targets, prioritiesOf(config));
  const trades: LifecycleTrade[] = [];
  let seq = 0;
  const id = (op: string): string => `lifecycle:${year}:opening:${seq++}:${op}`;
  for (const leg of plan.sells) {
    if (leg.bucketId === settlement) continue;
    if (kinds[leg.bucketId] === 'deposit') {
      const amount = Math.min(leg.euros, cashOf(next, leg.bucketId));
      if (amount < LEDGER_DUST_EUR) continue;
      applyTransactionInBatch(next, seen, { id: id(`sell-${leg.bucketId}`), kind: 'transfer', fromId: leg.bucketId, toId: settlement, amount });
      trades.push({ bucketId: leg.bucketId, kind: 'sell', euros: amount, units: amount });
    } else {
      const price = priceOf(next, leg.bucketId);
      const held = unitsHeld(next, leg.bucketId);
      if (held <= 0 || !(price > 0)) continue;
      const units = Math.min(leg.euros / price, held);
      if (units <= 0) continue;
      applyTransactionInBatch(next, seen, { id: id(`sell-${leg.bucketId}`), kind: 'sale', fundId: leg.bucketId, cashId: settlement, units });
      trades.push({ bucketId: leg.bucketId, kind: 'sell', euros: units * price, units });
    }
  }
  for (const leg of plan.buys) {
    if (leg.bucketId === settlement) continue;
    if (leg.euros < LEDGER_DUST_EUR) continue;
    if (kinds[leg.bucketId] === 'deposit') {
      const amount = Math.min(leg.euros, cashOf(next, settlement));
      if (amount < LEDGER_DUST_EUR) continue;
      applyTransactionInBatch(next, seen, { id: id(`buy-${leg.bucketId}`), kind: 'transfer', fromId: settlement, toId: leg.bucketId, amount });
      trades.push({ bucketId: leg.bucketId, kind: 'buy', euros: amount, units: amount });
    } else {
      const price = priceOf(next, leg.bucketId);
      if (!(price > 0)) {
        if (leg.euros >= LEDGER_DUST_EUR && cashOf(next, settlement) >= LEDGER_DUST_EUR) {
          throw new Error(`Year ${year}: zero-price purchase rejected for ${leg.bucketId} (no disposal or loss fiction)`);
        }
        continue;
      }
      const amount = Math.min(leg.euros, cashOf(next, settlement));
      if (amount < LEDGER_DUST_EUR || amount / price === 0) continue;
      applyTransactionInBatch(next, seen, { id: id(`buy-${leg.bucketId}`), kind: 'purchase', fundId: leg.bucketId, cashId: settlement, amount });
      trades.push({ bucketId: leg.bucketId, kind: 'buy', euros: amount, units: amount / price });
    }
  }
  return trades;
}

export function createLedgerState(
  config: LifecycleConfig,
  firstYear: number,
  opening: OpeningBucket[],
): InvestmentState {
  return createLifecycleState(config, firstYear, opening);
}

export function simulateLedgerYear(
  config: LifecycleConfig,
  state: InvestmentState,
  input: LedgerYearInput,
): { state: InvestmentState; report: LedgerYearReport } {
  const configError = validateLifecycleConfig(config);
  if (configError) throw new Error(configError);
  validateLedgerYearInput(config, input);
  assertStateMatchesConfig(config, state, input.year);

  const openingValue = totalValue(state);
  const isFirstYear = state.taxYears.length === 0;
  const firstPrices: Record<string, number> = {};
  for (const id of fundIds(config)) firstPrices[id] = priceOf(state, id);

  const openingTrades: LifecycleTrade[] = [];
  let next: InvestmentState;
  if (isFirstYear) {
    next = beginInvestmentYear(state, input.year, input.allowance, input.churchRate);
    const values0 = valuesSnapshot(next);
    const anchor0 = Math.max(0, totalValue(next));
    const { targetsNominal } = resolveYearlyTargetsEuroUnchecked(config, input.age, anchor0, input.inflationFactor);
    const seen = new Set(next.eventIds);
    const baseCounts = {
      transactions: next.transactions.length,
      taxIncome: next.taxIncome.length,
      contributionIncome: next.contributionIncome.length,
      eventIds: next.eventIds.length,
    };
    openingTrades.push(...applyOpeningTradesInBatch(next, seen, config, values0, targetsNominal, input.year));
    applyAnnualPricesAndInterestInBatch(next, seen, input.fundPrices, input.depositRates);
    if (input.contribution > 0) {
      applyTransactionInBatch(next, seen, {
        id: `lifecycle:${input.year}:contrib:external`,
        kind: 'external',
        cashId: config.taxCashId,
        amount: input.contribution,
      });
    }
    next = finishTransactionBatch(next, { baseCounts });
  } else {
    const baseBatch = startTransactionBatch(state);
    beginInvestmentYearInBatch(baseBatch.next, baseBatch.seen, input.year, input.allowance, input.churchRate);
    applyAnnualPricesAndInterestInBatch(baseBatch.next, baseBatch.seen, input.fundPrices, input.depositRates);
    if (input.contribution > 0) {
      applyTransactionInBatch(baseBatch.next, baseBatch.seen, {
        id: `lifecycle:${input.year}:contrib:external`,
        kind: 'external',
        cashId: config.taxCashId,
        amount: input.contribution,
      });
    }
    next = finishTransactionBatch(baseBatch.next, baseBatch);
  }

  const wealthAfterInflows = totalValue(next);
  const valuesAfterInflows = valuesSnapshot(next);
  const cappedWithdrawal = Math.min(input.withdrawalNeed, wealthAfterInflows);
  const priorUnpaid = unpaidTax(next);
  let anchor = wealthAfterInflows - cappedWithdrawal - priorUnpaid;
  let solved = resolveYearlyTargetsEuroUnchecked(config, input.age, Math.max(0, anchor), input.inflationFactor);
  let planTargets = solved.targetsNominal;
  let executedShortfall = solved.shortfall;
  let iterations = 0;
  let exhausted = false;
  let lastLiability = 0;
  let lastBurden = 0;
  const hoistedCapitalIndependent = isCapitalIndependentInsuranceSpec(input.insurance);
  let hoistedBurdenAnnual = 0;
  let hoistedBurden: Extract<ReturnType<typeof resolveInsuranceBurden>, { converged: true }> | null = null;
  if (hoistedCapitalIndependent) {
    const hoisted = resolveInsuranceBurden(input.insurance, next, input.year, input.inflationFactor);
    if (!hoisted.converged) throw new LedgerInsuranceError(hoisted.diagnostics);
    hoistedBurden = hoisted;
    hoistedBurdenAnnual = (hoisted.result.ownKvMonthly + hoisted.result.ownPvMonthly) * 12;
  }
  const baseSeen = new Set(next.eventIds);
  const trialWorkspace: LedgerTrialWorkspace = { next, baseSeen };
  let trialBaseYearIncome = 0;
  for (const incomeRecord of next.taxIncome) {
    if (incomeRecord.ledgerYear === input.year) trialBaseYearIncome = finite(incomeRecord.amount + trialBaseYearIncome);
  }
  const trialBase: ReconcileBaseYearIncome = { base: trialBaseYearIncome, fromIndex: next.taxIncome.length };
  for (let k = 0; k < LEDGER_MAX_SOLVER_ITERATIONS; k++) {
    const trialExec = executeLedgerTrialInWorkspace(
      trialWorkspace,
      config,
      valuesAfterInflows,
      planTargets,
      cappedWithdrawal,
      input.fundPrices,
      `lifecycle:${input.year}:trial:${k}`,
      `lifecycle:${input.year}:trial:${k}:tax`,
      trialBase,
    );
    let trialLiability!: number;
    let trialBurden!: number;
    let following!: number;
    try {
      const trial = trialExec.trial;
      trialLiability = 0;
      for (const t of trial.taxYears) { if (t.year === input.year) { trialLiability = t.liability; break; } }
      if (hoistedBurden !== null) {
        trialBurden = hoistedBurdenAnnual;
      } else {
        const burden = resolveInsuranceBurden(input.insurance, trial, input.year, input.inflationFactor);
        if (!burden.converged) throw new LedgerInsuranceError(burden.diagnostics);
        trialBurden = (burden.result.ownKvMonthly + burden.result.ownPvMonthly) * 12;
      }
      following = wealthAfterInflows - cappedWithdrawal - priorUnpaid - trialLiability - trialBurden;
    } finally {
      trialExec.rollback();
    }
    lastLiability = trialLiability;
    lastBurden = trialBurden;
    iterations = k + 1;
    if (Math.abs(following - anchor) < LEDGER_SOLVER_TOLERANCE_EUR) break;
    if (k === LEDGER_MAX_SOLVER_ITERATIONS - 1) {
      exhausted = true;
      break;
    }
    anchor = following;
    solved = resolveYearlyTargetsEuroUnchecked(config, input.age, Math.max(0, anchor), input.inflationFactor);
    planTargets = solved.targetsNominal;
    executedShortfall = solved.shortfall;
  }

  const reserve = priorUnpaid + lastLiability + lastBurden;
  const enforceReserve = anchor <= 0;
  // Trials only roll back: eventIds are length-truncated with order preserved, so the
  // id set is unchanged since baseSeen was captured. Reuse it instead of rebuilding
  // an identical set (TrialSeenSet never mutates its base; all trial sets are done).
  const finalSeen = baseSeen;
  const finalCounts = {
    transactions: next.transactions.length,
    taxIncome: next.taxIncome.length,
    contributionIncome: next.contributionIncome.length,
    eventIds: next.eventIds.length,
  };
  const finalApplied = applyLedgerTradesInBatch(next, finalSeen, config, valuesAfterInflows, planTargets, cappedWithdrawal, input.fundPrices, `lifecycle:${input.year}`, reserve, enforceReserve);

  const fundedWithdrawal = input.withdrawalNeed === 0 ? 0 : finalApplied.fundedWithdrawal;
  reconcileTaxInBatch(next, finalSeen, config.taxCashId, `lifecycle:${input.year}:tax`);
  let taxPaidCurrentYear = 0;
  let finalLiability = 0;
  for (const t of next.taxYears) { if (t.year === input.year) { taxPaidCurrentYear = t.paid; finalLiability = t.liability; break; } }
  if (!Number.isInteger(input.year)) throw new Error(`Invalid ledger year ${input.year}`);
  if (next.year !== input.year) throw new Error(`Year ${input.year}: arrears settle on the executed closing state of the same year`);
  if (next.phase !== 'closing') throw new Error(`Year ${input.year}: arrears settle after reconcileTax in closing phase`);
  const arrearsPaidByYear: Record<number, number> = {};
  {
    for (const entry of next.taxYears) {
      if (!(entry.year < input.year && entry.liability - entry.paid > 0)) continue;
      let live: (typeof next.taxYears)[number] | undefined;
      for (const t of next.taxYears) { if (t.year === entry.year) { live = t; break; } }
      if (!live) throw new Error(`Year ${input.year}: dated liability for ${entry.year} vanished`);
      const outstanding = Math.max(0, live.liability - live.paid);
      if (outstanding <= 0) continue;
      const arrearsCash = cashOf(next, config.taxCashId);
      if (arrearsCash <= 0) break;
      const payment = Math.min(arrearsCash, outstanding);
      if (payment <= 0) break;
      applyTransactionInBatch(next, finalSeen, {
        id: `lifecycle:${input.year}:arrears:${entry.year}`,
        kind: 'external',
        cashId: config.taxCashId,
        amount: -payment,
      });
      let updated: (typeof next.taxYears)[number] | undefined;
      for (const t of next.taxYears) { if (t.year === entry.year) { updated = t; break; } }
      if (!updated) throw new Error(`Year ${input.year}: dated liability for ${entry.year} vanished`);
      updated.paid += payment;
      if (updated.paid > updated.liability) throw new Error(`Year ${input.year}: arrears overpayment for ${entry.year}`);
      arrearsPaidByYear[entry.year] = payment;
    }
  }
  void unpaidTax(next);
  let arrearsTotal = 0;
  for (const k in arrearsPaidByYear) { if (Object.hasOwn(arrearsPaidByYear, k)) arrearsTotal += arrearsPaidByYear[k] as number; }

  let insurance: Extract<ReturnType<typeof resolveInsuranceBurden>, { converged: true }>;
  if (hoistedBurden !== null) {
    const finalAssessmentIncomeAnnual = sumAssessmentIncomeAnnual(next, input.year);
    insurance = { ...hoistedBurden, assessmentIncomeAnnual: finalAssessmentIncomeAnnual };
  } else {
    const fresh = resolveInsuranceBurden(input.insurance, next, input.year, input.inflationFactor);
    if (!fresh.converged) throw new LedgerInsuranceError(fresh.diagnostics);
    insurance = fresh;
  }
  const kvAnnual = insurance.result.ownKvMonthly * 12;
  const pvAnnual = insurance.result.ownPvMonthly * 12;
  let insurancePaidKv = 0;
  let insurancePaidPv = 0;
  const settlementBalance = (): number => cashOf(next, config.taxCashId);
  const kvPay = Math.min(settlementBalance(), kvAnnual);
  if (kvPay > 0) {
    applyTransactionInBatch(next, finalSeen, { id: `lifecycle:${input.year}:insurance:kv`, kind: 'external', cashId: config.taxCashId, amount: -kvPay });
    insurancePaidKv = kvPay;
  }
  const pvPay = Math.min(settlementBalance(), pvAnnual);
  if (pvPay > 0) {
    applyTransactionInBatch(next, finalSeen, { id: `lifecycle:${input.year}:insurance:pv`, kind: 'external', cashId: config.taxCashId, amount: -pvPay });
    insurancePaidPv = pvPay;
  }

  closeWithPendingVPInBatch(next, finalSeen, firstPrices, input.basisRate);
  next = finishTransactionBatch(next, { baseCounts: finalCounts });

  const burdenAnnual = kvAnnual + pvAnnual;
  const anchorFinalMeasured = wealthAfterInflows - fundedWithdrawal - priorUnpaid - finalLiability - burdenAnnual;
  const accepted = exhausted
    ? { targetsNominal: planTargets, shortfall: executedShortfall }
    : resolveYearlyTargetsEuroUnchecked(config, input.age, Math.max(0, anchorFinalMeasured), input.inflationFactor);
  const anchorFinal = Math.max(0, anchorFinalMeasured);

  const report: LedgerYearReport = {
    age: input.age,
    year: input.year,
    openingValue,
    closingValue: totalValue(next),
    contribution: input.contribution,
    withdrawal: fundedWithdrawal,
    taxPaid: taxPaidCurrentYear + arrearsTotal,
    unpaidTax: unpaidTax(next),
    anchorNominal: anchorFinal,
    iterations,
    solverExhausted: exhausted,
    trades: [...openingTrades, ...finalApplied.trades],
    targetsNominal: accepted.targetsNominal,
    valuesNominal: valuesSnapshot(next),
    shortfall: accepted.shortfall,
    unfundedWithdrawal: input.withdrawalNeed - fundedWithdrawal,
    taxPaidCurrentYear,
    arrearsPaidByYear: arrearsPaidByYear,
    remainingLiabilities: outstandingByYear(next),
    insurancePaidKv,
    insurancePaidPv,
    insurancePaid: insurancePaidKv + insurancePaidPv,
    unfundedInsuranceKv: kvAnnual - insurancePaidKv,
    unfundedInsurancePv: pvAnnual - insurancePaidPv,
    assessmentIncomeAnnual: insurance.assessmentIncomeAnnual,
    capitalAssessmentAnnual: insurance.capitalAssessmentAnnual,
    insuranceStatus: insurance.result.status,
    insuranceEffectiveStatus:
      insurance.result.status === 'automatic'
        ? insurance.result.effectiveStatus
        : input.insurance.status === 'kvdr'
          ? 'kvdr'
          : 'voluntary',
    insuranceConverged: true,
    insuranceAssumption: insurance.assumption,
  };
  return { state: next, report };
}

export function simulateLedger(
  config: LifecycleConfig,
  initialState: InvestmentState,
  years: LedgerYearInput[],
): LedgerResult {
  const configError = validateLifecycleConfig(config);
  if (configError) throw new Error(configError);
  const reports: LedgerYearReport[] = [];
  let state = initialState;
  for (const input of years) {
    const step = simulateLedgerYear(config, state, input);
    state = step.state;
    reports.push(step.report);
  }
  return { state, reports };
}
