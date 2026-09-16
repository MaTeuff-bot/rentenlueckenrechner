# Lifecycle Allocation Engine — Implementation Plan (inactive module)

Status: PLAN ONLY. New source/tests live only under
`src/features/rentenluecke/model/lifecycleAllocation/` plus this plan.
No store wiring, no persistence/schema changes, no UI. Existing behavior untouched.

## 0. Grounding

### 0.1 Reused `investmentTax` public API (only allowed import)

Source of truth: `src/features/rentenluecke/model/investmentTax/index.ts`:

- Types: `InvestmentState`, `OpeningBucket`, `Bucket`, `Transaction`, `TaxYear`.
- State: `createInvestmentState(firstYear, buckets)`.
- Year lifecycle: `beginInvestmentYear(state, year, allowance, churchRate)`,
  `applyAnnualPricesAndInterest(state, prices, rates)`,
  `reconcileTax(state, cashId, id)`, `closeWithPendingVP(state, firstPrices, basisRate)`.
- Transactions: `applyTransaction(state, event)` with `purchase` (euro amount),
  `sale` (units, average-cost release of `basis`/`assessedVP`),
  `transfer` (deposit to deposit), `external` (signed cashflow).
- Terminal: `valueHypotheticalLiquidation(state, cashId, cumulativeInflation, cutoff)`.
- Observers: `bucketValue`, `totalValue`, `calculateTax`, `unpaidTax`.

### 0.2 Hard constraints inherited from `investmentTax`

1. Phases are strict: `closed → opening → closing → closed`; years consecutive.
2. Pending VP must be received via `beginInvestmentYear` before any trade on that fund.
3. Price/rate maps must cover exactly all fund/deposit ids every year, including zero-balance buckets.
4. Purchases require settlement cash; tax pays `min(cash, due)`, rest stays `unpaidTax`. No borrowing.
5. Event ids with reserved prefixes (`begin|receipt|market|close|vp|interest|annual-tax|terminal:`)
   are forbidden. Engine ids use `lifecycle:<year>:…`.
6. No zero-price purchase; oversale throws; dust purchase underflow throws.
7. Deposit interest is credited exactly once per year; `transfer`/`external` create no income.
8. Sales are average-cost with 30% exempt fraction for equity funds, 0 for bond funds.
9. Per-year `allowance` is an input (remainder after outside income); the engine never computes it.

### 0.3 Conventions borrowed (read-only) from existing model code

- Returns apply to opening balances; contributions arrive after (`simulateAccumulation.ts`).
- Cumulative inflation factor `F(0)=1`, `F(i)=F(i−1)·(1+infl[i−1])`; nominal↔real via `F`.
- Return paths are required for every bucket every year, including zero-balance future holdings.

## 1. Module shape

| File | Contents |
|---|---|
| `types.ts` | Config, milestone, transition, year input/report types. |
| `targets.ts` | Validation, transition progress, euro-target solver. |
| `prefill.ts` | Holdings → percent-target derivation. |
| `rebalance.ts` | Pure euro plan builder (ledger-free). |
| `engine.ts` | `createLifecycleState`, `simulateLifecycleYear`, `simulateLifecycle`. |
| `terminal.ts` | `liquidateLifecycle` wrapper. |
| `index.ts` | Public re-exports only. |
| `lifecycleAllocation.test.ts`, `lifecycleSensitivity.test.ts` | Only new tests. |

Dependency rule (enforced by an import-lint test): no file in this module imports from
`../simulateAccumulation`, `../portfolioBuckets`, `../capitalIncome`, `../../hooks`,
`../../components`, or any UI/store path. The single exception is the `../investmentTax`
barrel (never deep relative imports into `investmentTax/*` internals).

### 1.1 Public API (exact exported surface)

