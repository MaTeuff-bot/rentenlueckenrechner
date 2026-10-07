# Composite deposit-interest research: annualization, CPI extension and paired bootstrap

Research-only own calculations, checked 2026-10-05. No application code, model or default changed. Supersedes the initial end-2020 estimate for the extended-history comparison, not its recorded observations.

## Delivery reconciliation — PR #86 shipped

The feature investigated here was implemented by [PR #86](https://github.com/MaTeuff-bot/rentenlueckenrechner/pull/86), merged as `92f620d81664b340dd1969b4927c2077c005daa6`. Its exact-merge [Pages deployment](https://github.com/MaTeuff-bot/rentenlueckenrechner/actions/runs/37424334619) succeeded. This is deployment evidence, not a claim of a newly repeated live-browser verification. The authoritative implemented contracts are in [the Tagesgeld rule snapshot](../../tagesgeld-planzins-rules-2026.md).

This document preserves the original research sample and raw outcomes; it is not an outstanding implementation prerequisite. Later approved product decisions resolved the questions below:

- **Sources:** production uses the same SU0022-through-2002 / SUD101-from-2003 composite. All 57 overlapping annual observations match the research to floating-point precision (maximum absolute difference about 1.39e-17).
- **1975:** production includes a marked January estimate, linearly interpolated November 1974 to February 1975 with January two-thirds along the interval; it averages that estimate with eleven observed monthly quotes. The primary research sample below still excludes 1975.
- **Window:** production bundles 58 deposit observations, 1968–2025. Default joint deposit/JST/current-CPI coverage is 53 years, 1968–2020 including 1975. Research-only CPI extension through 2025 did not extend production equity/CPI history. Shorter selected asset histories still restrict the common intersection.
- **Negative nominal rates:** raw annual rates remain unchanged, including 2021. The explicitly disclosed account-switching strategy applies `max(0, rawNominal)` before separate costs/tax/KV/PV, without changing year pairing, flooring real returns or dropping/redrawing years. No raw negative nominal rate lies in the default 1968–2020 window, so this historical floor does not bind there.
- **Modes:** historical joint bootstrap and an editable real-target mode were added alongside the existing explicitly confirmed constant-nominal 2% proposal/default. The real mode applies `max(0, (1+realTarget)*(1+inflation)-1)`; its real target is not attained where the nominal floor binds. Neither alternative silently replaces existing confirmed scenarios.
- **Different means, not a discrepancy:** the original raw research mean is −0.5483% over 57 years, 1968–2025 excluding 1975. The shipped −0.28% real proposal rounds the raw 53-year default-window mean −0.27631615093%, including estimated 1975. Independently recomputing the implemented 58-year series with the research CPI gives a raw mean −0.56294637592% and zero-floor-strategy mean −0.56283485341%. These are descriptive sample means, not forward calibration; the raw research path quantiles below are not shipped-strategy outcomes.
- **Sampling:** production retains iid joint calendar-year resampling. The 3-/5-year blocks below remain research sensitivity experiments, not implemented product options.

Remaining research questions are calibration/validation of proposal values, possible future source-history extensions and alternative temporal sampling—not delivery of the three shipped modes. No changes to calculations, defaults, source data or dependencies are made by this research closeout.

## 1. Frequency-aware SU0022 annualization

Retain SU0022 through 2002 and SUD101 from 2003. For 1968 select March/June/September/November (one quote per quarter); for 1969–1974 select February/May/August/November and equally average the four annualized quotes. Extra observations in 1971/1973 are retained in the audit but not overweighted. From 1976 use the arithmetic mean of twelve monthly annualized quotes. These are explicit approximations to annual credited interest, not realized account returns. No monthly rates are invented or annual rate quotes compounded twelve times.

1967 is a partial year and excluded. January 1975 is genuinely unobserved under monthly reporting; exclude 1975 in the primary sample. Alternatives include the available eleven-month mean, January approximated from adjacent observed quotes, and a day-weighted carry-forward calculation. Carry-forward assumes each quote applies from the reporting month's 15th until the next observed quote and uses the prior-year quote at January's boundary; this is an analytical assumption, not an official interest history. The fully carry-based early-year alternative yields mean real −0.5644%, versus primary −0.5483%; the conclusion is not sensitive to this choice.

Official documentation establishes quarterly-to-monthly reporting, but the within-year weighting and effective-date conventions remain our approximations. Product/survey break in 2003 and geography change in 1991 remain; six overlap observations do not establish calibration. This is a German savings/deposit proxy, not best available Tagesgeld.

## 2. Extend app-compatible inflation

Downloaded official monthly YoY CPI series `BBDP1.M.DE.N.VPI.C.A00000.VGJ.LV`. Average twelve monthly YoY observations per complete calendar year, matching the app convention; this is not the exact change in annual-average CPI indices.

Latest complete year: **2025**. Preserve the bundled 1950–2020 vintage and add 2021–2025: **76 annual inflation observations**. Live overlapping values have no material revisions versus the bundle (maximum discrepancy about 3.3e−14 in fractional units, numerical rounding). Incomplete 2026 is excluded. Source flags/provenance and coverage are retained in follow-up files. No `src` data has been updated.

## 3. Composite results and model comparison

Primary sample: **57 paired years, 1968–2025 excluding 1975**. Calculate real interest exactly as `(1+nominal)/(1+inflation)-1`, before tax/fees.

- Arithmetic mean nominal: **2.0314%**; real: **−0.5483%**.
- Geometric mean nominal: **2.0197%**; real: **−0.5589%**.
- Annual sample SD: nominal **1.5612 percentage points**, real **1.4572 points**.
- Nominal–inflation correlation: **0.6076**.
- Mean real through 2020 using the same early-year convention: **−0.2548%**. Adding 2021–2025 materially changes the estimate.
- Modern SUD101-only 2003–2025 real mean: **−1.3057%**; this is a different period/product mix, not proof of a structural universal return.

**Correction to the earlier nonnegative-history statement:** SUD101 has a negative annual nominal average in **2021: −0.00667%**. The observed composite therefore does not fully satisfy our application's nonnegative gross deposit-interest scope. This is not a modeling artifact or a reason to silently clip observations. Product eligibility and accounting treatment require a separate decision before implementation.

### Paired experiments

5,000 paths per model, horizon and sampling method. Identical sampled inflation years across (a) observed joint nominal-interest/inflation tuples, (b) a fitted constant arithmetic real mean and (c) a fitted constant geometric real mean. Horizons 10/30 years; iid and experimental non-circular contiguous 3/5-year blocks. Eight analysis windows yield 720,000 path records. Seeds are recorded in JSON. Blocks never cross calendar gaps but can cross 1991/2003 methodological breaks; overlapping-block eligibility changes year weighting near boundaries/gaps. Block results are sensitivity experiments, not an approved production bootstrap.

**Deposit-only gross purchasing-power factors**, starting from 1 with no contributions/withdrawals/tax/fees:

- Joint iid, 10 years: P5 **0.8690**, median **0.9488**, P95 **1.0121**.
- Joint iid, 30 years: P5 **0.7377**, median **0.8488**, P95 **0.9588**.
- Constant arithmetic real, 30 years: **0.8479 on every path**.
- Constant geometric real, 30 years: **0.8452 on every path**.
- Joint 3-year blocks, 30 years: P5 **0.6885**, median **0.8523**, P95 **1.0119**.
- Joint 5-year blocks, 30 years: P5 **0.6841**, median **0.8696**, P95 **1.0299**.

These are descriptive resampling results, not forecast probabilities/confidence intervals or full-app retirement outcomes. Constant-real re-nominalization mechanically removes all deposit purchasing-power uncertainty in this stripped-down experiment. It is not an equivalent substitute for the joint bootstrap even when central outcomes look similar.

In 30-year iid experiments, paths with at least one negative nominal year: observed joint **40.66%**, constant arithmetic real **93.68%**, constant geometric real **96.48%**. A tiny negative observed annual rate is repeatedly sampled; path incidence is not a claim of large losses. No observations/outcomes are clamped, dropped or redrawn.

### Application boundary and recommendation

The app's bundled JST equity still ends in **2020**: full joint composite/CPI/JST coverage is **52 years**, 1968–2020 excluding 1975, not 57. Extending inflation alone cannot extend full historical mixed-portfolio simulations through 2025. ETF choices have shorter intersections. Do not combine different independently sampled years to conceal that limitation.

Prefer a jointly sampled deposit/inflation proxy over constant-real replacement for historical-bootstrap consistency. Approximately **−0.55% real** is now a descriptive full-composite mean, not an approved default or stable-law estimate. Before implementation settle: negative nominal-interest eligibility/accounting; whether to extend equity history or retain common-year restriction; early-year/1975 conventions; iid versus block sampling; and source/proxy disclosure. No product decisions are implied by this research.

## Accepted strategy: avoid negative-rate deposits (implemented by PR #86)

The following direction/copy/acceptance text records the pre-implementation decision. PR #86 implemented it; see the delivery reconciliation above for the final sample, modes and boundaries.

Max selected the explicit zero-floor deposit strategy after reviewing the negative-interest alternatives. For the historical composite, preserve each raw nominal annual observation and its paired inflation/equity calendar year. Apply `strategyGrossRate = max(0, rawNominalDepositRate)` only as a disclosed investor-strategy transformation, before separate costs, taxation and insurance accounting. Do not drop years, redraw paths, alter inflation, floor real returns or apply this rule to equity/bills/other sources. This supersedes the earlier prohibition on an undisclosed floor specifically for this approved, disclosed strategy; it does not change the archived raw research results above.

The strategy assumes the saver can move the balance to a suitable account without negative gross interest, earning at least zero before separately modeled costs. It does not guarantee that such an account is available for every balance or period. Switching effort/costs, eligibility, balance caps and deposit-insurance diversification constraints are not modeled. Existing costs may still make net nominal returns negative; inflation may still make real returns negative. Positive applied interest retains the existing tax/KV/PV accounting. No additional zero-floor selector was requested.

Place the explanation alongside the historical Tagesgeld source/assumptions in Rechenannahmen when implemented, not solely in research documentation. Proposed German product copy:

> **Annahme: negative Einlagenzinsen vermeiden.** Für Tagesgeld verwenden wir einen historischen deutschen Spar-/Einlagenzins-Proxy. Wir nehmen an, dass du bei negativen Zinsen auf ein geeignetes Konto ohne negative Verzinsung ausweichst. Negative historische Jahreszinssätze werden deshalb für diese Strategie mit 0 % angesetzt; das zugehörige Inflations- und Börsenjahr bleibt unverändert. Die Originaldaten bleiben erhalten. Ein solches Konto ist nicht für jeden Betrag und Zeitraum garantiert verfügbar. Wechselaufwand, Wechselkosten, Angebotsbedingungen, Guthabenlimits und die Aufteilung nach Einlagensicherung werden nicht modelliert. Separat angesetzte Kontokosten und Inflation können weiterhin zu Verlusten führen. Die Berechnung ist eine vereinfachte Anlagestrategie, keine unveränderte historische Kontorendite und keine Zinsgarantie.

Implementation acceptance: test negative, zero and positive source observations; unchanged year pairing; preservation of raw values; separate cost deduction; truthful tax/insurance inputs; reference/required-capital/bootstrap consistency; visible disclosure and mixed fund+cash forecast/reload. Recompute transformed-strategy statistics rather than presenting raw-composite results as zero-floor strategy outcomes. The remaining source-window/annualization/bootstrap decisions are separate. This records product direction and disclosure; application implementation and merge remain separate.

## Reproduce, provenance and rights

From repository root: `python3 docs/research/tagesgeld-composite/followup.py` (stdlib; default 5,000 paths). `--refresh-cpi` explicitly downloads a new CPI vintage; otherwise hash-checked cached input is used. Report prose is a snapshot and is not automatically rewritten after reruns. Full generated paths are large and can be regenerated; retain the compact result/provenance files for review.

Primary URLs and methodology/reuse limitations are in `REPORT.md` and `sources.json`; follow-up CPI URL, response metadata and hashes are in `followup-sources.json`. Official bank/CPI snapshots remain unchanged; transformed outputs are labeled own calculations. Existing JST/ETF rights are not expanded. This follow-up emits no raw equity returns, only intersection years.

Coordinator verification: checked every recorded generated-output hash, independently recalculated the mean Fisher real rate from the 57 paired CSV observations, and identified the negative nominal observation. The recovered calculation completed and wrote its final results/provenance; the completion watcher alone was not used as evidence of numerical correctness.
