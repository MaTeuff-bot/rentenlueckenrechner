import { describe, expect, it } from 'vitest'
import {
  applyAnnualPricesAndInterest,
  applyAnnualPricesAndInterestInBatch,
  applyTransaction,
  applyTransactionInBatch,
  beginInvestmentYear,
  beginInvestmentYearInBatch,
  bucketValue,
  closeWithPendingVP,
  closeWithPendingVPInBatch,
  createInvestmentState,
  finite,
  finishTransactionBatch,
  reconcileTax,
  reconcileTaxInBatch,
  startTransactionBatch,
} from '../investmentTax/index.js'
import type { LifecycleBucketDef, LifecycleConfig } from '../lifecycleAllocation/index.js'
import { resolveYearlyTargetsEuro, resolveYearlyTargetsEuroUnchecked } from '../lifecycleAllocation/index.js'
import {
  createLedgerState,
  executeLedgerTrialInWorkspace,
  executeLedgerTrialUnified,
  simulateLedgerYear,
  startLedgerTrialWorkspace,
} from './index.js'
import type { LedgerInsuranceSpec, LedgerYearInput } from './index.js'

function opening() {
  return [
    { id: 'equity', name: 'Equity', classification: 'equityFund', units: 100, price: 100, acquisitionCost: 8000 },
    { id: 'cash', name: 'Cash', classification: 'deposit', value: 20000 },
  ] as never
}

