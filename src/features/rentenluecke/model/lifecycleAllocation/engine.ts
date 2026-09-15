import {
  applyAnnualPricesAndInterest,
  applyTransaction,
  beginInvestmentYear,
  bucketValue,
  closeWithPendingVP,
  createInvestmentState,
  reconcileTax,
  totalValue,
  unpaidTax,
} from '../investmentTax/index.js';
import type { InvestmentState, OpeningBucket } from '../investmentTax/index.js';
import { buildRebalancePlan, DUST_EUR } from './rebalance.js';
import { resolveYearlyTargetsEuro, validateLifecycleConfig } from './targets.js';
import type {
  LifecycleBucketKind,
  LifecycleConfig,
  LifecycleResult,
  LifecycleTrade,
  LifecycleYearInput,
  LifecycleYearReport,
} from './types.js';

const MAX_SOLVER_ITERATIONS = 8;
const SOLVER_TOLERANCE_EUR = 0.005;

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

function validateYearInput(config: LifecycleConfig, input: LifecycleYearInput): void {
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
    throw new Error(`Year ${input.year}: invalid inflation factor`);
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
}

export function createLifecycleState(
  config: LifecycleConfig,
  firstYear: number,
  opening: OpeningBucket[],
): InvestmentState {
  const err = validateLifecycleConfig(config);
  if (err) throw new Error(err);
  if (!Number.isInteger(firstYear)) throw new Error(`Invalid first year ${firstYear}`);
  const kinds = kindsOf(config);
  const seen = new Set<string>();
  for (const b of opening) {
    if (seen.has(b.id)) throw new Error(`Duplicate opening bucket ${b.id}`);
    seen.add(b.id);
    if (!kinds[b.id]) throw new Error(`Opening bucket ${b.id} is not configured`);
    const expected = kinds[b.id] === 'deposit' ? 'deposit' : kinds[b.id];
    if (b.classification !== expected) throw new Error(`Opening bucket ${b.id} kind does not match config`);
    if (b.classification !== 'deposit' && !(b.price > 0)) {
      throw new Error(`Opening fund ${b.id} needs a reference price > 0`);
    }
  }
  for (const b of config.buckets) {
    if (!seen.has(b.id)) throw new Error(`Opening misses configured bucket ${b.id}`);
  }
  return createInvestmentState(firstYear, opening);
}

interface UnifiedExecution {
  state: InvestmentState;
  trades: LifecycleTrade[];
  fundedWithdrawal: number;
}