```ts
export type LifecycleBucketKind = 'equityFund' | 'bondFund' | 'deposit';
export interface LifecycleBucketDef { id: string; name: string; kind: LifecycleBucketKind; priority: number }
export type BucketTarget =
  | { role: 'fixedReserve'; amountToday: number }
  | { role: 'percent'; share: number };
export interface Milestone { name: string; startAge: number; targets: Record<string, BucketTarget> }
export interface AllocationTransition { fromMilestone: string; toMilestone: string; startAge: number; durationYears: number }
export interface LifecycleConfig { buckets: LifecycleBucketDef[]; milestones: Milestone[]; transitions: AllocationTransition[]; taxCashId: string }
export interface LifecycleYearInput {
  age: number; year: number; contribution: number; withdrawalNeed: number;
  allowance: number; churchRate: 0 | 0.08 | 0.09;
  fundPrices: Record<string, number>; depositRates: Record<string, number>;
  basisRate: number; inflationFactor: number;
}
export interface LifecycleYearReport {
  age: number; year: number; openingValue: number; closingValue: number;
  contribution: number; withdrawal: number; taxPaid: number; unpaidTax: number;
  anchorNominal: number; iterations: number;
  trades: Array<{ bucketId: string; kind: 'buy' | 'sell'; euros: number; units: number }>;
  targetsNominal: Record<string, number>; valuesNominal: Record<string, number>;
  shortfall: number; unfundedWithdrawal: number;
}
export interface LifecycleResult { state: import('../investmentTax').InvestmentState; reports: LifecycleYearReport[] }
export function validateLifecycleConfig(config: LifecycleConfig): string | null;
export function resolveYearlyTargetsEuro(config: LifecycleConfig, age: number, remainderAnchorNominal: number, inflationFactor: number): { targetsNominal: Record<string, number>; shortfall: number };
export function prefillTargetsFromHoldings(valuesNominal: Record<string, number>, kinds: Record<string, LifecycleBucketKind>): Record<string, BucketTarget>;
export function createLifecycleState(config: LifecycleConfig, firstYear: number, opening: import('../investmentTax').OpeningBucket[]): import('../investmentTax').InvestmentState;
export function simulateLifecycleYear(config: LifecycleConfig, state: import('../investmentTax').InvestmentState, input: LifecycleYearInput): { state: import('../investmentTax').InvestmentState; report: LifecycleYearReport };
export function simulateLifecycle(config: LifecycleConfig, initialState: import('../investmentTax').InvestmentState, years: LifecycleYearInput[]): LifecycleResult;
export function liquidateLifecycle(state: import('../investmentTax').InvestmentState, taxCashId: string, cumulativeInflation: number): { nominal: number; real: number; outstandingLiability: number; state: import('../investmentTax').InvestmentState };
```

There are no timing-convention or tie-break options anywhere in this surface. Ordering
tie-breaks are fixed and deterministic (surplus descending, priority ascending). Timing
alternatives exist only as test-only harness forks, never as engine options.

`OpeningBucket` is reused verbatim from `investmentTax`. Bucket `id` joins config to ledger
and is preserved across role changes so tax history survives.

### 1.2 Annual loop (normative order)

```
simulateLifecycleYear(config, state, input):
  1. validate input (nonneg cashflows, full price/rate maps incl. zero-balance buckets,
     inflationFactor > 0); throw pre-mutation so a bad map leaves state unchanged
  2. snapshot openingValue + firstPrices (current fund prices, for closeWithPendingVP)
  3. state = beginInvestmentYear(state, year, allowance, churchRate)
  4. year 0 only: initial rebalance in OPENING at opening prices (§4.5); later years: no opening trades
  5. state = applyAnnualPricesAndInterest(state, fundPrices, depositRates)   // once per year
  6. if contribution > 0: external(+C) into the settlement deposit
  7. W1/V1 = wealth/values after market + contribution; S = min(need, W1)
  8. joint after-tax solve (§4.3): iterate anchor → targets → trial-clone execution →
     measured tax → new anchor (bounded, deterministic; trials discarded, never double-booked)
  9. execute the final unified plan on the real state (sells → external(−S) → buys),
     then reconcileTax, then closeWithPendingVP
 10. retarget once against the measured anchor (W1 − S − taxPaid) and report those
     accepted targets; build the report from state snapshots only
```