describe('ledger batching parity', () => {
  it('begin+market+contrib batched is byte-identical to sequential transitions', () => {
    const seq = applyTransaction(
      applyAnnualPricesAndInterest(beginInvestmentYear(createInvestmentState(2026, opening()), 2026, 1000, 0), { equity: 110 }, { cash: 0.02 }),
      { id: 'lifecycle:2026:contrib:external', kind: 'external', cashId: 'cash', amount: 5000 },
    )
    const batch = startTransactionBatch(createInvestmentState(2026, opening()))
    beginInvestmentYearInBatch(batch.next, batch.seen, 2026, 1000, 0)
    applyAnnualPricesAndInterestInBatch(batch.next, batch.seen, { equity: 110 }, { cash: 0.02 })
    applyTransactionInBatch(batch.next, batch.seen, { id: 'lifecycle:2026:contrib:external', kind: 'external', cashId: 'cash', amount: 5000 })
    const batched = finishTransactionBatch(batch.next)
    expect(JSON.stringify(batched)).toBe(JSON.stringify(seq))
  })
  it('batched second year with VP receipt matches sequential', () => {
    const first = (s: never) => s
    void first
    const seq0 = closeWithPendingVP(
      reconcileTax(
        applyAnnualPricesAndInterest(beginInvestmentYear(createInvestmentState(2026, opening()), 2026, 1000, 0), { equity: 110 }, { cash: 0.02 }),
        'cash',
        'annual-tax:2026',
      ),
      { equity: 100 },
      0.025,
    )
    const b0 = startTransactionBatch(createInvestmentState(2026, opening()))
    beginInvestmentYearInBatch(b0.next, b0.seen, 2026, 1000, 0)
    applyAnnualPricesAndInterestInBatch(b0.next, b0.seen, { equity: 110 }, { cash: 0.02 })
    reconcileTaxInBatch(b0.next, b0.seen, 'cash', 'annual-tax:2026')
    closeWithPendingVPInBatch(b0.next, b0.seen, { equity: 100 }, 0.025)
    const batched0 = finishTransactionBatch(b0.next)
    expect(JSON.stringify(batched0)).toBe(JSON.stringify(seq0))
    const seq1 = closeWithPendingVP(
      reconcileTax(applyAnnualPricesAndInterest(beginInvestmentYear(seq0, 2027, 1000, 0), { equity: 120 }, { cash: 0.01 }), 'cash', 'annual-tax:2027'),
      { equity: 110 },
      0.025,
    )
    const b1 = startTransactionBatch(batched0)
    beginInvestmentYearInBatch(b1.next, b1.seen, 2027, 1000, 0)
    applyAnnualPricesAndInterestInBatch(b1.next, b1.seen, { equity: 120 }, { cash: 0.01 })
    reconcileTaxInBatch(b1.next, b1.seen, 'cash', 'annual-tax:2027')
    closeWithPendingVPInBatch(b1.next, b1.seen, { equity: 110 }, 0.025)
    expect(JSON.stringify(finishTransactionBatch(b1.next))).toBe(JSON.stringify(seq1))
  })
  it('scoped finish agrees with full validation on batch-produced and adversarial states', () => {
    const base = closeWithPendingVP(
      reconcileTax(
        applyAnnualPricesAndInterest(beginInvestmentYear(createInvestmentState(2026, opening()), 2026, 1000, 0), { equity: 110 }, { cash: 0.02 }),
        'cash',
        'annual-tax:2026',
      ),
      { equity: 100 },
      0.025,
    )
    const batch = startTransactionBatch(base)
    beginInvestmentYearInBatch(batch.next, batch.seen, 2027, 1000, 0)
    applyAnnualPricesAndInterestInBatch(batch.next, batch.seen, { equity: 120 }, { cash: 0.01 })
    applyTransactionInBatch(batch.next, batch.seen, { id: 'lifecycle:2027:contrib:external', kind: 'external', cashId: 'cash', amount: 100 } as never)
    reconcileTaxInBatch(batch.next, batch.seen, 'cash', 'lifecycle:2027:tax')
    const scoped = finishTransactionBatch(batch.next, batch)
    const full = finishTransactionBatch(batch.next)
    expect(JSON.stringify(scoped)).toBe(JSON.stringify(full))
    const badTail = startTransactionBatch(base)
    beginInvestmentYearInBatch(badTail.next, badTail.seen, 2027, 1000, 0)
    applyAnnualPricesAndInterestInBatch(badTail.next, badTail.seen, { equity: 120 }, { cash: 0.01 })
    applyTransactionInBatch(badTail.next, badTail.seen, { id: 'ok', kind: 'external', cashId: 'cash', amount: 1 } as never)
    badTail.next.taxIncome.push({ id: 'bad', bucketId: 'cash', kind: 'interest', ledgerYear: 2027, receiptYear: 2027, gross: NaN, exemptFraction: 0, amount: NaN })
    expect(() => finishTransactionBatch(badTail.next, badTail)).toThrow()
    expect(() => finishTransactionBatch(badTail.next)).toThrow()
    const shrunk = startTransactionBatch(base)
    beginInvestmentYearInBatch(shrunk.next, shrunk.seen, 2027, 1000, 0)
    applyAnnualPricesAndInterestInBatch(shrunk.next, shrunk.seen, { equity: 120 }, { cash: 0.01 })
    applyTransactionInBatch(shrunk.next, shrunk.seen, { id: 'ok2', kind: 'external', cashId: 'cash', amount: 1 } as never)
    shrunk.next.transactions.pop()
    shrunk.next.transactions.push({ id: 'bad', year: 2027, kind: 'interest', bucketId: 'cash', cash: NaN, basis: 0, assessedVP: 0 })
    expect(() => finishTransactionBatch(shrunk.next, shrunk)).toThrow()
    const badBucket = startTransactionBatch(base)
    beginInvestmentYearInBatch(badBucket.next, badBucket.seen, 2027, 1000, 0)
    const cash = badBucket.next.buckets.find((b) => b.id === 'cash')
    if (!cash || cash.classification !== 'deposit') throw new Error('missing cash')
    cash.value = -1
    expect(() => finishTransactionBatch(badBucket.next, badBucket)).toThrow()
  })
  it('batch ops never mutate frozen prefix audit elements', () => {
    const base = closeWithPendingVP(
      reconcileTax(
        applyAnnualPricesAndInterest(beginInvestmentYear(createInvestmentState(2026, opening()), 2026, 1000, 0), { equity: 110 }, { cash: 0.02 }),
        'cash',
        'annual-tax:2026',
      ),
      { equity: 100 },
      0.025,
    )
    const batch = startTransactionBatch(base)
    for (const r of batch.next.taxIncome) Object.freeze(r)
    for (const r of batch.next.contributionIncome) Object.freeze(r)
    for (const t of batch.next.transactions) Object.freeze(t)
    beginInvestmentYearInBatch(batch.next, batch.seen, 2027, 1000, 0)
    applyAnnualPricesAndInterestInBatch(batch.next, batch.seen, { equity: 120 }, { cash: 0.01 })
    applyTransactionInBatch(batch.next, batch.seen, { id: 'lifecycle:2027:contrib:external', kind: 'external', cashId: 'cash', amount: 50 } as never)
    reconcileTaxInBatch(batch.next, batch.seen, 'cash', 'lifecycle:2027:tax')
    closeWithPendingVPInBatch(batch.next, batch.seen, { equity: 110 }, 0.025)
    expect(() => finishTransactionBatch(batch.next, batch)).not.toThrow()
  })
  it('duplicate and phase errors surface identically in batch', () => {
    const s = beginInvestmentYear(createInvestmentState(2026, opening()), 2026, 1000, 0)
    expect(() => applyTransaction(s, { id: 'dup', kind: 'external', cashId: 'cash', amount: 1 } as never)).not.toThrow()
    const b = startTransactionBatch(createInvestmentState(2026, opening()))
    beginInvestmentYearInBatch(b.next, b.seen, 2026, 1000, 0)
    applyTransactionInBatch(b.next, b.seen, { id: 'dup', kind: 'external', cashId: 'cash', amount: 1 } as never)
    expect(() => applyTransactionInBatch(b.next, b.seen, { id: 'dup', kind: 'external', cashId: 'cash', amount: 2 } as never)).toThrow(/Duplicate event/)
    expect(() => beginInvestmentYearInBatch(b.next, b.seen, 2027, 1000, 0)).toThrow()
  })
})

