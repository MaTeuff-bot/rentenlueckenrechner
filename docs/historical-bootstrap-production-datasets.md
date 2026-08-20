# Historical Bootstrap Phase 2 — Production Dataset Research

## Status

Phase 2 broad research pass, before locking data-source decisions or implementing generators/adapters.

This note is intentionally decision-oriented. It is not legal advice; licensing conclusions should be treated as engineering/product risk assessments for a public GitHub Pages app.

## Phase 2 objective

Replace the Phase 1 temporary historical return/inflation scaffolding with production-ranked Germany/EUR-suitable datasets, or adapters where public bundling is not legally safe. The shipped runtime should not expose non-production sample data.

Required series:

1. Germany/EUR inflation
2. Global/developed equity exposure for a Germany/EUR investor
3. EUR/German bond return proxy
4. EUR cash / short-rate proxy

The Phase 1 sampler should remain unchanged unless the chosen datasets force a small normalization-layer adjustment: it samples annual calendar years with replacement, synchronizes all selected series by year, intersects valid years, and injects generated annual nominal return paths into the existing yearly ledger.

## Source matrix

| Asset role | Candidate source | Coverage / shape | License / reuse signal | Bundling risk | Fit | Caveats |
|---|---|---|---|---|---|---|
| Inflation | Destatis GENESIS CPI / Verbraucherpreisindex | Germany CPI tables via GENESIS API/download; suitable for annual CPI/inflation generation. | GENESIS-Online is free under `Datenlizenz Deutschland – Namensnennung – Version 2.0`; Destatis gives source citation and changed-data wording. | Low | Strong default for Germany-first app. | Need pick exact table/series and generator; cite derived calculations as own calculation/display. |
| Inflation | Eurostat HICP annual data (`prc_hicp_aind`) | Annual HICP average index / rate of change by country; Germany and euro area available through Eurostat dissemination API. | Eurostat says data reuse is generally under CC BY 4.0, commercial use allowed unless exceptions apply; cite dataset DOI/datacode/access date. | Low | Strong alternative or cross-check. | HICP differs from national CPI; base/reference changes need handled by API/generator. |
| Cash | Bundesbank/ECB €STR monthly average | Bundesbank exposes `BBMMB.M.EU000A2X2A25.WT` Euro short-term rate monthly average via CSV/SDMX; verified endpoint works. | ESCB statistics reuse: free of charge with source quoted; statistics and metadata not modified; third-party data excluded. | Low/Medium | Good modern EUR cash proxy from 2019 onward. | Too short alone for historical retirement bootstrap; can be a modern segment, not sole long-run cash source. |
| Cash | Bundesbank EURIBOR / money-market rates | Bundesbank exposes EURIBOR monthly-average series, e.g. 3M `BBIG1.M.D0.EUR.MMKT.EURIBOR.M03.AVE.MA`; verified endpoint works. | Same ESCB/Bundesbank statistics reuse conditions. | Low/Medium | Good EUR money-market proxy, longer than €STR. | EURIBOR is benchmark rate, not deposit return; may include trademark/vendor considerations; derive annual cash returns carefully. |
| Cash | JST bills / short-term return | Annual real/nominal bills return variables across advanced economies since 1870. | CC BY-NC-SA 4.0; commercial data providers forbidden to integrate/resell. | Medium/High | Best long-run cash-like series if NC license accepted. | Non-commercial/share-alike terms may be undesirable for a public app/repo. |
| Bonds | JST bond returns | Annual long-term government bond return variables across advanced economies since 1870. | CC BY-NC-SA 4.0. | Medium/High | Best ready annual bond total-return source. | Same NC/share-alike issue; country aggregation and war/missing-year treatment need explicit choices. |
| Bonds | Bundesbank yields / term structure / federal securities | Bundesbank provides money/capital market yields, term structure data, listed Federal security prices/yields, expected real rates, and related time series. | ESCB/Bundesbank statistics reuse with attribution/no metadata modification, subject to third-party exclusions. | Low/Medium | Legally boring source for yields. | Yields are not total returns. A defensible bond total-return proxy would require a documented transformation/model and tests. |
| Bonds | OECD/FRED long-term government bond yields | Germany 10-year government bond yields available, often citation-required/copyrighted via redistributors. | Need check original OECD terms; FRED pages mark copyright/citation required. | Medium | Easy reference source. | Prefer original OECD/Bundesbank/ECB source over FRED redistribution; still yield-only. |
| Equity | JST equity returns | Annual long-run equity return variables across advanced economies; NBER describes long-term returns on equities, bonds, bills; Macrohistory R.6 covers 18 economies since 1870. | CC BY-NC-SA 4.0 and explicit restriction against commercial data providers integrating/reselling. | Medium/High | Best single broad annual real-return candidate. | Need explicit decision to accept NC/share-alike data in public app. Need choose Germany-only vs developed aggregate vs Europe/developed proxy. |
| Equity | MSCI World / STOXX / DAX index data | Recognisable benchmarks; close to user mental model for ETFs. | MSCI page states reproduction/redistribution/copying/transmission of index data requires prior written consent; STOXX/DAX data distribution is licensed. | High | Conceptually good but poor bundling candidate. | Do not bundle raw historical index data without explicit license. Maybe cite as conceptual benchmark only. |
| Equity | ETF NAV/history proxies | Public-looking price history from issuers/platforms. | Usually platform/vendor terms restrict redistribution; may be short and product-specific. | High | Realistic investor product proxy. | Not suitable as default bundled public data unless issuer terms permit. Tracking difference/TER/product changes complicate. |
| Equity | Fama-French / Kenneth French data library | Academic factor/portfolio returns, often monthly; possible developed/europe equity validation source. | Terms/source chain need review. | Medium | Useful research/validation source. | Less intuitive as asset class; bonds/cash/inflation still separate; not the first default candidate. |