Euro→units uses the price in force at execution (opening prices for step 4,
closing `fundPrices` afterwards). Fund↔fund moves are sale→cash→purchase pairs; deposit
moves use `transfer` via the settlement deposit. `DUST_EUR = 0.01`: plan legs below one cent
are skipped; a fully within-dust year emits zero transactions.

## 2. Within-year timing convention (tested default)

**T-default**: (i) returns apply to opening balances; (ii) contribution arrives at year end;
(iii) withdrawal is drawn at year end; (iv) rebalance trades execute at closing prices after
returns, contribution and withdrawal funding; (v) tax is reconciled after all trades;
(vi) VP is assessed at close (taxed next year at receipt).

Per-year identity: `W_close = W0 + M + C − S − T_paid` (±1e-9), where `T_paid` is the cash
actually debited by `reconcileTax`. Rebalance legs are internal and must not otherwise move wealth.

### 2.1 Why this default

Matches the shipped accumulation timing (return on opening capital, contribution after) and maps
1:1 onto the ledger lifecycle (`begin → opening → prices+interest → closing → reconcile → close`),
so no new ledger phase is introduced and VP cadence is inherited unchanged.

### 2.2 Bias disclosure and limits (no blanket claims)

T-default understates growth on savings and the cost of spending by up to one year's return on
that year's cashflows. For fixed targets this endpoint difference is additive in cashflows
(`≈ Σ CF·r` order), but allocation feedback can amplify it: different interim wealth resolves
different euro targets, which changes market exposure, which changes later wealth. Whether that
feedback compounds systematically over 40/50/60 years is an empirical question the suite answers
(§9: constant-market no-op must be exactly zero; alternating-market A/B comparisons at 40/50/60
years assert explicit ratio bounds and document where they hold and where they break). This plan
makes no claim that adjacent-year shifts cannot compound; it fixes one convention, forbids
user-facing timing options, and pins the measured differences in tests.

## 3. Transition semantics

### 3.1 Endpoint convention (normative, tested)

A transition is `(fromMilestone, toMilestone, startAge t0, durationYears d)` with integer ages,
`d ≥ 0`. For simulation age `a`:

```
p(a) = d == 0 ? (a < t0 ? 0 : 1) : clamp((a − t0 + 1) / (d + 1), 0, 1)
```

The year starting at `t0` is the first year pursuing an interpolated target; the year starting
at `t0 − 1` still pursues pure `from`; the year starting at `t0 + d` pursues pure `to`.
Example (`t0=60, d=5`, reserve 10 000→30 000): 59→10 000; 60→13 333; 61→16 667; 62→20 000;
63→23 333; 64→26 667; 65→30 000. `d=1` gives one midpoint year then pure `to`;
`d=0` switches in the year starting at `t0`. Fixed amounts interpolate in today's purchasing
power (× `inflationFactor` at application); shares interpolate directly.

### 3.2 Overlap validation (normative)

Transitions sorted by `startAge` must satisfy `t[k+1].startAge ≥ t[k].startAge + t[k].durationYears`,
be chained (`to_k == from_{k+1}`), reference existing milestones with unique names, and every
milestone except the first must be a transition endpoint (unreferenced milestones rejected).
Milestone `targets` cover every bucket id exactly once; shares satisfy `0 ≤ share ≤ 1` and
`Σ ≤ 1 + 1e-12`; `taxCashId` is a deposit bucket; priorities are unique positive integers.
`validateLifecycleConfig` returns an error string (pure, no throw).

### 3.3 Role-change blending (normative)

Same-role parameters interpolate (§3.1). A bucket changing role (`percent ↔ fixedReserve`)
never interpolates parameters; it contributes a fixed part plus a percent coefficient
against the same wealth anchor `W` (endpoint balances are blended; see construction below):