describe('rollback solver trials', () => {
  const defs: LifecycleBucketDef[] = [
    { id: 'cash', name: 'Cash', kind: 'deposit', priority: 1 },
    { id: 'bond', name: 'Bond fund', kind: 'bondFund', priority: 2 },
    { id: 'equity', name: 'Equity fund', kind: 'equityFund', priority: 3 },
  ]
  function cfg(): LifecycleConfig {
    return {
      buckets: defs,
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
    }
  }
  function wealthy() {
    return [
      { id: 'cash', name: 'Cash', classification: 'deposit', value: 18000 },
      { id: 'bond', name: 'Bond fund', classification: 'bondFund', units: 270, price: 100, acquisitionCost: 27000 },
      { id: 'equity', name: 'Equity fund', classification: 'equityFund', units: 450, price: 100, acquisitionCost: 45000 },
    ] as never
  }
  function insurance(patch: Partial<LedgerInsuranceSpec> = {}): LedgerInsuranceSpec {
    return {
      status: 'voluntary',
      phase: 'pension',
      calendarYear: 2027,
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
    } as LedgerInsuranceSpec
  }
  function yearInput(patch: Partial<LedgerYearInput> = {}): LedgerYearInput {
    return {
      age: 66,
      year: 2027,
      contribution: 0,
      withdrawalNeed: 1000,
      allowance: 1000,
      churchRate: 0,
      fundPrices: { bond: 101, equity: 102 },
      depositRates: { cash: 0.01 },
      basisRate: 0.025,
      inflationFactor: 1,
      insurance: insurance(),
      ...patch,
    } as LedgerYearInput
  }
  function preTrialBase(specPatch: Partial<LedgerInsuranceSpec> = {}) {
    const config = cfg()
    const first = simulateLedgerYear(
      config,
      createLedgerState(config, 2026, wealthy()),
      { ...yearInput(), age: 65, year: 2026, fundPrices: { bond: 100, equity: 110 }, insurance: insurance({ calendarYear: 2026, ...specPatch }) },
    )
    if (first.state.taxYears.length === 0) throw new Error('expected a non-first-year base')
    const batch = startTransactionBatch(first.state)
    beginInvestmentYearInBatch(batch.next, batch.seen, 2027, 1000, 0)
    applyAnnualPricesAndInterestInBatch(batch.next, batch.seen, { bond: 101, equity: 102 }, { cash: 0.01 })
    const base = finishTransactionBatch(batch.next, batch)
    return { config, base }
  }
  function valuesOf(state: { buckets: Parameters<typeof bucketValue>[0][] }) {
    const out: Record<string, number> = {}
    for (const bucket of state.buckets) out[bucket.id] = bucketValue(bucket)
    return out
  }
  const targets = { cash: 15000, bond: 25000, equity: 40000 }
  const prices = { bond: 101, equity: 102 }
  for (const label of ['hoisted-manual', 'capital-dependent'] as const) {
    it(`workspace trial is byte-identical to a full-clone trial (${label})`, () => {
      const specPatch = label === 'hoisted-manual' ? { manual: { reason: 'rollback parity', kvMonthly: 0, pvMonthly: 0 } } : {}
      const { config, base } = preTrialBase(specPatch)
      const before = JSON.stringify(base)
      const valuesBefore = valuesOf(base)
      const ref = executeLedgerTrialUnified(config, base, valuesBefore, targets, 1000, prices, 'lifecycle:2027:trial:9', 'lifecycle:2027:trial:9:tax')
      expect(JSON.stringify(base)).toBe(before)
      const workspace = startLedgerTrialWorkspace(base)
      const trial = executeLedgerTrialInWorkspace(workspace, config, valuesBefore, targets, 1000, prices, 'lifecycle:2027:trial:9', 'lifecycle:2027:trial:9:tax')
      expect(JSON.stringify(trial.trial)).toBe(JSON.stringify(ref.state))
      expect(trial.trades).toEqual(ref.trades)
      expect(trial.fundedWithdrawal).toBe(ref.fundedWithdrawal)
      trial.rollback()
      expect(JSON.stringify(workspace.next)).toBe(before)
      expect(JSON.stringify(base)).toBe(before)
      const ref2 = executeLedgerTrialUnified(config, base, valuesBefore, { cash: 12000, bond: 22000, equity: 45000 }, 500, prices, 'lifecycle:2027:trial:3', 'lifecycle:2027:trial:3:tax')
      const trial2 = executeLedgerTrialInWorkspace(workspace, config, valuesBefore, { cash: 12000, bond: 22000, equity: 45000 }, 500, prices, 'lifecycle:2027:trial:3', 'lifecycle:2027:trial:3:tax')
      expect(JSON.stringify(trial2.trial)).toBe(JSON.stringify(ref2.state))
      expect(trial2.trades).toEqual(ref2.trades)
      trial2.rollback()
      expect(JSON.stringify(workspace.next)).toBe(before)
    })
  }
  it('duplicate tax id against base history throws in both trial paths', () => {
    const { config, base } = preTrialBase({ manual: { reason: 'rollback parity', kvMonthly: 0, pvMonthly: 0 } })
    const before = JSON.stringify(base)
    const valuesBefore = valuesOf(base)
    const existingId = base.eventIds.find((id) => id === 'lifecycle:2026:tax') ?? base.eventIds[0]
    expect(typeof existingId).toBe('string')
    expect(() => executeLedgerTrialUnified(config, base, valuesBefore, targets, 1000, prices, 'lifecycle:2027:trial:9', existingId as string)).toThrow(/Duplicate event/)
    const workspace = startLedgerTrialWorkspace(base)
    expect(() => executeLedgerTrialInWorkspace(workspace, config, valuesBefore, targets, 1000, prices, 'lifecycle:2027:trial:9', existingId as string)).toThrow(/Duplicate event/)
    expect(JSON.stringify(base)).toBe(before)
    expect(JSON.stringify(workspace.next)).toBe(before)
  })
  it('throwing trial auto-rolls back and leaves base and workspace pristine', () => {
    const { config, base } = preTrialBase({ manual: { reason: 'rollback parity', kvMonthly: 0, pvMonthly: 0 } })
    const before = JSON.stringify(base)
    const valuesBefore = valuesOf(base)
    const zeroPrices = { bond: 101, equity: 0 }
    const forcingTargets = { cash: 1000, bond: 1000, equity: 200000 }
    expect(() => executeLedgerTrialUnified(config, base, valuesBefore, forcingTargets, 0, zeroPrices, 'lifecycle:2027:trial:9', 'lifecycle:2027:trial:9:tax')).toThrow()
    expect(JSON.stringify(base)).toBe(before)
    const workspace = startLedgerTrialWorkspace(base)
    expect(() => executeLedgerTrialInWorkspace(workspace, config, valuesBefore, forcingTargets, 0, zeroPrices, 'lifecycle:2027:trial:9', 'lifecycle:2027:trial:9:tax')).toThrow()
    expect(JSON.stringify(workspace.next)).toBe(before)
    expect(JSON.stringify(base)).toBe(before)
    const valuesAfter = valuesOf(base)
    const ref = executeLedgerTrialUnified(config, base, valuesAfter, targets, 1000, prices, 'lifecycle:2027:trial:1', 'lifecycle:2027:trial:1:tax')
    const retry = executeLedgerTrialInWorkspace(workspace, config, valuesAfter, targets, 1000, prices, 'lifecycle:2027:trial:1', 'lifecycle:2027:trial:1:tax')
    expect(JSON.stringify(retry.trial)).toBe(JSON.stringify(ref.state))
    retry.rollback()
    expect(JSON.stringify(workspace.next)).toBe(before)
  })
  it('workspace trial never mutates frozen prefix audit elements', () => {
    const { config, base } = preTrialBase()
    const before = JSON.stringify(base)
    const workspace = startLedgerTrialWorkspace(base)
    for (const record of workspace.next.taxIncome) Object.freeze(record)
    for (const record of workspace.next.contributionIncome) Object.freeze(record)
    for (const record of workspace.next.transactions) Object.freeze(record)
    const trial = executeLedgerTrialInWorkspace(workspace, config, valuesOf(base), targets, 1000, prices, 'lifecycle:2027:trial:9', 'lifecycle:2027:trial:9:tax')
    expect(trial.trial.taxYears.find((t) => t.year === 2027)?.liability ?? NaN).toBeGreaterThanOrEqual(0)
    trial.rollback()
    expect(JSON.stringify(workspace.next)).toBe(before)
    expect(JSON.stringify(base)).toBe(before)
  })
})

