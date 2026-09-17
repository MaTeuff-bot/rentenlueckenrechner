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
import type { InvestmentState } from '../investmentTax/index.js';
import {
  buildRebalancePlan,
  createLifecycleState,
  resolveYearlyTargetsEuro,
  validateLifecycleConfig,
} from '../lifecycleAllocation/index.js';
import type {
  LifecycleBucketKind,
  LifecycleConfig,
  LifecycleTrade,
} from '../lifecycleAllocation/index.js';
import type { OpeningBucket } from '../investmentTax/index.js';
import { outstandingByYear, settleArrears } from './arrears.js';
import { resolveInsuranceBurden } from './insuranceAssessment.js';
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

function kindsOf(config: LifecycleConfig): Record<string, LifecycleBucketKind> {
  const kinds: Record<string, LifecycleBucketKind> = {};
  for (const b of config.buckets) kinds[b.id] = b.kind;
  return kinds;
}

function prioritiesOf(config: LifecycleConfig): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of config.buckets) out[b.id] = b.priority;
  return out;
}

function fundIds(config: LifecycleConfig): string[] {
  return config.buckets.filter((b) => b.kind !== 'deposit').map((b) => b.id);
}

function depositIds(config: LifecycleConfig): string[] {
  return config.buckets.filter((b) => b.kind === 'deposit').map((b) => b.id);
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
  return b.cohorts.reduce((n, c) => n + c.units, 0);
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
  if (![0, 0.08, 0.09].includes(input.churchRate)) throw new Error(`Year ${input.year}: invalid church rate`);
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
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new Error(`Year ${input.year}: invalid deposit rate`);
  }
  const spec = input.insurance;
  if (!spec || typeof spec !== 'object') throw new Error(`Year ${input.year}: insurance spec is required`);
  if (!['kvdr', 'voluntary', 'unknown'].includes(spec.status)) throw new Error(`Year ${input.year}: invalid insurance status`);
  if (!['bridge', 'pension'].includes(spec.phase)) throw new Error(`Year ${input.year}: invalid insurance phase`);
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
  const plan = buildRebalancePlan(valuesBefore, targets, priorities);
  return {
    sells: plan.sells.map((l) => ({ bucketId: l.bucketId, euros: l.euros })),
    buys: plan.buys.map((l) => ({ bucketId: l.bucketId, euros: l.euros })),
  };
}

function executeLedgerUnified(
  config: LifecycleConfig,
  state: InvestmentState,
  valuesBefore: Record<string, number>,
  targets: Record<string, number>,
  withdrawal: number,
  prices: Record<string, number>,
  idPrefix: string,
  reserve = 0,
  enforceReserve = false,
): { state: InvestmentState; trades: LifecycleTrade[]; fundedWithdrawal: number } {
  const kinds = kindsOf(config);
  const settlement = config.taxCashId;
  const plan = planLegs(valuesBefore, targets, prioritiesOf(config));
  const trades: LifecycleTrade[] = [];
  let next = state;
  let seq = 0;
  const id = (op: string): string => `${idPrefix}:${seq++}:${op}`;

  const sells = plan.sells.filter((l) => l.bucketId !== settlement);
  const buys = plan.buys.filter((l) => l.bucketId !== settlement);

  for (const leg of sells) {
    if (kinds[leg.bucketId] === 'deposit') {
      const available = cashOf(next, leg.bucketId);
      const amount = Math.min(leg.euros, available);
      if (amount < LEDGER_DUST_EUR) continue;
      next = applyTransaction(next, { id: id(`sell-${leg.bucketId}`), kind: 'transfer', fromId: leg.bucketId, toId: settlement, amount });
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
      next = applyTransaction(next, { id: id(`sell-${leg.bucketId}`), kind: 'sale', fundId: leg.bucketId, cashId: settlement, units });
      trades.push({ bucketId: leg.bucketId, kind: 'sell', euros: units * price, units });
    }
  }

  let funded = 0;
  if (withdrawal > 0) {
    const need = withdrawal;
    const buyByBucket = new Map(buys.map((l) => [l.bucketId, l.euros]));
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
          next = applyTransaction(next, { id: id(`draw-${best}`), kind: 'transfer', fromId: best, toId: settlement, amount });
          trades.push({ bucketId: best, kind: 'sell', euros: amount, units: amount });
          const pending = buyByBucket.get(best) ?? 0;
          if (pending > 0) buyByBucket.set(best, Math.max(0, pending - amount));
        } else {
          const price = prices[best] ?? 0;
          const held = unitsHeld(next, best);
          if (!(price > 0) || held <= 0) break;
          const units = Math.min(missing / price, held);
          if (units <= 0) break;
          next = applyTransaction(next, { id: id(`draw-${best}`), kind: 'sale', fundId: best, cashId: settlement, units });
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
      next = applyTransaction(next, { id: id('withdraw'), kind: 'external', cashId: settlement, amount: -funded });
    }
  }

  for (const leg of buys) {
    if (leg.euros < LEDGER_DUST_EUR) continue;
    const cash = cashOf(next, settlement);
    if (cash < LEDGER_DUST_EUR) break;
    if (kinds[leg.bucketId] === 'deposit') {
      const amount = Math.min(leg.euros, cash);
      if (amount < LEDGER_DUST_EUR) continue;
      next = applyTransaction(next, { id: id(`buy-${leg.bucketId}`), kind: 'transfer', fromId: settlement, toId: leg.bucketId, amount });
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
      next = applyTransaction(next, { id: id(`buy-${leg.bucketId}`), kind: 'purchase', fundId: leg.bucketId, cashId: settlement, amount });
      trades.push({ bucketId: leg.bucketId, kind: 'buy', euros: amount, units: amount / price });
    }
  }

  return { state: next, trades, fundedWithdrawal: funded };
}