## Early source findings with URLs

- Destatis GENESIS API/open-data page: GENESIS can be used free of charge under `Datenlizenz Deutschland – Namensnennung – Version 2.0`.
  - <https://www.destatis.de/EN/Service/OpenData/api-webservice.html>
  - <https://www.destatis.de/DE/Service/Impressum/copyright-genesis-online.html>
- Eurostat copyright/reuse page: Eurostat material is generally reusable, including for commercial purposes, under CC BY 4.0-style attribution unless exceptions apply; dataset citation guidance is explicit.
  - <https://ec.europa.eu/eurostat/help/copyright-notice>
- Bundesbank/ESCB reuse page: publicly available ESCB statistics may be reused free of charge with source attribution, but statistics/metadata must not be modified and third-party data are excluded.
  - <https://www.bundesbank.de/en/homepage/user-information/terms-of-use-regarding-the-reuse-of-escb-statistics-621188>
- Bundesbank money-market rates page exposes CSV/SDMX endpoints; endpoints verified during this research pass:
  - `https://api.statistiken.bundesbank.de/rest/data/BBMMB/M.EU000A2X2A25.WT?format=csv&lang=en`
  - `https://api.statistiken.bundesbank.de/rest/data/BBIG1/M.D0.EUR.MMKT.EURIBOR.M03.AVE.MA?format=csv&lang=en`
  - <https://www.bundesbank.de/en/statistics/money-and-capital-markets/interest-rates-and-yields/money-market-rates-651538>
- Bundesbank interest/yield hub: provides market-relevant rates/yields, term structure, prices/yields of listed Federal securities, deposit/lending rates, real rates, etc.
  - <https://www.bundesbank.de/en/statistics/money-and-capital-markets/interest-rates-and-yields/interest-rates-and-yields-793418>
- JST Macrohistory / MacroFinance & MacroHistory Lab: R.6 covers 18 advanced economies since 1870 with annual real/nominal macro-financial variables and return data; license is CC BY-NC-SA 4.0 and forbids commercial data providers from integrating/reselling.
  - <https://www.macrohistory.net/database>
  - <https://www.nber.org/research/data/jorda-schularick-taylor-macrohistory>
- MSCI index page includes restrictive index data terms: reproduction/redistribution/copying/transmission of index data requires prior written consent.
  - <https://www.msci.com/indexes>

## Preliminary recommendation

### If we accept non-commercial/share-alike data