```
percent→fixed (old share s_old, new amount A_new): fixed part p·A_new·F, coefficient (1−p)·s_old
fixed→percent (old amount A_old, new share s_new): fixed part (1−p)·A_old·F, coefficient p·s_new
```

Mixed transitions (some buckets same-role, some role-changing) conserve the anchor and keep
sequential reserve priority via a fixed-part / percent-part construction. For progress `p`:

- Same-role fixed: fixed claim `F = lerp(fromAmt, toAmt, p) × inflationFactor`.
- Same-role percent: coefficient `s = lerp(fromShare, toShare, p)`.
- `percent→fixed` changer with old share `s_old`, new amount `A_new`:
  fixed part `p·A_new·F`, coefficient `(1−p)·s_old`.
- `fixed→percent` changer with old amount `A_old`, new share `s_new`:
  fixed part `(1−p)·A_old·F`, coefficient `p·s_new`.

All fixed parts are filled in priority order (`min(claim, remaining)` each); remainder
`R = W − filled` goes to coefficients (`target = coeff × R`). The coefficient sum equals
`(1−p)·fromSum + p·toSum ≤ 1`, so targets sum ≤ `W` by construction; leftover
(`R·(1−Σ)`) stays as measured settlement overweight, never as a target. At `p=0`/`p=1`
this reproduces the endpoint milestone solves exactly. Bucket `id`, cohorts, `basis`,
`assessedVP` and pending VP are untouched by target resolution; only euro targets blend.
A zero target sells down via normal taxed sales; the emptied ledger entry and its history
are retained for later reuse.

## 4. Contribution / withdrawal / rebalance ordering

Euro math is pure and ledger-free; `engine.ts` executes the resulting plan. All amounts nominal.

### 4.1 Annual full rebalancing (normative order)

```
delta[b] = T[b] − V[b]
SELL legs (delta < −dust): largest euro surplus first, ties → smaller priority number first.
BUY legs (delta > +dust): priority order first, ties → largest shortfall first.
Residual cash stays as measured overweight; unfunded shortfalls are reported, never negative.
```

### 4.2 Savings routing (contributions follow the target)

Contributions arrive as `external(+C)` into the settlement deposit before the solve, so the
anchor already includes them and the unified plan routes them: reserve shortfalls in priority
order first, then underweight percent buckets; leftover stays as cash. Contributions never cause
a sale: a pure-contribution year with all buckets underweight emits zero sales (tested).

### 4.3 Joint spending/tax/target solve (normative)

Accepted targets are computed against remaining wealth AFTER spending AND taxes, including
taxes from funding and rebalance sales. The `T(W1−S)`-then-pay approximation is not used.
Instead the engine runs a deterministic bounded trial-clone solve against the post-market,
post-contribution snapshot `S1` (wealth `W1`, values `V1`):

```
S      = min(withdrawalNeed, W1);  unfunded = need − S
anchor = W1 − S
repeat at most 8 times:
  T    = solveTargets(age, max(0, anchor), F)     // §3 against the current anchor
  plan = buildPlan(V1, T)                          // §4.1; side from delta sign
  trial = structuredClone(S1)
  trial = executeUnified(trial, plan, S, closingPrices, 'trial:<k>')
  trial = reconcileTax(trial, settlement, 'lifecycle:<year>:trial:<k>:tax')
  paid  = trial.taxYears[year].paid
  next  = W1 − S − paid
  if |next − anchor| < 0.005: break with (T, plan, paid)
  anchor = next
executeUnified(real S1, plan*, S, closingPrices, 'lifecycle:<year>')
real = reconcileTax(real S1, settlement, 'lifecycle:<year>:tax'); paid = delta
anchorFinal = W1 − S − paid
T_accepted = solveTargets(age, max(0, anchorFinal), F)   // retarget after funding; reported
```

