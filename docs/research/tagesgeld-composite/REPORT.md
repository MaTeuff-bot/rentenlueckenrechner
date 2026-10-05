# German bank savings composite: empirical research, not a model change

**Source: Deutsche Bundesbank; CPI source: Federal Statistical Office, Wiesbaden, via the app’s Bundesbank/Destatis snapshot; equity: JST Macrohistory R.6. Annual aggregations, composite, deflation and bootstrap are own calculations, not an official Bundesbank composite.**

Downloaded 2026-10-05 UTC. Exact timestamps, URLs and SHA-256 hashes: `sources.json`. No production source/default changes, commit or push.

## Conclusions

- The long source is available: official search metadata resolves **SU0022 = `BBIB1.M.DE.B.H.DNB.SPM.K3M.A.N1.11A`**, not the retired `BBK01.SU0022` endpoint. The latter REST endpoint returns 404; the legacy download reports an invalid/unavailable series. Successful current metadata and raw CSV are saved here.
- **The requested 1968 baseline cannot supply complete monthly years before 1976.** The archive has predominantly quarterly observations before 1975, with additional observations in 1971/1973, and January 1975 is missing. Do not pretend that 1968–1975 have 12 observations or fill them silently.
- Applying the requested source selection (1968–2002 SU0022, 2003 onward SUD101), strict 12-month coverage, and the app’s exact same-year CPI yields **45 paired years, 1976–2020**: 27 old-survey years and 18 SUD101 years. Rate-only complete composite coverage is 50 years, 1976–2025. The app’s CPI ends in 2020, not the interest data.
- Over that paired sample the real rate is **less dispersed overall**, but **not constant or generally more stable within regimes**. Arithmetic mean nominal 1.8432%; arithmetic mean real −0.2952%; sample SD 1.2960 vs 0.8527 percentage points. The descriptive reduction does not validate a constant-real forecast. Within 1980s, 1990s, 2000s and 2010s, real SD exceeds nominal SD.
- A negative historical mean real rate converted back to nominal with low inflation can produce negative gross nominal interest. That conflicts with the app’s ordinary-deposit nonnegative nominal product scope. **No silent clamp, dropped year, failed-path suppression or resampling-until-positive is justified.** Choosing a lawful product model and disclosing unsupported paths are separate product decisions.

## Sources, definitions and break