Use JST Macrohistory as the backbone for equity, bonds, and bills/cash, because it is the only obvious broad annual total-return dataset that matches the model cleanly.

Then use Destatis or Eurostat as the explicit Germany/EUR inflation series, either to:

- deflate nominal JST-derived/proxy returns if needed, or
- document the sampled inflation series shown in the app.

Preferred default shape:

- equity: JST developed-market or Europe/developed aggregate real equity total return
- bonds: JST Germany/EUR or developed-market long-term government bond real return
- cash: JST bills/short-rate real return
- inflation: Destatis CPI or Eurostat HICP Germany annual inflation

This gives long coverage and real annual returns, but imports NC/share-alike product constraints.

### If we reject non-commercial/share-alike data

Use official/public-statistics sources where possible:

- inflation: Destatis or Eurostat
- cash: Bundesbank/ECB money-market / short-rate series
- bonds: Bundesbank/ECB/OECD yields or term structure, transformed into a documented bond-return proxy
- equity: remains the blocker; do not bundle MSCI/STOXX/DAX/ETF/index-vendor data without explicit rights

In this path, Phase 2 may need either:

1. a narrower Germany-only official-source equity proxy if found,
2. a generated series from a redistributable academic/public dataset after deeper license review,
3. or a product decision to keep equity blocked until licensed data is available.

## Updated product/licensing context

Max's stated intent: the app is not intended for commercial use; anyone may reuse and fork it from the public GitHub repository. A future commercial version should remain possible if the non-commercial dataset can be removed/replaced.

Working interpretation for Phase 2:

- JST-derived data is acceptable as a non-commercial default dataset if clearly marked as such.
- Keep code and data licensing separated; do not imply the whole repository is unrestricted MIT if bundled datasets are not.
- Treat JST as one dataset provider, not as a hardwired model assumption, so a future commercial/permissive provider can replace it without changing the sampler.
- Add a future research item for long-running broad ETF proxies, but treat them as a second option / validation benchmark rather than a replacement for the long-running equity database.

Recommended repository shape if JST is used:

```text
LICENSE                 # app/code license
DATA_LICENSES.md        # dataset-specific terms
src/.../returnData/     # generated/derived dataset snapshots with per-source metadata
scripts/                # generic generation scripts where possible
```

Dataset metadata should explicitly include fields such as `license`, `commercialUseAllowed`, `derivedData`, `sourceName`, `sourceUrl`, `retrievedAt`, `transformVersion`, and `checksum`.

## Decisions to grill/lock before deep implementation

### 1. Can this public app use CC BY-NC-SA data?

Status: **Provisionally locked to A** based on Max's non-commercial/public-forking intent, with the guardrail that code/data licenses are separated and future commercial replacement remains possible.

Decision options retained for final confirmation:

- A. Yes, JST is acceptable for this public, non-commercial calculator.
- B. No, avoid NC/share-alike data in bundled app assets.
- C. Use JST only in internal research/docs, not in shipped bundles.

### 2. What is the preferred equity proxy?

Recommendation: **Use broad developed/global equity exposure over Germany-only**, because it better matches typical German ETF portfolios. Germany-only is source-cleaner in some contexts but behaviorally less representative.

Decision needed:

- A. Broad developed/global equity proxy preferred.
- B. Europe/euro-area equity proxy preferred.
- C. Germany-only equity proxy preferred for source/geography purity.

### 3. Should bonds be true total return or can we accept yield-derived proxies?

Recommendation: **Prefer true total-return data if JST is accepted; otherwise allow a yield-derived Bund proxy only with a large caveat and transformation tests.**

Decision needed:

- A. Require total-return series; block if unavailable.
- B. Allow yield-derived proxy with explicit caveat.
- C. Use shorter modern total-return/product proxies only if licensing is clear.

### 4. Inflation source: Destatis CPI or Eurostat HICP?

Recommendation: **Destatis CPI as default for Germany-first app; Eurostat HICP as cross-check or alternate if API convenience wins.**

Decision needed:

- A. Destatis national CPI default.
- B. Eurostat Germany HICP default.
- C. Keep both in registry; one default and one non-default later.

### 5. What minimum usable history should Phase 2 require?