describe('in-place solver trials and final', () => {
  const defs: LifecycleBucketDef[] = [
    { id: 'cash', name: 'Cash', kind: 'deposit', priority: 1 },
    { id: 'bond', name: 'Bond fund', kind: 'bondFund', priority: 2 },
    { id: 'equity', name: 'Equity fund', kind: 'equityFund', priority: 3 },
  ]
  function cfg(): LifecycleConfig {
    return {
      buckets: defs,
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
    }
  }
  function wealthy() {
    return [
      { id: 'cash', name: 'Cash', classification: 'deposit', value: 18000 },
      { id: 'bond', name: 'Bond fund', classification: 'bondFund', units: 270, price: 100, acquisitionCost: 27000 },
      { id: 'equity', name: 'Equity fund', classification: 'equityFund', units: 450, price: 100, acquisitionCost: 45000 },
    ] as never
  }
  function spec(patch: Record<string, unknown> = {}) {
    return {
      status: 'voluntary', phase: 'pension', calendarYear: 2027,
      cashflowBeforeInsuranceMonthly: 2500, insurerAdditionalRate: 0.025,
      insuredBirthYear: 1960, isParent: false, childBirthYears: [],
      statutoryPensions: [], occupationalPensions: [], rentalAssessmentMonthly: 0,
      drvSubsidy: 'not-received', manual: { reason: 'rollback parity', kvMonthly: 0, pvMonthly: 0 },
      ...patch,
    }
  }
  function input(patch: Record<string, unknown> = {}) {
    return {
      age: 66, year: 2027, contribution: 100, withdrawalNeed: 1000, allowance: 1000, churchRate: 0,
      fundPrices: { bond: 101, equity: 102 }, depositRates: { cash: 0.01 },
      basisRate: 0.025, inflationFactor: 1, insurance: spec(),
      ...patch,
    } as never
  }
  it('simulateLedgerYear never mutates its input state, on success and on trial throw', () => {
    const config = cfg()
    const first = simulateLedgerYear(config, createLedgerState(config, 2026, wealthy()), Object.assign({}, input(), {
      age: 65, year: 2026, fundPrices: { bond: 100, equity: 110 }, insurance: spec({ calendarYear: 2026 }),
    }))
    const before = JSON.stringify(first.state)
    const ok = simulateLedgerYear(config, first.state, input())
    expect(JSON.stringify(first.state)).toBe(before)
    expect(ok.report.year).toBe(2027)
    expect(() => simulateLedgerYear(config, first.state, input({ fundPrices: { bond: 101, equity: 0 } }))).toThrow()
    expect(JSON.stringify(first.state)).toBe(before)
  })
  it('trial on a live (uncloned) base matches the full-clone trial and rolls back exactly', () => {
    const config = cfg()
    const first = simulateLedgerYear(config, createLedgerState(config, 2026, wealthy()), Object.assign({}, input(), {
      age: 65, year: 2026, fundPrices: { bond: 100, equity: 110 }, insurance: spec({ calendarYear: 2026 }),
    }))
    const batch = startTransactionBatch(first.state)
    beginInvestmentYearInBatch(batch.next, batch.seen, 2027, 1000, 0)
    applyAnnualPricesAndInterestInBatch(batch.next, batch.seen, { bond: 101, equity: 102 }, { cash: 0.01 })
    const live = finishTransactionBatch(batch.next, batch)
    const before = JSON.stringify(live)
    const valuesBefore: Record<string, number> = {}
    for (const b of live.buckets as Parameters<typeof bucketValue>[0][]) valuesBefore[b.id] = bucketValue(b)
    const ref = executeLedgerTrialUnified(config, live, valuesBefore, { cash: 15000, bond: 25000, equity: 40000 }, 1000, { bond: 101, equity: 102 }, 'lifecycle:2027:trial:9', 'lifecycle:2027:trial:9:tax')
    expect(JSON.stringify(live)).toBe(before)
    const liveWorkspace = { next: live, baseSeen: new Set(live.eventIds) }
    const trial = executeLedgerTrialInWorkspace(liveWorkspace, config, valuesBefore, { cash: 15000, bond: 25000, equity: 40000 }, 1000, { bond: 101, equity: 102 }, 'lifecycle:2027:trial:9', 'lifecycle:2027:trial:9:tax')
    expect(JSON.stringify(trial.trial)).toBe(JSON.stringify(ref.state))
    expect(trial.trades).toEqual(ref.trades)
    trial.rollback()
    expect(JSON.stringify(live)).toBe(before)
  })
  it('unchecked targets agree with checked targets and keep value checks', () => {
    const config = cfg()
    for (const [age, anchor, factor] of [[30, 0, 1], [65, 89123.45, 1.02], [90, 1000000, 2.5]] as const) {
      expect(resolveYearlyTargetsEuroUnchecked(config, age, anchor, factor)).toEqual(resolveYearlyTargetsEuro(config, age, anchor, factor))
    }
    expect(() => resolveYearlyTargetsEuroUnchecked(config, 65, -1, 1)).toThrow()
    expect(() => resolveYearlyTargetsEuroUnchecked(config, 65, 100, 0)).toThrow()
    expect(() => resolveYearlyTargetsEuro(config, 65, -1, 1)).toThrow()
    const broken = { ...config, buckets: [] } as LifecycleConfig
    expect(() => resolveYearlyTargetsEuro(broken, 65, 100, 1)).toThrow()
  })
})