`executeUnified` runs surplus sells/transfers-in, then `external(−S)`, then shortfall
buys/transfers-out, capped at available cash. Trial states are discarded; only the final plan
touches the real state, so trial sales are never double-booked. Each fund bucket is sold XOR
bought XOR untouched in a year (same for deposit transfer direction): no sale-and-rebuy churn
by construction, asserted in tests including the withdrawal case. No tax-minimising sale choice
is made: above-target sales precede below-target sales even at a taxable gain (tested).
Partial tax payment leaves `unpaidTax` liability, deducted at terminal liquidation and surfaced
in the report alongside `unfundedWithdrawal` and `shortfall`. Insolvency never borrows and never
invents negative balances.

### 4.4 Cash mechanics (settlement hub, no phantom targets)

`taxCashId` names the single settlement deposit: all `external` flows, sale proceeds, purchase
funding and `reconcileTax` debits flow through it. It carries no implicit target, reserve, or
holdings: if a milestone assigns it a `fixedReserve`/`percent` target that target is honoured
like any other bucket; otherwise leftover and unallocated remainder (`1 − Σ` shares) simply sit
there as measured overweight reported via `valuesNominal` vs `targetsNominal`. No forced reserve
is created and no separate reservoir bucket exists. Non-settlement deposits are ordinary buckets
with their own rates and targets.

### 4.5 Initial allocation (simulation start)

`createLifecycleState` builds the ledger from caller-supplied actual holdings via
`createInvestmentState` (funds: real `units/price/acquisitionCost`; deposits: `value`;
zero-balance future funds as empty cohorts with reference `price > 0`, else validation throws).
Year 0 then rebalances in `opening` before that year's market move via ordinary transactions —
the opening sales share year 0's `TaxYear` and allowance and are reconciled the same year, so no
extra allowance is consumed and no extra year is created. Investment history is never erased:
cohorts, `basis`, `assessedVP` and pending VP survive; only transactions move balances.
`prefillTargetsFromHoldings` derives `percent` shares `value/total` per bucket (deposits included);
exact prefill is a no-op (empty year-0 plan, tested). Zero total wealth makes prefill throw;
callers then supply explicit targets. Holdings inputs and strategy targets stay separate objects.

### 4.6 Insufficiency handling (never invent wealth)

Reserves fill sequentially (`min(target, remaining)` each); percent buckets split a possibly
zero remainder; withdrawals are capped at wealth (`unfundedWithdrawal` reported); tax pays
`min(cash, due)` (`unpaidTax` reported).

## 5. Integration contract with `investmentTax` (call order)

Per year, `engine.ts` calls only barrel exports, in this order: `beginInvestmentYear`;
`applyTransaction` × N in opening (year 0 only, at opening prices); `applyAnnualPricesAndInterest`
(exactly once, full maps); `applyTransaction(external +C)`; trial-clone executions (clones only);
`applyTransaction` × N for the final unified plan at closing prices; `reconcileTax`
(`lifecycle:<year>:tax`); `closeWithPendingVP` (snapshot prices, `basisRate`). The all-in-one
`simulateInvestmentYear` helper is not used. `calculateTax`/`unpaidTax`/`bucketValue`/`totalValue`
serve reports and assertions only. Return sources stay caller-supplied per bucket every year;
deposit interest fires once inside the ledger call; deposit principal moves never create income;
bond funds use the ledger's ordinary-fund mechanics with no additional engine-level guarantees.

## 6. Terminal liquidation convention

`liquidateLifecycle` wraps `valueHypotheticalLiquidation(state, taxCashId, cumulativeInflation,
'beforeHoldingCutoff')`: same-horizon settlement with no extra year and no new allowance — the
final holding year's assessed VP stays embedded in cost basis and reduces the terminal sale gain
(deducted exactly once via `proceeds − basis − assessedVP`); prior received VP was taxed in its
receipt year. Terminal losses survive as `loss` balances with no refund credit
(`nominal = totalValue − unpaidTax`). `real = nominal / cumulativeInflation` (`> 0` required).