Recommendation: **Target 50+ annual observations for defaults; keep 30 as warning threshold.**

Decision needed:

- A. Minimum default must have 50+ valid years.
- B. 30+ valid years is acceptable if sources are clean.
- C. Accept shorter official modern data and show a stronger warning.

## Locked Phase 2 decisions after first grilling

Max accepted the proposed coherent Phase 2 path with the following defaults:

1. **JST accepted with data-license guardrails**: JST-derived data may ship as the default non-commercial dataset if code/data licenses are separated and future commercial replacement remains possible.
2. **Equity default**: broad developed/global equity proxy, not Germany-only.
3. **Equity return basis**: local-real equal-weight developed proxy for Phase 2, with caveat that it is not an exact EUR-hedged or EUR-converted ETF return.
4. **Bonds default**: JST broad developed long-term government bond real returns.
5. **Cash default**: JST bills / short-term safe-asset real returns.
6. **Inflation default**: Destatis German CPI as default; Eurostat Germany HICP can be kept as later cross-check/alternate.
7. **JST aggregation**: equal-weight countries with valid observations per year.
8. **Missing/incomplete years**: use only years where all selected series have finite values; no interpolation and no asset-specific fill.
9. **History window**: post-war/post-1950 default. Full-history datasets may be added later as optional variants.

Additional future research item:

- Long-running broad ETF proxies remain worth researching as a second option / validation benchmark, but not as a replacement for the long-running equity database backbone.

## Follow-up TODOs

### Research long-running broad ETF proxies

Create a later research pass for broad, long-running ETF or fund proxies as optional/validation datasets. This should not block the JST-backed Phase 2 default, but should answer:

- Which broad equity ETFs/funds have the longest usable history for a Germany/EUR investor?
- Are there UCITS options with enough annual observations, or do only US ETFs/funds have meaningful length?
- Can provider-published NAV/total-return histories be redistributed or transformed into a public GitHub Pages bundle?
- How should distributing vs accumulating share classes, dividends, TER, tracking difference, withholding tax, and EUR/USD conversion be handled?
- Should ETF-derived data be an optional modern dataset, a validation benchmark for JST overlap years, or only documentation context?

Acceptance output for that future task: a short matrix of candidate ETFs/funds, inception dates, return basis, currency/share class, licensing/reuse status, annual observation count, and recommendation.

## Targeted source inspection results

### JST R.6 exact dataset

Downloaded and inspected the JST R.6 Stata dataset from Macrohistory:

- Dataset URL: `https://www.macrohistory.net/app/download/9834512469/JSTdatasetR6.dta?t=1763503850`
- XLSX companion URL: `https://www.macrohistory.net/app/download/9834512569/JSTdatasetR6.xlsx?t=1763503850`
- Local inspection checksum for downloaded `.dta`: `sha256:b0ebb74a8d1b5b1bc9033fc46a6dcc578736afff8ce1e1086b7840f2649e79b3`
- Shape: 2,718 rows × 59 columns
- Countries in dataset: Australia, Belgium, Canada, Denmark, Finland, France, Germany, Ireland, Italy, Japan, Netherlands, Norway, Portugal, Spain, Sweden, Switzerland, UK, USA

Relevant JST columns for Phase 2:

| Role | JST column | Meaning in JST docs / inspection | Phase 2 use |
|---|---|---|---|
| Equity | `eq_tr` | Equity total return, nominal, local currency | Convert to real return with country CPI inflation, then equal-weight aggregate |
| Bonds | `bond_tr` | Government bond total return, nominal, local currency | Convert to real return with country CPI inflation, then equal-weight aggregate |
| Cash | `bill_rate` | Government bill / short-term rate, nominal | Convert to real return with country CPI inflation, then equal-weight aggregate |
| CPI | `cpi` | Consumer price index | Compute country inflation as `cpi[t] / cpi[t-1] - 1` |
| Interpolation flags | `eq_tr_interp`, `eq_capgain_interp`, `eq_dp_interp` | Equity interpolation flags | Keep as metadata / QA caveat; do not silently discard unless later review says so |

Nominal-to-real transformation for each country-year:

```ts
countryInflation = cpi[year] / cpi[previousYear] - 1
realReturn = (1 + nominalReturn) / (1 + countryInflation) - 1
```

