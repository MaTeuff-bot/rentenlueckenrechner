# Financial hardening — implementation status (fix/lifecycle-financial-hardening)

Branch: `fix/lifecycle-financial-hardening` from `7ff27dd`.
Scope: one bounded PR, stop before merge/deploy/push. No data reset, no broad refactor.

## Defect A — signed cash proxy (done)

- `depositRates` is a signed nominal proxy in `[-1, +infty)`, finite; `<-1`/non-finite rejected explicitly, no clamping.
- `applyAnnualPricesAndInterest` (`investmentTax/annualLedger.ts`) applies the full signed movement once:
  `value_after = value_before * (1+nominal)`.
- Only the positive portion `value_before * max(0,nominal)` is recorded once as taxable/contribution `interest`.
  Negative residual is movement-only via `deposit-movement` transaction, no `taxIncome`/`contributionIncome`,
  no loss pot, no second add. Zero preserves historical interest event.
- Ordinary fund sale losses remain assessable; no global positivity is imposed.
- Validators made consistent: `investmentTax/validation.ts:completeDepositRates`,
  `lifecycleAllocation/engine.ts`, `lifecycleLedger/annualCashflow.ts`, `lifecycleScenario.ts`
  (`deriveMarketYears`, `deriveDeterministicMarketYears` allow `-1`, reject `<-1`, no negative-deposit throw).
- Bootstrap keeps all valid paths: negative-cash paths complete with `taxIncome/contributionIncome >= 0`;
  truly malformed (`NaN`, missing keys, `F<=0`, `rate<-1`, `price<0`, age/calendar mismatch) throws
  and is counted as `failed` with `summaryBlocked=true`, never hidden as `depleted`.
- UI disclosure: selected proxies are not contractual savings forecasts; negative proxy decline is not
  evidence of a deductible fee/default; actual demonstrated GKV expenses may differ.

## Defect B — bank-only search (done)

Narrow supported domain only (`isBankOnlySearchSupported`):

- Exactly one bucket, `kind=deposit`, `taxCashId` same id.
- Concrete validated `actualOpening` single deposit value finite `> 0` drives internal proportional scaling
  (`proportionalBankOpening`); arbitrary caller callback removed; `low=0` is only a search artefact.
- Explicit 100% percent targets throughout (`share=1` within `1e-12`), no fixed reserves.
- Every `F` finite `> 0`, nondecreasing; `terminalInflation` finite `> 0`.
- Capital-independent insurance only: manual total replacement, KVdR, or voluntary/unknown with explicit
  `manualCapitalAssessmentMonthlyToday` finite `>= 0`. Automatic voluntary capital-dependent search is
  explicit `unsupported`. No monotonicity is inferred from burden nondecreasing alone.
- Mixed funds/multiple deposits/automatic voluntary/fixed reserve/actual zero/nonmonotone all explicit
  `unsupported`. No `allowZeroStart`/`allowFixedReserve`/`allowNonmonotoneF` bypass flags remain.
- Supported recurrence: `G(W)=W*(1+r)+c-withdrawal-k*max(0,W*max(r,0)-allowance)-fixedInsurance`,
  `k=(1+0.055+church)/(4+church)<1`, initial loss `0`, no fund sales/VP, fixed insurance.
  `r>=0` slope `>=1+r*(1-k)>0`; `-1<=r<0` slope `1+r>=0`. Prefix solvency inequalities monotone by induction.
- Scoped checked evaluation (`assessTrialForSearch`): `solverExhausted`/`LedgerInsuranceError`
  (including terminal) map to explicit `nonconverged`, never false `depleted`; other input errors rethrow.
  No broad tri-state refactor of `ledgerSurvives` (kept boolean for general use).
- Independent scalar oracle in tests uses own arithmetic/tax formula only (no production
  survival/leaf financial helpers), own bounding/binary loop, own terminal check; agrees within `€1`.
- UI (`LifecycleResults.tsx`) calls `searchLifecycleCapital(run)` with no callback and explains the exact
  narrow domain transparently when `unsupported`.

## Review fix — full validation plus handwritten deep copy (REVIEW-INTERIM §1+§2)

- `investmentTax/validation.ts`: `checked()` delegates to `checkedFull()` (full recursive numeric sweep on every call, no WeakMap/watermarks, no suffix-only path). `cloneInvestmentState()` is handwritten deep copy element-wise (`buckets/cohorts`, `taxYears`, `pending/amounts`, `taxIncome`, `contributionIncome`, `transactions`, `eventIds`); no shared mutable audit records, no `structuredClone` in production. `transition()` still validates input then clones.
- `structuralSharing.test.ts`: preserved numeric-rejection/isolation/audit paths and counts; sharing assertions changed to deep-copy (`not.toBe` per element); added exact reviewer regressions for in-place prefix mutation, same-length replacement, truncate-plus-refill, plus nested-copy isolation/parity against `structuredClone`.
- Disclosure scope (§2): `LifecycleChart.tsx` and `LifecycleResults.tsx` bank-only proxy warnings now qualified cash/deposit-only with explicit fund-loss carve-out (§20 Abs.6) and own-receipt note; `LifecycleYearlyTable.tsx` and `LifecycleResults.tsx` second proxy note unchanged (already scoped). No logic change.
- No profiling tmp files committed (`src/profile*.tmp.test.ts` absent). No paths/counts dropped, no timeouts altered.

## Tests

New red receipts (saved in this folder):

- `depositProxyHardening.test.ts`: 5 tests — initial red 5 failed (`Negative amount` on signed rates),
  green 5 passed after fix.
- `structuralSharing.test.ts`: 8 tests — 4 preserved (deep-copy isolation, append-only steps, checked parity, ledger-year parity) plus 4 reviewer regressions (prefix mutation, same-length replacement, truncate-refill, nested-copy parity).
- `bankOnlySearchHardening.test.ts`: 6 tests — initial red 4 failed (`isBankOnlySearchSupported is not a function`,
  `openingForCapital is not a function`), green 6 passed after fix.

Updated old tests that enshrined bugs:

- `lifecycleLedger.adapters.test.ts`: bank-only converges without flags; fixed-reserve/nonmonotone/mixed
  always `unsupported` (bypass removed); bank-only crushing throws bounding error, mixed crushing `unsupported`.
- `lifecycleScenario.test.ts`: signed `[-1,infty)` accepted, `<-1`/non-finite rejected; mixed search
  `unsupported` via `bank-only` reason with new no-callback API.

Invariants preserved: basis/VP/arrears/terminal-insurance/cost-once/path-inflation; existing
conservation/mirror/manual-capital/sensitivity suites pass.

## Gates

- `GOMAXPROCS=2 npx vitest run --maxWorkers=1` (full), `npm run lint`, `npx tsc -b --force`, `npm run build`,
  `git diff --check`. See `gates.log` for exact counts.
- No assertions/timeouts weakened. No push/merge/deploy.

## Remaining limitations

- Automatic voluntary capital-dependent search remains explicit `unsupported` in this PR.
- Fixed reserves, true zero actual opening, nonmonotone `F`, mixed funds/multiple deposits stay `unsupported`.
- Actual documented custody fees/defaults need distinct evidence and are outside the automatic proxy rule.
- Browser evidence is coordinator-owned; only small UI hooks/labels added here.