1. [Official SU0022 search metadata](https://statistiken.bundesbank.de/statistiken-en/search?query=SU0022), saved as `official-su0022-search.html`; extracted unique nominal-average result in `resolved-su0022.json`.
2. [SU0022 official CSV](https://api.statistiken.bundesbank.de/rest/data/BBIB1/M.DE.B.H.DNB.SPM.K3M.A.N1.11A?format=csv&lang=en), `su0022-official.csv`: June 1967–June 2003. Three-month notice savings deposits with minimum/basic interest, no bonus or premium; statutory notice until June 1993. It is **not overnight Tagesgeld**. The “minimum rate” describes the product, not a statistical minimum across banks. The quoted series is an unweighted arithmetic mean after removing upper/lower 5% reports. Rates describe most frequently occurring new-business terms during the middle two weeks. Metadata explicitly includes new Länder banks from January 1991.
3. [SUD101 official CSV](https://api.statistiken.bundesbank.de/rest/data/BBIM1/M.DE.B.L21.A.R.A.2250.EUR.N?format=csv&lang=en), `sud101-official.csv`: January 2003–August 2026. Household overnight deposits at German banks, volume-weighted outstanding-business end-of-month effective annual rates, although headed “new business”. It is a broad balance-weighted overnight deposit basket, potentially including low/zero-paying payment accounts, **not the best advertised Tagesgeld offer**. Annual agreed/narrowly defined effective rates exclude related non-interest charges. June 2010 changes stratification/aggregation.
4. [Bundesbank methodological comparison](https://www.bundesbank.de/resource/blob/621888/2f270cd1c18f9da4aa5e1b41a36b3f40/mL/comparison-of-the-bundesbanks-former-survey-of-lending-data.pdf), saved verbatim. Reports were initially quarterly, monthly from 1975. Old/new samples, population, weighting and nominal/effective concepts differ. **Its corresponding three-month-notice category is SUD105, not SUD101**; the published approximately 1½-point overlap gap for SUD105 must not be attributed to this SUD101 splice.
5. Bundled CPI `bundesbank-destatis-germany-cpi-yoy-annual-mean-post1950`, in `src/features/rentenluecke/model/returnData/historicalProductionData.ts`, 71 annual values, 1950–2020, generated-at metadata 2026-08-15. Underlying URL: [BBDP1.M.DE.N.VPI.C.A00000.VGJ.LV](https://api.statistiken.bundesbank.de/rest/data/BBDP1/M.DE.N.VPI.C.A00000.VGJ.LV?format=csv&lang=en). **No live CPI revision replaces the app snapshot.** It is the arithmetic mean of 12 monthly year-on-year changes, not December/December CPI and not exactly the change in annual-average CPI index. Therefore deflation is aligned with the app, not an exact within-year purchasing-power account.

There is a **methodological/product break in 2003**, not a homogeneous bank-return history. The early geography is West Germany; January 1991 changes coverage to unified Germany. CPI’s German historical geography/vintage and banking coverage are not guaranteed identical at every transition. DM-era rates precede the euro; a dimensionless interest rate needs no DM/EUR exchange conversion, but currency/monetary regimes changed. German bank rates and German CPI must also not be described as worldwide real cash returns. Neither source models active offer switching, promotional rates, deposit-insurance constraints, balance caps, depositor-specific credit timing, tax or fees.

## Monthly completeness and exclusions

| Series | Archive rows | Valid rates | Missing values | First/last month | Complete annual years |
|---|---:|---:|---:|---|---|
| SU0022 | 433 | 374 | 59 | 1967-06 / 2003-06 | 1976–2002 (27) |
| SUD101 | 284 | 284 | 0 | 2003-01 / 2026-08 | 2003–2025 (23) |

All within-span month slots are present in the raw archives; SU0022 missing rates are explicit `.` with `No value available`. Its valid counts for 1968–1975 are **4, 4, 4, 5, 4, 5, 4, 11**. Partial 1967/2003 SU0022 and 2026 SUD101 are excluded from full-year annualizations. SUD101 2021–2025 remain visible as nominal-only rows but cannot enter paired real statistics because bundled CPI is unavailable. All exact missing months are in `monthly-coverage.csv`; no forward fill/interpolation is performed.

Flags retained verbatim in raw/normalized monthly CSVs: SU0022 missing-value flags; SUD101 `2010-06: comment` and `2026-08: Provisional value`. The provisional month does not enter the full-year sample. The app CPI metadata flags April 1952 as estimated, outside the paired sample. Original monthly CSV metadata, including last-update fields, are retained; SU0022 update 2026-01-14 10:04:19, SUD101 update 2026-10-01 15:04:44 (provider timestamps, no inferred timezone).

## Calculation convention

For a complete year with 12 quoted annual rates `r_m` (CSV percent divided by 100), `nominal_y = mean(r_m)`. This is an **explicit approximation to annual gross credited return**, not a realized account total return. Do **not** multiply twelve `(1+r_m)` factors: these are annualized rate quotes, not monthly returns. No monthly compounding assumption is added. Equal-month averaging also ignores day weighting and bank-specific accrual conventions.

For the exact same calendar year of the app CPI, `real_y = (1 + nominal_y)/(1 + inflation_y) - 1`, before tax and costs. Not the shortcut `nominal − inflation`. Arithmetic means describe average single-year observations; geometric means are `exp(mean(log(1+return))) − 1`, a hypothetical reinvested annual path under the approximation. Sample SD uses denominator `n−1`; quantiles use linear interpolation at `(n−1)p`. One-observation decade SD/correlation is undefined and left blank. No means mix nominal-only and CPI-paired years.

### Paired-sample results (percent; SD in percentage points)

| Statistic | Nominal | Real |
|---|---:|---:|
| n, years | 45, 1976–2020 | 45, 1976–2020 |
| Arithmetic mean | 1.8432 | −0.2952 |
| Geometric mean | 1.8351 | −0.2987 |
| Sample SD | 1.2960 | 0.8527 |
| Minimum | 0.0008 | −1.7413 |
| 5th percentile | 0.0238 | −1.3584 |
| 25th percentile | 1.0233 | −0.8039 |
| Median | 1.7433 | −0.4124 |
| 75th percentile | 2.8092 | 0.0901 |
| 95th percentile | 4.4415 | 0.7980 |
| Maximum | 4.9167 | 2.6488 |
| Negative share | 0/45, 0% | 33/45, 73.33% |

Nominal/inflation Pearson correlation: **0.80654**. That is contemporaneous descriptive correlation, not causality or a fitted pass-through rule.

**Excluding transition year 2003:** n=44 (gap in otherwise 1976–2020 span); arithmetic nominal 1.8592%, real −0.3048%; geometric nominal 1.8511%, real −0.3084%; SD nominal 1.3064 vs real 0.8601 points; negative real 33/44=75%; correlation 0.80516. Full quantiles are in `statistics.csv`.

**Six-month overlap diagnostic:** January–June 2003 SUD101 minus SU0022 mean **+0.375 percentage points**; individual observations are in `overlap-2003.csv`. Six co-observations cannot establish calibration, stable bias or equivalent instruments. No additive correction, scaling or back-casting is applied.

### Regimes/decades, same paired sample

| Period (actual available years) | n | Mean nominal % | Mean real % | SD nominal points | SD real points |
|---|---:|---:|---:|---:|---:|
| SU0022, 1976–2002 | 27 | 2.6011 | −0.0465 | 1.0470 | 0.9085 |
| SUD101, 2003–2020 | 18 | 0.7063 | −0.6681 | 0.6242 | 0.6116 |
| 1976–1990 | 15 | 3.1923 | 0.1106 | 0.9395 | 1.0622 |
| 1991–2002 | 12 | 1.8620 | −0.2429 | 0.6287 | 0.6628 |
| 2003–2009 | 7 | 1.3674 | −0.2061 | 0.3441 | 0.4900 |
| 2010–2020 | 11 | 0.2856 | −0.9621 | 0.3011 | 0.4972 |
| 1970s (1976–1979 only) | 4 | 3.1150 | −0.5449 | 0.4418 | 0.2813 |
| 1980s | 10 | 3.2616 | 0.3748 | 1.1330 | 1.2083 |
| 1990s | 10 | 2.1692 | −0.1461 | 0.5548 | 0.7063 |
| 2000s | 10 | 1.3033 | −0.2807 | 0.3043 | 0.4465 |
| 2010s | 10 | 0.3141 | −1.0054 | 0.3014 | 0.5018 |
| 2020s (2020 only) | 1 | 0.0008 | −0.5297 | undefined | undefined |

Across **36 consecutive-calendar 10-year windows**, nominal mean ranges **0.24475% (2011–2020) to 3.60242% (1976–1985)**, spread 3.35767 points. Real mean ranges **−1.01491% (2011–2020) to +0.51460% (1982–1991)**, spread 1.52952 points. Narrower real rolling range supports only relative long-sample stability; the sign change, time variation and within-regime SD caution against assuming a universal constant. Windows overlap and are not independent tests. The sample misses post-2020 inflation/rate normalization, so recent-tail inference is particularly weak.

### Optional sparse-year sensitivity — not the accepted baseline

`sparse-available-month-sensitivity.csv` and its separate statistics average **only available** quote months for 1968–1975, retain the complete later sample and align CPI. This is **53 years, 1968–2020**, but not complete-year credited-return data, not interpolation, and not admissible as the primary bootstrap input under the complete-year rule. Arithmetic nominal 2.2434%, real −0.2747%; geometric 2.2319% / −0.2794%; SD 1.5501 / 0.9809 points; negative real share 71.70%; correlation 0.83054. Results are similar directionally, but equal weighting of irregular report dates may bias an annual approximation. Using these early years in production would require a separately approved aggregation method.

## Joint empirical bootstrap and available common years

`joint-bootstrap-input.csv` is the strict composite + bundled German CPI + app default JST developed-equity **real** series intersection: **45 common years, 1976–2020**. Entire calendar-year tuples are resampled jointly, never independently by asset or CPI, preserving empirical same-year co-movement. `research.py` actually runs **2,000 empirical iid bootstrap replicates**, each drawing 45 existing tuples with replacement, Python RNG seed 20261005; output `joint-bootstrap-mean-replicates.csv`. These are resampled actual observations, not simulated market observations or an application retirement forecast.

Illustrative iid 2.5th–97.5th percentile intervals for arithmetic means: nominal **1.4885%–2.2160%**, real **−0.5285%–−0.0464%**. These intervals assume exchangeable iid years; regime breaks/serial dependence can make them overconfident. They neither establish stationarity nor justify a parameter/default change.

For the app’s other equity choices, intersection is much shorter: IUSQ **2012–2020, 9 years**; EUNM **2010–2020, 11 years**. ETF data extending through 2025 does not extend the joint sample while the selected bundled CPI ends in 2020. The saved `bundled-app-inputs.json` includes exact observations and source-file hashes for all these options. JST equity is an equal-weight developed-country **local-real** proxy, not a EUR fund total-return series. Re-nominalizing that equity with German CPI is a modeling mapping, not evidence of a historically tradeable EUR portfolio.

**Optional block bootstrap is a separate experiment, not implemented here:** resample jointly contiguous 3/5/10-year blocks to preserve persistence, report sensitivity by block length, and explicitly decide whether blocks may cross the 1991 geography change and 2003 survey/product splice. Regime-stratified blocks avoid synthetic continuity across a break but change mixture weights and leave short regime samples. No arbitrary block choice proves future regime weights. Keep the tuple intact whichever block method is chosen.

## Constant-real modeling hazard

`nominal_future = (1 + constant_real)*(1 + chosen_inflation) − 1`. Both the arithmetic and geometric real means here are negative. Across **all 71 bundled CPI years**, either mapping generates negative nominal rates in **five years**; arithmetic mapping minimum −6.5932%. This all-CPI illustration is not the strict paired estimation sample. Low inflation/deflation can make the inverse mapping negative even when every observed deposit quote is nonnegative. `results.json` lists the exact affected years/rates. Preserve gross interest, tax and separately deducted costs semantics; negative net return due to costs or negative real return is not negative credited gross bank interest. Do not silently clamp/drop/reject-and-redraw. This investigation does not approve constant real, constant nominal, a rate level, a calibration or any production behavior.

## Licensing and distribution caveats

- [Bundesbank ESCB statistics reuse policy](https://www.bundesbank.de/en/homepage/user-information/terms-of-use-regarding-the-reuse-of-escb-statistics-621188): free reuse with source attribution, statistics and metadata not modified; third-party data are not automatically covered. Raw downloaded CSVs/metadata remain verbatim. All transformed CSVs and this analysis are clearly labeled **own calculations** rather than official statistics. Do not treat the policy as blanket clearance for arbitrary altered-statistic redistribution; check applicable terms before production bundling/publication.
- App `DATA_LICENSES.md` identifies Destatis attribution/third-party rights and the general [Datenlizenz Deutschland – Namensnennung 2.0](https://www.govdata.de/dl-de/by-2-0) signal. Cite **Federal Statistical Office, Wiesbaden / Destatis**, the underlying CPI URI, Bundesbank hosting, and mark transformations. The general license page does not itself prove that every historical source component is independently cleared.
- Bundled JST-derived equity is **CC BY-NC-SA 4.0**, attribution and share-alike required, **not cleared for commercial use**. Its inclusion in the joint research files retains that restriction; permissive bank-rate reuse does not remove it. Source: https://www.macrohistory.net/database/.
- ETF inputs retain Yahoo market-data/third-party terms; app metadata says commercial use not allowed. Their stored snapshot is research provenance, not a new rights grant. No external data licensing files were modified.

## Reproduce and audit

From repository root, run `python docs/research/tagesgeld-composite/research.py` (Python 3.11+, stdlib only). The cached official downloads are checked against recorded hashes. `--refresh` explicitly downloads a new official vintage and updates download provenance. Annual app inputs are parsed from the repository’s bundled source; `sources.json` and `bundled-app-inputs.json` record the exact files/data used. Keep that app revision or the saved input snapshot when comparing vintages. `REPORT.md` is the narrative for this recorded run; rerunning metrics after refresh does **not** automatically rewrite its numeric prose.

Core audit outputs: `annual-observations.csv` (includes exclusions), `monthly-observations.csv`, `monthly-coverage.csv`, `statistics.csv` (baseline, exclusion alternative, decades and subperiods), `overlap-2003.csv`, `rolling-10-year-means.csv`, the separately labeled sparse sensitivity outputs, `joint-bootstrap-input.csv`, `joint-bootstrap-mean-replicates.csv`, and `results.json` (full machine-readable summaries/flags). All files are confined to this research directory.