### JST post-1950 coverage

Using `year >= 1950`, finite `eq_tr`, `bond_tr`, `bill_rate`, and computable `cpi` inflation:

- Usable aggregate years: **1950–2020**, **71 annual observations**.
- Countries with full 1950–2020 coverage for all three return roles: Australia, Belgium, Switzerland, Germany, Denmark, Finland, France, UK, Italy, Japan, Netherlands, Norway, Portugal, Sweden, USA.
- Spain has 70 usable years for cash/bills, so aggregate year 2018 has 15 countries instead of 16.
- Canada and Ireland are in JST R.6 but have no post-1950 observations for these return columns in the inspected dataset.
- Equal-weight aggregate country count by year: min 15, max 16.

Prototype equal-weight aggregate real returns from the inspected data:

| Year | Country count | Equity real | Bond real | Cash real |
|---:|---:|---:|---:|---:|
| 1950 | 16 | 9.78% | -1.19% | -0.20% |
| 1951 | 16 | 11.96% | -9.32% | -7.77% |
| 1952 | 16 | 5.76% | 1.22% | -1.26% |
| 1953 | 16 | 15.63% | 4.21% | 1.80% |
| 1954 | 16 | 37.46% | 3.34% | 1.32% |
| 2016 | 16 | 4.34% | 3.44% | -0.69% |
| 2017 | 16 | 12.68% | 1.09% | -1.57% |
| 2018 | 15 | -8.53% | -0.34% | -1.59% |
| 2019 | 16 | 20.47% | 6.45% | -1.19% |
| 2020 | 16 | 5.02% | 3.22% | -0.60% |

There were 3 post-1950 rows with `eq_tr_interp` and `eq_capgain_interp` set, spanning 1975–1977, and 2 with `eq_dp_interp`, spanning 1975–1976. Phase 2 should surface this in metadata/caveats; deeper source-doc review can decide whether to exclude interpolated country rows or keep them. Current recommendation: keep them for the default aggregate unless the return documentation indicates they are unsuitable, because the locked policy is no app-side interpolation, not necessarily excluding source-supplied reconstructed observations.

### Destatis / Bundesbank German CPI inflation source

Two relevant official-source paths were identified:

1. **Bundesbank-hosted Federal Statistical Office CPI long time series**, monthly year-on-year percent change:
   - API: `https://api.statistiken.bundesbank.de/rest/data/BBDP1/M.DE.N.VPI.C.A00000.VGJ.LV?format=csv&lang=en`
   - Time series label: `Consumer price index / Germany / Unadjusted figure / Overall index`
   - Source in CSV metadata: `Federal Statistical Office, Wiesbaden.`
   - Coverage from API inspection: 1949-06 onward; complete annual 12-month coverage for 1950–2020.
   - Unit: percent, one decimal.
   - Proposed Phase 2 use: annual inflation = arithmetic mean of the 12 monthly year-on-year percent changes, divided by 100.
   - One post-1950 flag observed in the inspected 1950–2020 window: April 1952 marked `Estimated value`.

2. **Destatis publication: Verbraucherpreisindex für Deutschland — Lange Reihen ab 1948 — Dezember 2022**, XLSX:
   - Page: `https://www.destatis.de/DE/Themen/Wirtschaft/Preise/Verbraucherpreisindex/Publikationen/Downloads-Verbraucherpreise/verbraucherpreisindex-lange-reihen-pdf-5611103.html`
   - XLSX: `https://www.destatis.de/DE/Themen/Wirtschaft/Preise/Verbraucherpreisindex/Publikationen/Downloads-Verbraucherpreise/verbraucherpreisindex-lange-reihen-xlsx-5611103.xlsx?__blob=publicationFile&v=99`
   - Contains annual averages and annual changes for several linked German/federal-territory price indices.
   - Caveat: discontinued after December 2022; the unified German CPI column starts in 1991, while pre-1991 rows rely on earlier former-federal-territory household price-index concepts. This is useful documentation/background but less clean as the default generator source than the Bundesbank-hosted long CPI time series.