## 7. Data model (pure types; no persistence)

`LifecycleBucketDef` ids join 1:1 to ledger buckets; `kind` must match the opening
classification. `BucketTarget` is a union of `fixedReserve { amountToday ≥ 0 }` (real euros; no
nominal variant in v1) and `percent { 0 ≤ share ≤ 1 }` — one role per bucket per milestone.
`Milestone.targets` covers every bucket exactly once. Reports carry nominal euros; the ledger
stays nominal-only. The module owns no stored state and no schema version.

## 8. Test plan (binding)

Helpers build deterministic multi-year runs through the public API only and assert on reports,
`totalValue`/`bucketValue`, `taxYears`, `unpaidTax`, cohorts and transactions.

1. Milestones/roles: pure-percent split (50/30/20 of anchor); fixed+percent mix (reserve + 70/30
   of remainder); validation rejects dual-role shapes and percent sums > 1.
2. Reserve priority + shortfall: wealth below Σ reserves fills priority 1, partially 2, zero 3;
   `shortfall` reported; no negatives; percent targets zero.
3. Transitions: endpoint table (`t0=60,d=5` full table; `d=1` midpoint; `d=0` switch); overlap,
   chain and unreferenced-milestone validation errors.
4. Role-change blending: percent→fixed across a window matches old/blend/new against the same
   anchor; mixed same-role + role-change transitions conserve (`ΣT + leftover == anchor`) and keep
   priority order; target resolution alone never changes cohorts/`basis`/`assessedVP`; zero target
   sells down fully and retains history for later re-buy.
5. Annual full rebalance: post-downturn fixture restores the reserve via sales; contribution +
   withdrawal netting reduces trade count; no-op year emits zero transactions.
6. Initial allocation: exact prefill → empty year-0 plan (zero opening transactions, same-year
   `TaxYear` only); non-prefilled targets → opening trades taxed in year 0 with history preserved;
   zero wealth + explicit targets funded by year-0 contribution works; prefill on zero throws.
7. Savings routing: reserve shortfalls fill in priority order before percent buckets; all-met
   contribution stays in cash; pure-contribution underweight year emits zero sales.
8. Withdrawal ordering + after-tax targets: overweight cash drawn before overweight equity sale;
   no sale of underweight bond; `ΣT_accepted + leftover == W1 − S − taxPaid`; no bucket both sold
   and bought in one year; trial executions never appear in real `eventIds`/`transactions`;
   `unfundedWithdrawal`/`unpaidTax` surfaced on insufficiency.
9. Bank deposits: exactly one `interest` record per deposit per year with gross == rate × opening
   value; principal transfers and `external(−)` create no income; deposit moves never change fund `basis`.
10. Future holdings: zero-balance fund gains share at milestone 2; purchases create cohorts with
    `acquiredYear` = purchase year and `assessedVP = 0`; missing price/rate keys throw pre-mutation
    with state unchanged; sell-to-zero keeps the bucket (`bucketValue == 0`, later maps accepted).
11. End wealth: multi-year fixture settles residual tax; `real == nominal / cumulativeInflation`;
    lifetime VP assessed exactly once (received gross + terminal embedded release); loss fixture ends
    with `loss > 0`, `outstandingLiability == 0`, `nominal == cash`; `taxYears` length unchanged by
    liquidation (no new allowance).
12. Timing: single-year identity `W_close == W0 + M + C − S − T_paid` to 1e-9; closing purchases get
    month 12 and opening purchases month 1 (VP pro-rata asserted).
13. Conservation suite (every multi-year fixture): per-year wealth conservation; per-bucket `basis`
    rollforward (purchases add, sales release pro-rata, resolution adds nothing); tax rollforwards
    (`allowanceUsed`, `loss`, `paid`; `pending` holds only current-year assessments); interest counted once; sale gain ==
    proceeds − basis − VP; all values `≥ −1e-9`.