describe('reconcile base-year-income fast path', () => {
  it('workspace trial with precomputed base matches full-scan trial byte-identically', () => {
    const cfg: LifecycleConfig = {
      buckets: [{ id: 'cash', name: 'Cash', kind: 'deposit', priority: 1 }],
      milestones: [{ name: 'only', startAge: 65, targets: { cash: { role: 'percent', share: 1 } } }],
      transitions: [],
      taxCashId: 'cash',
    }
    const spec = (year: number) => ({
      status: 'voluntary', phase: 'pension', calendarYear: year,
      cashflowBeforeInsuranceMonthly: 100, insurerAdditionalRate: 0.025,
      insuredBirthYear: 1960, isParent: false, childBirthYears: [],
      statutoryPensions: [], occupationalPensions: [], rentalAssessmentMonthly: 0,
      drvSubsidy: 'not-received', manual: { reason: 'parity', kvMonthly: 10, pvMonthly: 5 },
    })
    const first = simulateLedgerYear(cfg, createLedgerState(cfg, 2026, [{ id: 'cash', name: 'Cash', classification: 'deposit', value: 50000 }] as never), {
      age: 65, year: 2026, contribution: 0, withdrawalNeed: 0, allowance: 1000, churchRate: 0,
      fundPrices: {}, depositRates: { cash: 0.02 }, basisRate: 0.025, inflationFactor: 1, insurance: spec(2026),
    } as never)
    const batch = startTransactionBatch(first.state)
    beginInvestmentYearInBatch(batch.next, batch.seen, 2027, 1000, 0)
    applyAnnualPricesAndInterestInBatch(batch.next, batch.seen, {}, { cash: 0.02 })
    const live = finishTransactionBatch(batch.next, batch)
    const valuesBefore: Record<string, number> = {}
    for (const b of live.buckets as Parameters<typeof bucketValue>[0][]) valuesBefore[b.id] = bucketValue(b)
    const targets = { cash: 40000 }
    const workspace = { next: live, baseSeen: new Set(live.eventIds) }
    const liveBefore = JSON.stringify(live)
    const plain = executeLedgerTrialInWorkspace(workspace, cfg, valuesBefore, targets, 1000, {}, 'lifecycle:2027:trial:4', 'lifecycle:2027:trial:4:tax')
    const plainJson = JSON.stringify(plain.trial)
    plain.rollback()
    let base = 0
    for (const r of live.taxIncome as { ledgerYear: number; amount: number }[]) {
      if (r.ledgerYear === 2027) base = finite(r.amount + base)
    }
    expect(base).toBeGreaterThan(0)
    const based = executeLedgerTrialInWorkspace(workspace, cfg, valuesBefore, targets, 1000, {}, 'lifecycle:2027:trial:4', 'lifecycle:2027:trial:4:tax', { base, fromIndex: live.taxIncome.length })
    expect(JSON.stringify(based.trial)).toBe(plainJson)
    expect(based.trades).toEqual(plain.trades)
    expect(based.fundedWithdrawal).toBe(plain.fundedWithdrawal)
    based.rollback()
    expect(JSON.stringify(live)).toBe(liveBefore)
  })
})