Recommendation after targeted inspection: use the **Bundesbank API series backed by the Federal Statistical Office** as the default sampled Germany CPI inflation source for Phase 2, because it gives complete 1950–2020 coverage aligned with the JST post-war default. Keep the Destatis long-series XLSX as a documented cross-check/source note, not the first generator path.

Prototype annual sampled inflation values from the Bundesbank long CPI series:

| Year | Annual inflation proxy |
|---:|---:|
| 1950 | -6.32% |
| 1951 | 7.69% |
| 1952 | 2.27% |
| 1953 | -1.77% |
| 1954 | 0.23% |
| 2016 | 0.45% |
| 2017 | 1.53% |
| 2018 | 1.79% |
| 2019 | 1.39% |
| 2020 | 0.53% |

### Proposed Phase 2B production dataset IDs

Default registry entries:

| Role | Dataset ID | Label | Basis |
|---|---|---|---|
| Equity | `jst-r6-developed-equal-weight-equity-real-post1950` | `JST developed equities, equal-weight real, post-1950` | real annual return |
| Bonds | `jst-r6-developed-equal-weight-bonds-real-post1950` | `JST developed government bonds, equal-weight real, post-1950` | real annual return |
| Cash | `jst-r6-developed-equal-weight-bills-real-post1950` | `JST developed bills/cash, equal-weight real, post-1950` | real annual return |
| Inflation | `bundesbank-destatis-germany-cpi-yoy-annual-mean-post1950` | `Germany CPI inflation, Bundesbank/Destatis annualized monthly YoY, post-1950` | annual inflation |

All four defaults should cover 1950–2020, giving **71 valid synchronized sample years**.

### Proposed aggregation formula

For each JST return role and each year from 1950 through 2020:

1. For each country with finite `nominalReturn`, finite `cpi[year]`, and finite `cpi[previousYear]`, compute country real return.
2. For each role/year, average the real returns across available countries.
3. For the default synchronized year set, require finite aggregate equity, aggregate bonds, aggregate cash, and Germany CPI inflation.
4. Store annual country counts per role/year in source metadata or generated QA output; at minimum store the min/max country count and caveat that Spain cash is missing in one year and Canada/Ireland are absent from return aggregates.

Implementation sketch:

```ts
const countryInflation = cpiThisYear / cpiPreviousYear - 1
const countryRealReturn = (1 + countryNominalReturn) / (1 + countryInflation) - 1
const aggregateRealReturn = mean(countryRealReturnsForYear)
```

### License and metadata implementation notes

Add `DATA_LICENSES.md` with separate sections for:

- app code license;
- JST-derived return snapshots: CC BY-NC-SA 4.0, source URL, release R.6, non-commercial caveat, commercial replacement note;
- Bundesbank/Destatis CPI series: ESCB/Bundesbank/Destatis attribution and reuse notes.

Add dataset metadata fields beyond the current Phase 1 shape where useful:

```ts
commercialUseAllowed: boolean
derivedData: boolean
retrievedAt: string
sourceDatasetVersion: string
sourceChecksum: string
transformVersion: string
transformDescription: string
countryCoverage?: {
  includedCountries: string[]
  excludedCountries: string[]
  minCountriesPerYear: number
  maxCountriesPerYear: number
}
```

### Phase 2B implementation plan

1. Add `DATA_LICENSES.md`.
2. Add a generator script, e.g. `scripts/generateHistoricalReturnData.mjs` or `.py`, that downloads/reads JST R.6 and Bundesbank CPI, computes the post-1950 snapshots, and writes a TypeScript data module.
3. Add generated data under `src/features/rentenluecke/model/returnData/`, keeping raw downloaded data out of the repo unless explicitly chosen.
4. Replace Phase 1 temporary default IDs with the generated production IDs.
5. Keep any non-production sample data test-only or remove it entirely from user-facing defaults.
6. Add tests for:
   - 1950–2020 synchronized valid-year coverage;
   - metadata/license completeness;
   - no Phase 1 non-production dataset selected by default;
   - deterministic seed changes when generated dataset checksum changes;
   - sampled historical mode still produces stable rows and warnings do not trigger for 71 observations.
7. Run full gate: `npm test -- --run`, `npm run lint`, `npm run build`.
