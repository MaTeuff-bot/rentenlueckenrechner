# Historical Bootstrap Phase 2 — Production Dataset Research

## Status

Phase 2 broad research pass, before locking data-source decisions or implementing generators/adapters.

This note is intentionally decision-oriented. It is not legal advice; licensing conclusions should be treated as engineering/product risk assessments for a public GitHub Pages app.

## Phase 2 objective

Replace the Phase 1 provisional historical return/inflation fixtures with production-ranked Germany/EUR-suitable datasets, or adapters where public bundling is not legally safe.

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
3. or a product decision to keep equity provisional/blocked until licensed data is available.

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

## Proposed next step

Run the deeper targeted research pass for the locked source strategy:

- retrieve exact JST R.6 dataset/documentation and identify equity, bond, bill/cash, CPI/inflation columns;
- verify country coverage and post-1950 finite observation intersections;
- define exact equal-weight aggregation formulas;
- retrieve exact Destatis CPI table/API query or generated file path;
- design dataset IDs, metadata, checksums, and `DATA_LICENSES.md` text;
- produce a PR 2B implementation plan before coding the generator and registry replacement.
