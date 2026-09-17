# Lifecycle UI release — implementation contract

Task t_20ee7543; branch feat/lifecycle-ui-release; base 58cae34. Authorized implement/test/PR/review/isolated preview; no merge or production deploy.

## Worker plan and coordinator acceptance

Read-only Meta muse-spark-1.3-contributor/xhigh planning completed (session 01a0afe5-ca95-7111-b27c-ab814c8efa11), grounded in repository model/state/UI and persisted lifecycle research. Hermes accepts the stages below with binding clarifications.

1. Audit local execution mirror in lifecycleLedger/annualCashflow.ts against lifecycleAllocation engine, and PR46 final fixes. Reproduce/fix confirmed financial defects before activation; record tests.
2. Framework-free scenario-to-ledger adapters: actual per-bucket holdings and basis, independently answered equityFund/bondFund/deposit classification, lifecycle config, yearly source-derived returns/costs/inflation and insurance inputs. Reuse annual ledger for deterministic and existing bootstrap paths, no UI financial formulas.
3. Draft state, validation, persistence version/reset and required-answer gates. Narrow reset to known app-owned keys; notice. No migration. Keep explicit zero distinct from missing.
4. Per-bucket tax setup and milestone editor: one transition initially, more on add; nonoverlapping immediate/straight-line transitions; fixed-real reserves in visible priority order plus remainder shares. Initial percentages from actual holdings only; preserve edited targets; explicit re-prefill; zero wealth needs explicit allocation, future zero buckets supported.
5. Results/table/plots from common annual rows: spending adequacy AND after-liquidation real ending wealth, current/prior tax, remaining liability, incremental terminal insurance. Distinguish depletion/nonconvergence. No successful-looking partial bootstrap summary.
6. Full tests/lint/build/diff check, independent final candidate review/fixes, real desktop/mobile browser scenarios, PR + exact-head CI + isolated preview if available. Stop before merge.

## Binding clarifications

- Opening VP/loss history starts zero; never introduce opening history inputs. Fund basis requires explicit answer. Classification may be edited in draft setup but must never be inferred from the return proxy; immutable only within a simulation's ledger.
- LedgerInsuranceSpec currently lacks phase-specific manual capital-assessment override. Preserve this approved fallback with explicit adapter/API support and tests; it is distinct from manual full KV/PV replacement. Do not silently switch manual to automatic.
- Accumulation must not acquire fictitious retirement insurance charges; preserve actual phase boundaries and net/gross stream semantics. Do not add assessment-only income to cash or run the pooled estimator in parallel.
- Latest official basis rate must be verified, advanced-editable. Index monetary allowances with inflation, rates constant, ongoing fund costs once.
- Use validated existing required-capital search only within supported domain and with correct start/state/horizon semantics. Fixed reserve/nonmonotone/zero-start unsupported stays explicit; NEVER enable proof bypass flags. No new solver.
- Terminal result must include applicable incremental insurance as well as liquidation tax and outstanding liabilities without double deduction. No fresh tax year/allowance.
- Preserve existing insurance answers, children semantics, bridge/pension boundaries, manual replacement and assessment estimates. Unsupported holdings cannot receive partial automatic coverage.
- Financial correctness findings are in scope, broad refactors/hardening and excluded features are not.

## Verification matrix

Model: wealth/basis/VP/tax/insurance conservation; arrears recovery; taxable funding sales; zero cash targets; 40/50/60-year inflation; terminal settlement; source/cost alignment; failure versus depletion.
State/UI: prefill/preserve/re-prefill; independent classification/basis; explicit zero/missing; app-key-only reset; invalid transition; future bucket; unsupported required capital; failed bootstrap.
Browser: fresh incomplete and complete, zero wealth/future bucket, bridge and pension, manual assessment/full fallback, malformed/missing answers, 390px and 1440px.

## Status

Planning accepted with clarifications. Dependencies installed using npm ci (2 moderate audit findings reported; unrelated automatic upgrades not authorized). Implementation not yet started.