function executeOpeningLedger(
  config: LifecycleConfig,
  state: InvestmentState,
  valuesBefore: Record<string, number>,
  targets: Record<string, number>,
  year: number,
): { state: InvestmentState; trades: LifecycleTrade[] } {
  const kinds = kindsOf(config);
  const settlement = config.taxCashId;
  const plan = planLegs(valuesBefore, targets, prioritiesOf(config));
  const trades: LifecycleTrade[] = [];
  let next = state;
  let seq = 0;
  const id = (op: string): string => `lifecycle:${year}:opening:${seq++}:${op}`;
  for (const leg of plan.sells) {
    if (leg.bucketId === settlement) continue;
    if (kinds[leg.bucketId] === 'deposit') {
      const amount = Math.min(leg.euros, cashOf(next, leg.bucketId));
      if (amount < LEDGER_DUST_EUR) continue;
      next = applyTransaction(next, { id: id(`sell-${leg.bucketId}`), kind: 'transfer', fromId: leg.bucketId, toId: settlement, amount });
      trades.push({ bucketId: leg.bucketId, kind: 'sell', euros: amount, units: amount });
    } else {
      const price = priceOf(next, leg.bucketId);
      const held = unitsHeld(next, leg.bucketId);
      if (held <= 0 || !(price > 0)) continue;
      const units = Math.min(leg.euros / price, held);
      if (units <= 0) continue;
      next = applyTransaction(next, { id: id(`sell-${leg.bucketId}`), kind: 'sale', fundId: leg.bucketId, cashId: settlement, units });
      trades.push({ bucketId: leg.bucketId, kind: 'sell', euros: units * price, units });
    }
  }
  for (const leg of plan.buys) {
    if (leg.bucketId === settlement) continue;
    if (leg.euros < LEDGER_DUST_EUR) continue;
    if (kinds[leg.bucketId] === 'deposit') {
      const amount = Math.min(leg.euros, cashOf(next, settlement));
      if (amount < LEDGER_DUST_EUR) continue;
      next = applyTransaction(next, { id: id(`buy-${leg.bucketId}`), kind: 'transfer', fromId: settlement, toId: leg.bucketId, amount });
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
      next = applyTransaction(next, { id: id(`buy-${leg.bucketId}`), kind: 'purchase', fundId: leg.bucketId, cashId: settlement, amount });
      trades.push({ bucketId: leg.bucketId, kind: 'buy', euros: amount, units: amount / price });
    }
  }
  return { state: next, trades };
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

  let next = beginInvestmentYear(state, input.year, input.allowance, input.churchRate);
  const openingTrades: LifecycleTrade[] = [];
  if (isFirstYear) {
    const values0 = valuesSnapshot(next);
    const anchor0 = Math.max(0, totalValue(next));
    const { targetsNominal } = resolveYearlyTargetsEuro(config, input.age, anchor0, input.inflationFactor);
    const executed = executeOpeningLedger(config, next, values0, targetsNominal, input.year);
    next = executed.state;
    openingTrades.push(...executed.trades);
  }

  next = applyAnnualPricesAndInterest(next, input.fundPrices, input.depositRates);

  if (input.contribution > 0) {
    next = applyTransaction(next, {
      id: `lifecycle:${input.year}:contrib:external`,
      kind: 'external',
      cashId: config.taxCashId,
      amount: input.contribution,
    });
  }

  const wealthAfterInflows = totalValue(next);
  const valuesAfterInflows = valuesSnapshot(next);
  const cappedWithdrawal = Math.min(input.withdrawalNeed, wealthAfterInflows);
  const priorUnpaid = unpaidTax(next);
  let anchor = wealthAfterInflows - cappedWithdrawal - priorUnpaid;
  let solved = resolveYearlyTargetsEuro(config, input.age, Math.max(0, anchor), input.inflationFactor);
  let planTargets = solved.targetsNominal;
  let executedShortfall = solved.shortfall;
  let iterations = 0;
  let exhausted = false;
  let lastLiability = 0;
  let lastBurden = 0;
  for (let k = 0; k < LEDGER_MAX_SOLVER_ITERATIONS; k++) {
    const trialBase: InvestmentState = structuredClone(next);
    const trialExec = executeLedgerUnified(config, trialBase, valuesAfterInflows, planTargets, cappedWithdrawal, input.fundPrices, `lifecycle:${input.year}:trial:${k}`);
    let trial = trialExec.state;
    trial = reconcileTax(trial, config.taxCashId, `lifecycle:${input.year}:trial:${k}:tax`);
    const trialLiability = trial.taxYears.find((t) => t.year === input.year)?.liability ?? 0;
    const burden = resolveInsuranceBurden(input.insurance, trial, input.year, input.inflationFactor);
    if (!burden.converged) throw new LedgerInsuranceError(burden.diagnostics);
    const trialBurden = (burden.result.ownKvMonthly + burden.result.ownPvMonthly) * 12;
    lastLiability = trialLiability;
    lastBurden = trialBurden;
    const following = wealthAfterInflows - cappedWithdrawal - priorUnpaid - trialLiability - trialBurden;
    iterations = k + 1;
    if (Math.abs(following - anchor) < LEDGER_SOLVER_TOLERANCE_EUR) break;
    if (k === LEDGER_MAX_SOLVER_ITERATIONS - 1) {
      exhausted = true;
      break;
    }
    anchor = following;
    solved = resolveYearlyTargetsEuro(config, input.age, Math.max(0, anchor), input.inflationFactor);
    planTargets = solved.targetsNominal;
    executedShortfall = solved.shortfall;
  }

  const reserve = priorUnpaid + lastLiability + lastBurden;
  const enforceReserve = anchor <= 0;
  const finalExec = executeLedgerUnified(config, next, valuesAfterInflows, planTargets, cappedWithdrawal, input.fundPrices, `lifecycle:${input.year}`, reserve, enforceReserve);
  next = finalExec.state;
  const fundedWithdrawal = input.withdrawalNeed === 0 ? 0 : finalExec.fundedWithdrawal;

  next = reconcileTax(next, config.taxCashId, `lifecycle:${input.year}:tax`);
  const currentEntry = next.taxYears.find((t) => t.year === input.year);
  const taxPaidCurrentYear = currentEntry?.paid ?? 0;
  const finalLiability = currentEntry?.liability ?? 0;

  const arrears = settleArrears(next, config.taxCashId, input.year);
  next = arrears.state;
  const arrearsTotal = Object.values(arrears.paidByYear).reduce((n, v) => n + v, 0);

  const insurance = resolveInsuranceBurden(input.insurance, next, input.year, input.inflationFactor);
  if (!insurance.converged) throw new LedgerInsuranceError(insurance.diagnostics);
  const kvAnnual = insurance.result.ownKvMonthly * 12;
  const pvAnnual = insurance.result.ownPvMonthly * 12;
  let insurancePaidKv = 0;
  let insurancePaidPv = 0;
  const settlementBalance = (): number => cashOf(next, config.taxCashId);
  const kvPay = Math.min(settlementBalance(), kvAnnual);
  if (kvPay > 0) {
    next = applyTransaction(next, { id: `lifecycle:${input.year}:insurance:kv`, kind: 'external', cashId: config.taxCashId, amount: -kvPay });
    insurancePaidKv = kvPay;
  }
  const pvPay = Math.min(settlementBalance(), pvAnnual);
  if (pvPay > 0) {
    next = applyTransaction(next, { id: `lifecycle:${input.year}:insurance:pv`, kind: 'external', cashId: config.taxCashId, amount: -pvPay });
    insurancePaidPv = pvPay;
  }

  next = closeWithPendingVP(next, firstPrices, input.basisRate);

  const burdenAnnual = kvAnnual + pvAnnual;
  const anchorFinalMeasured = wealthAfterInflows - fundedWithdrawal - priorUnpaid - finalLiability - burdenAnnual;
  const accepted = exhausted
    ? { targetsNominal: planTargets, shortfall: executedShortfall }
    : resolveYearlyTargetsEuro(config, input.age, Math.max(0, anchorFinalMeasured), input.inflationFactor);
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
    trades: [...openingTrades, ...finalExec.trades],
    targetsNominal: accepted.targetsNominal,
    valuesNominal: valuesSnapshot(next),
    shortfall: accepted.shortfall,
    unfundedWithdrawal: input.withdrawalNeed - fundedWithdrawal,
    taxPaidCurrentYear,
    arrearsPaidByYear: arrears.paidByYear,
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
