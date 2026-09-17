# Coordinator review queue (intermediate tree, must recheck final)

## Blocking scope divergence

RentenlueckeCalculator.tsx currently renders legacy SummaryCards/ScenarioOutcomePanel/YearlyTable PLUS a second lifecycle result block. Reject this approach. Activate lifecycle as the ONE authoritative results path; remove old calculation from the live hook path and legacy automatic pooled-estimator gate while preserving approved manual insurance UI and existing return-source controls. Update old UI tests to exercise new required setup and same behavioral guarantees, rather than keeping old live results merely to pass tests. Preserve bootstrap chart percentiles/survival features on common ledger; lifecycle bootstrap must provide full report trajectories to plots. Work cannot be called complete as a bolt-on proof of concept.

These are concrete concerns spotted during implementation, not approval. Resolve before final acceptance and add regressions. Do not silently scope-cut to get tests green.

- lifecycleScenario summarizeLedgerResult currently catches terminal liquidation errors and substitutes gross closing wealth as after-liquidation. Must fail closed, never plausible fake net result.
- Same function adds remaining liabilities to terminal outstandingLiability; inspect investmentTax terminal contract to avoid double-counting. No duplicate liability deduction/reporting.
- Bootstrap currently replaces market/F fields only against base years. Contributions, spending, allowances, manual insurance, pension/rental streams and other nominal inputs must be rebuilt/indexed for EACH path's cumulative inflation, not copied deterministic values.
- Bootstrap return path currently applies applySourceCostTreatment around resolveComponentNominalReturn; inspect whether latter already applies costs. Verify same source/cost handling as expected return, exactly once.
- Sampled bank proxy negative nominal returns conflict with deposit engine nonnegative rate validation. Must provide honest supported model/source handling, not silently clamp or return invalid default forecasts. Verify actual existing cash source range.
- Explicit re-prefill initial allocation should not replace every later milestone strategy without user intent. Preserve later targets.
- Verify plots and yearly rows use activated ledger, not old simulation on side: no standalone lifecycle results bolted atop legacy charts. No old pooled estimator gating acquisition basis or automatic bond-fund exclusion.
- Reference horizon and F convention must be consistent: market at year-end vs today's opening factor and terminal deflator. Test 40/50/60-year no-tax identity with nonzero inflation.
- Required capital semantic label must match actual searched start/time. Unsupported explanations stay explicit; no proof flags.

Official basis rate independently fetched: BMF 13 Jan 2026, 3.20%, PDF https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Investmentsteuer/2026-01-13-basiszins-berechnung-vorabpauschale.pdf?__blob=publicationFile&v=4 .

Container pids.max=256; unrelated old preview servers consume many threads. Run coding/review serially; GOMAXPROCS=2 for gh and constrained test workers as needed. Do not kill sibling servers.