14. Inactivity/isolation: import-lint test over `lifecycleAllocation/*.ts` (only the
    `../investmentTax` barrel allowed); full suite green with no files touched outside the new
    module and this plan.

## 9. Long-horizon sensitivity tests (40/50/60 years)

In `lifecycleSensitivity.test.ts`, deterministic hand-crafted price paths (no RNG):

- S1 constant-market no-op: flat prices/rates, no cashflows, prefilled targets, 60 years. Zero
  transactions every year, value drift ≤ 1e-6 relative, `basis`/`assessedVP`/`loss` constant,
  terminal `real == initial real`. Any trade or drift is a systematic bug.
- S2 alternating-market A/B endpoint comparison at 40/50/60 years: adopted T-default (engine)
  vs a test-only harness fork moving contributions to opening. With zero cashflows both agree to
  1e-9; with constant annual C/S the suite asserts `|W_A − W_B| / Σ|CF| ≤ maxAnnualRate × 1.05`
  as ratios (not snapshots) and documents the bound's scope: it covers timing only while targets
  stay equal; allocation feedback from different interim wealth is measured separately and may
  exceed it — that outcome is reported, never hidden.
- S3 reserve-scale spot check: absolute-reserve scenario at wealth scales 1×/2× with proportional
  cashflows; reserve fill order identical; shortfall scales sub-linearly (absolute reserves are
  not scale-invariant by design).
- S4 VP/allowance lifetime reconciliation (40 years, rising market, small allowance):
  `Σ assessed == Σ received gross + terminal embedded`; `Σ allowanceUsed ≤ 40 × allowance`;
  `unpaid + Σ paid == Σ liability` from `taxYears`; no pending left.
- Drift is `(W_actual − W_reference)/W_reference`; systematic means monotonic same-sign growth
  across 40→50→60 exceeding 1e-6 relative at 60y. Systematic drift fails the suite.

## 10. Risks and resolutions

| # | Risk | Resolution |
|---|---|---|
| R1 | Within-year timing | Fixed T-default (§2), no options; bias disclosed with limits (§2.2); S2 quantifies. |
| R2 | Transition endpoints | Fixed `p(a)` rule with pinned table; `d=0` switches at `t0`. |
| R3 | Role changes | Balance blending with same anchor; mixed construction conserves with priority (§3.3). |
| R4 | Joint spending/tax/target solve | Bounded trial-clone convergence + retarget after funding (§4.3); partial-pay + terminal settlement; churn-free unified plan; no double-booking. |
| R5 | Absolute reserves vs scale assumptions | Engine never touches required-capital search; S3 documents non-invariance. |
| R6 | Zero-start division | Prefill throws on zero; percent-of-remainder handles zero remainder without division. |
| R7 | Missing future-bucket paths | Full-map validation pre-mutation every year. |
| R8 | Dust vs underflow | 1-cent skip rule; conversions clamp; S1 proves no leak. |
| R9 | Shared allowance | Remainder-allowance input per year; nothing computed. |
| R10 | Bond-fund treatment | Ledger mechanics reused unchanged; no engine-level bond promises. |
| R11 | Insurance coupling | Out of scope: engine funds its own tax via settlement cash only. |
| R12 | Deferred scope | Nominal reserves, tolerance bands, FIFO, costs, monthly timing, comparison UI all rejected in v1; unknown target shapes fail validation. |
| R13 | Inactivity leakage | Import-lint test + review checklist; no app imports, storage, or schema changes. |

## 11. Review checklist for the implementing PR

- New code only under `model/lifecycleAllocation/` + its tests; otherwise only this plan.
- Only app import: the `../investmentTax` barrel.
- `npx vitest run src/features/rentenluecke/model/investmentTax` green (untouched) + new tests green.
- Full `npx vitest run`, `npm run lint`, `npm run build` green.
- Zero `console.log`/TODO; actionable error strings (bucket/year/age).
- English identifiers; ledger rows are the source of truth; model stays framework-free.