export function executeUnified(
  config: LifecycleConfig,
  state: InvestmentState,
  valuesBefore: Record<string, number>,
  targets: Record<string, number>,
  withdrawal: number,
  prices: Record<string, number>,
  idPrefix: string,
): UnifiedExecution {
  const kinds = kindsOf(config);
  const settlement = config.taxCashId;
  const plan = buildRebalancePlan(valuesBefore, targets, prioritiesOf(config));
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
      if (amount < DUST_EUR) continue;
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
    while (need > 0 && cashOf(next, settlement) < need) {
      const missing = need - cashOf(next, settlement);
      // Prefer drawing from buckets WITHOUT a pending buy leg: drawing from a bucket the
      // same plan is about to buy partially realises the gain and immediately reverses part
      // of it. Netted draw-and-buy only as a last resort when nothing else can fund the need.
      const selectBest = (excludePending: boolean): string | null => {
        let best: string | null = null;
        let bestValue = 0;
        for (const b of config.buckets) {
          if (b.id === settlement) continue;
          if (excludePending && (buyByBucket.get(b.id) ?? 0) > DUST_EUR) continue;
          const v = kinds[b.id] === 'deposit' ? cashOf(next, b.id) : unitsHeld(next, b.id) * (prices[b.id] ?? 0);
          if (v > bestValue + DUST_EUR) {
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
        if (amount < DUST_EUR) break;
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
    for (const leg of buys) {
      const adjusted = buyByBucket.get(leg.bucketId);
      if (adjusted !== undefined) leg.euros = adjusted;
    }
    const available = cashOf(next, settlement);
    funded = Math.min(need, available);
    if (funded > 0) {
      next = applyTransaction(next, { id: id('withdraw'), kind: 'external', cashId: settlement, amount: -funded });
    }
  }

  for (const leg of buys) {
    if (leg.euros < DUST_EUR) continue;
    const cash = cashOf(next, settlement);
    if (cash < DUST_EUR) break;
    if (kinds[leg.bucketId] === 'deposit') {
      const amount = Math.min(leg.euros, cash);
      if (amount < DUST_EUR) continue;
      next = applyTransaction(next, { id: id(`buy-${leg.bucketId}`), kind: 'transfer', fromId: settlement, toId: leg.bucketId, amount });
      trades.push({ bucketId: leg.bucketId, kind: 'buy', euros: amount, units: amount });
    } else {
      const price = prices[leg.bucketId] ?? 0;
      if (!(price > 0)) continue;
      const amount = Math.min(leg.euros, cash);
      if (amount < DUST_EUR) continue;
      if (amount / price === 0) continue;
      next = applyTransaction(next, { id: id(`buy-${leg.bucketId}`), kind: 'purchase', fundId: leg.bucketId, cashId: settlement, amount });
      trades.push({ bucketId: leg.bucketId, kind: 'buy', euros: amount, units: amount / price });
    }
  }
  return { state: next, trades, fundedWithdrawal: funded };
}

function executeOpening(
  config: LifecycleConfig,
  state: InvestmentState,
  valuesBefore: Record<string, number>,
  targets: Record<string, number>,
  year: number,
): { state: InvestmentState; trades: LifecycleTrade[] } {
  const kinds = kindsOf(config);
  const settlement = config.taxCashId;
  const plan = buildRebalancePlan(valuesBefore, targets, prioritiesOf(config));
  const trades: LifecycleTrade[] = [];
  let next = state;
  let seq = 0;
  const id = (op: string): string => `lifecycle:${year}:opening:${seq++}:${op}`;
  for (const leg of plan.sells) {
    if (leg.bucketId === settlement) continue;
    if (kinds[leg.bucketId] === 'deposit') {
      const amount = Math.min(leg.euros, cashOf(next, leg.bucketId));
      if (amount < DUST_EUR) continue;
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
    if (leg.euros < DUST_EUR) continue;
    if (kinds[leg.bucketId] === 'deposit') {
      const amount = Math.min(leg.euros, cashOf(next, settlement));
      if (amount < DUST_EUR) continue;
      next = applyTransaction(next, { id: id(`buy-${leg.bucketId}`), kind: 'transfer', fromId: settlement, toId: leg.bucketId, amount });
      trades.push({ bucketId: leg.bucketId, kind: 'buy', euros: amount, units: amount });
    } else {
      const price = priceOf(next, leg.bucketId);
      if (!(price > 0)) continue;
      const amount = Math.min(leg.euros, cashOf(next, settlement));
      if (amount < DUST_EUR || amount / price === 0) continue;
      next = applyTransaction(next, { id: id(`buy-${leg.bucketId}`), kind: 'purchase', fundId: leg.bucketId, cashId: settlement, amount });
      trades.push({ bucketId: leg.bucketId, kind: 'buy', euros: amount, units: amount / price });
    }
  }
  return { state: next, trades };
}

export function simulateLifecycleYear(
  config: LifecycleConfig,
  state: InvestmentState,
  input: LifecycleYearInput,
): { state: InvestmentState; report: LifecycleYearReport } {
  const configError = validateLifecycleConfig(config);
  if (configError) throw new Error(configError);
  validateYearInput(config, input);
  assertStateMatchesConfig(config, state, input.year);

  const openingValue = totalValue(state);
  const isFirstYear = state.taxYears.length === 0;
  const firstPrices: Record<string, number> = {};
  for (const id of fundIds(config)) firstPrices[id] = priceOf(state, id);

  let next = beginInvestmentYear(state, input.year, input.allowance, input.churchRate);
  const openingTrades: LifecycleTrade[] = [];
  if (isFirstYear) {
    const values0 = valuesSnapshot(next);
    const wealth0 = totalValue(next);
    // Anticipate known year-zero flows so the opening rebalance does not open
    // positions the closing solve must immediately reverse (market/tax refinement
    // still happens at closing; see PLAN section 4.5).
    const funded0 = Math.min(input.withdrawalNeed, wealth0 + input.contribution);
    const anchor0 = Math.max(0, wealth0 + input.contribution - funded0);
    const { targetsNominal } = resolveYearlyTargetsEuro(config, input.age, anchor0, input.inflationFactor);
    const executed = executeOpening(config, next, values0, targetsNominal, input.year);
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

  let anchor = wealthAfterInflows - cappedWithdrawal;
  let planTargets = resolveYearlyTargetsEuro(config, input.age, Math.max(0, anchor), input.inflationFactor).targetsNominal;
  let iterations = 0;
  let exhausted = false;
  for (let k = 0; k < MAX_SOLVER_ITERATIONS; k++) {
    const trialBase: InvestmentState = structuredClone(next);
    const trialExec = executeUnified(config, trialBase, valuesAfterInflows, planTargets, cappedWithdrawal, input.fundPrices, `lifecycle:${input.year}:trial:${k}`);
    let trial = trialExec.state;
    trial = reconcileTax(trial, config.taxCashId, `lifecycle:${input.year}:trial:${k}:tax`);
    const paid = trial.taxYears.find((t) => t.year === input.year)?.paid ?? 0;
    const following = wealthAfterInflows - cappedWithdrawal - paid;
    iterations = k + 1;
    if (Math.abs(following - anchor) < SOLVER_TOLERANCE_EUR) break;
    if (k === MAX_SOLVER_ITERATIONS - 1) {
      exhausted = true;
      break;
    }
    anchor = following;
    planTargets = resolveYearlyTargetsEuro(config, input.age, Math.max(0, anchor), input.inflationFactor).targetsNominal;
  }
  // If the loop exhausted, planTargets is still the LAST TRIALED plan (the update after the
  // final trial is skipped above), so the executed plan is the last measured one.

  const finalExec = executeUnified(config, next, valuesAfterInflows, planTargets, cappedWithdrawal, input.fundPrices, `lifecycle:${input.year}`);
  next = finalExec.state;
  const fundedWithdrawal = input.withdrawalNeed === 0 ? 0 : finalExec.fundedWithdrawal;

  next = reconcileTax(next, config.taxCashId, `lifecycle:${input.year}:tax`);
  const paid = next.taxYears.find((t) => t.year === input.year)?.paid ?? 0;

  next = closeWithPendingVP(next, firstPrices, input.basisRate);

  const anchorFinal = wealthAfterInflows - fundedWithdrawal - paid;
  const accepted = resolveYearlyTargetsEuro(config, input.age, Math.max(0, anchorFinal), input.inflationFactor);

  const report: LifecycleYearReport = {
    age: input.age,
    year: input.year,
    openingValue,
    closingValue: totalValue(next),
    contribution: input.contribution,
    withdrawal: fundedWithdrawal,
    taxPaid: paid,
    unpaidTax: unpaidTax(next),
    anchorNominal: Math.max(0, anchorFinal),
    iterations,
    solverExhausted: exhausted,
    trades: [...openingTrades, ...finalExec.trades],
    targetsNominal: accepted.targetsNominal,
    valuesNominal: valuesSnapshot(next),
    shortfall: accepted.shortfall,
    unfundedWithdrawal: input.withdrawalNeed - fundedWithdrawal,
  };
  return { state: next, report };
}

export function simulateLifecycle(
  config: LifecycleConfig,
  initialState: InvestmentState,
  years: LifecycleYearInput[],
): LifecycleResult {
  const configError = validateLifecycleConfig(config);
  if (configError) throw new Error(configError);
  const reports: LifecycleYearReport[] = [];
  let state = initialState;
  for (const input of years) {
    const step = simulateLifecycleYear(config, state, input);
    state = step.state;
    reports.push(step.report);
  }
  return { state, reports };
}
