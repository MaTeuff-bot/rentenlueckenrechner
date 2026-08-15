# Historical Annual Bootstrap Return Model Plan

## Status

Locked design plan for the historical-data return model. This plan assumes the app stays Germany/EUR-first and keeps the existing simple portfolio UI while introducing a historical annual bootstrap simulation mode.

## Phase philosophy

Each implementation phase should leave the app in a working, reviewable state:

- The app should build and tests should pass after every phase.
- A phase may hide incomplete capability behind data/feature defaults, but it should not leave broken UI paths or half-wired simulation behavior.
- Phase 1 should deliver the smallest working version of the new architecture, not merely scaffolding.
- Later phases should enrich dataset quality, UX, and data-source breadth without invalidating the Phase 1 behavior.

## Goal

Add a new simulation mode that can use historical annual return and inflation data instead of only generating portfolio returns from synthetic asset-class assumptions.

The feature should let users model retirement outcomes using return/inflation combinations that actually occurred historically, while preserving same-year relationships between:

- equity returns
- bond returns
- cash/fixed-interest returns
- inflation

## User-facing modes

Keep the existing mode as the default/simple path:

- **Synthetic assumptions** — current behavior, using generated returns from user assumptions.

Add a new mode:

- **Historical annual bootstrap** — samples historical calendar years. For each simulated year, the app uses equity, bond, cash, and inflation data from the same historical year.

Suggested explanatory copy:

> Historical bootstrap reuses past annual return/inflation combinations. It preserves historical same-year relationships but does not predict future markets and may miss scenarios not present in the data.

## Locked v1 decisions

| Topic | Decision |
|---|---|
| Historical mode | Add as alternative to synthetic assumptions |
| Sampling unit | One historical calendar year |
| Sampling replacement | With replacement |
| Asset synchronization | Same sampled year across all assets and inflation |
| Inflation | Mandatory default Germany/EUR series, explicit but not user-selectable |
| Geography/currency | Germany/EUR only |
| Dataset overlap | Use years where all selected historical series have data |
| Missing data | Drop incomplete years, no interpolation |
| Minimum observations | 30-year soft warning |
| UI portfolio rows | Keep Equity / Bonds / Cash |
| Internal portfolio model | Generic N-component model |
| Fixed bucket | Rename to Cash |
| Manual returns | Allow as synthetic dropdown options, especially for Cash |
| Dataset labels | Short labels plus tooltip/detail metadata |
| Dataset storage | Bundle if license allows; support remote adapters otherwise |
| Reproducibility | Deterministic seed from inputs/datasets |
| Fees/taxes | Out of scope except dataset caveats |
| Future sampling | TODO for block bootstrap / rolling historical windows |

## Sampling method

For each simulated year:

1. Pick one valid historical calendar year at random.
2. Use that same year for every selected historical return series and for inflation.
3. Compute the weighted portfolio return.
4. Repeat independently for the next simulated year.

Example:

```ts
const sampledYear = 2008

const equityReturn = equityDataset.normalizedSeries[2008]
const bondReturn = bondDataset.normalizedSeries[2008]
const cashReturn = cashDataset.normalizedSeries[2008]
const inflation = inflationDataset.annualInflation[2008]

const portfolioReturn =
  equityWeight * equityReturn +
  bondWeight * bondReturn +
  cashWeight * cashReturn
```

Use sampling **with replacement**. The same historical year may appear multiple times in one simulation path.

Example sampled path:

```txt
1999, 2008, 1974, 2008, 2013, 2022, 2008
```

## Synchronization rule

Historical sampling must be calendar-year synchronized.

If the sampled year is 2008, all selected datasets use their 2008 value. Do not sample each asset independently.

This preserves same-year relationships such as:

- equity crash plus bond rally
- inflation shock plus bond underperformance
- cash yield response to inflation/rates
- stagflation and disinflation years

## Inflation handling

Historical mode always uses a predefined Germany/EUR inflation dataset.

For v1:

- show it explicitly in the UI;
- do not allow user selection yet;
- default to a Germany/EUR-relevant inflation series.

Example UI copy:

> Inflation dataset: German CPI / EUR inflation proxy

v1 should remain mostly a real-terms model. Inflation is included because nominal datasets may need normalization and because future extensions may use sampled inflation for nominal cashflows. Avoid turning v1 into a full nominal cashflow model unless the current app already requires it.

## Geography and currency scope

v1 is Germany/EUR only.

Do not add:

- generic global-user mode;
- USD-first defaults;
- user-facing currency selector.

Dataset selection should focus on assets a Germany/EUR-based user might plausibly hold:

- global equity exposure from a German/EUR investor perspective;
- eurozone/German bond exposure;
- EUR cash or German short-rate proxy;
- German or euro-area inflation.

Non-EUR datasets should only be used if they are transformed into a suitable EUR/Germany-relevant derived series or clearly rejected.

## Portfolio UI and internal model

Keep three visible portfolio rows for v1:

1. Equity
2. Bonds
3. Cash

Rename the current "fixed" bucket to **Cash**.

Tooltip idea:

> Cash-like assets, money market funds, overnight deposits, or manually fixed low-risk return assumptions.

Internally, move toward a generic portfolio component model so later versions can support arbitrary rows without rewriting the simulation engine.

Suggested shape:

```ts
type PortfolioComponent = {
  id: string
  label: string
  role: "equity" | "bond" | "cash" | "other"
  weight: number
  returnSeriesId: string
}
```

Initial defaults:

```ts
const defaultPortfolioComponents = [
  { role: "equity", label: "Equity", weight: 0.7, returnSeriesId: "..." },
  { role: "bond", label: "Bonds", weight: 0.2, returnSeriesId: "..." },
  { role: "cash", label: "Cash", weight: 0.1, returnSeriesId: "..." },
]
```

## Dataset dropdowns

Each visible row gets a dataset selector.

Example:

| Component | Dataset |
|---|---|
| Equity | Global equities — MSCI World proxy |
| Bonds | EUR government bonds |
| Cash | EUR money market / cash proxy |

Dropdowns should be role-filtered:

- Equity row shows equity-like datasets.
- Bonds row shows bond-like datasets.
- Cash row shows cash-like/manual fixed return datasets.

Datasets need tags:

```ts
suitableFor: ["equity", "bond", "cash", "inflation"]
```

No need to expose "show all datasets" in v1.

## Manual/synthetic return options inside historical mode

Historical mode should still allow manual/synthetic return options where useful, especially for Cash.

Example dropdown option:

> Fixed real return…

Suggested internal representation:

```ts
type ManualFixedReturnSeries = {
  id: "manual-fixed-real"
  kind: "synthetic"
  returnBasis: "real"
  annualReturn: number
}
```

Manual series do not restrict valid historical years. When a sampled year is selected, manual return series simply return the configured constant value.

## Dataset model

Datasets should preserve raw/source metadata and expose a normalized simulation-ready series.

Suggested shape:

```ts
type HistoricalReturnSeries = {
  id: string
  label: string
  description: string

  role: "equity" | "bond" | "cash" | "inflation" | "other"
  suitableFor: Array<"equity" | "bond" | "cash" | "inflation">

  geography: "DE" | "EU" | "Global"
  currency: "EUR"
  returnBasis: "nominal" | "real"
  returnType: "price" | "grossTotal" | "netTotal" | "yieldBased" | "unknown"

  source: DatasetSource
  license: string
  licenseAllowsBundling: boolean

  rawSeries?: Record<number, number>
  normalizedSeries: Record<number, number>

  startYear: number
  endYear: number
  caveats: string[]
  confidence: "high" | "medium" | "low"
}
```

Inflation shape:

```ts
type InflationSeries = {
  id: string
  label: string
  geography: "DE" | "EU"
  currency: "EUR"
  annualInflation: Record<number, number>
}
```

## Dataset source adapters

Because licensing may prevent bundling some datasets, the architecture should support both bundled and remote datasets.

```ts
type DatasetSource =
  | {
      kind: "bundled"
      path: string
      sourceName: string
      sourceUrl?: string
      license: string
    }
  | {
      kind: "remote"
      sourceName: string
      sourceUrl: string
      adapter: string
      licenseNote: string
    }
```

Bundling rule:

- If the license allows bundling derived annual data, hardcode/bundle it.
- If not, use a source adapter or remote-fetch path.
- The simulation engine should not care whether the data came from bundled JSON/TS or a remote adapter.

Every normalized dataset should carry enough metadata to identify what was used:

```ts
{
  sourceUrl?: string
  retrievedAt?: string
  transformVersion: string
  yearRange: [number, number]
  checksum?: string
}
```

## Valid sample years

The usable historical year set is not merely the overlap between start/end years.

A valid sample year is a year where every selected historical return series and the inflation series has a valid observation.

For v1:

- drop incomplete years;
- do not interpolate missing annual returns;
- do not fill missing returns silently.

Example:

```ts
const validYears = intersection(
  years(equitySeries),
  years(bondSeries),
  years(cashSeries),
  years(inflationSeries),
)
```

Manual/synthetic series do not restrict valid years.

## Minimum sample warning

Use a 30-year soft minimum.

If valid sample years are below 30, allow simulation but show a warning:

> Selected datasets provide only 26 usable historical years. Historical bootstrap results may be unstable.

Also show usable-year information somewhere in the UI:

> Usable historical years: 1999–2024, 26 observations

or, if non-contiguous:

> Usable historical years: 1975–2024, 47 observations after excluding missing years

## Deterministic simulation

Historical bootstrap should be deterministic for identical inputs.

Use an internal deterministic seed derived from:

- portfolio weights;
- selected dataset IDs;
- dataset versions/checksums;
- simulation settings;
- withdrawal/retirement settings;
- simulation count.

No visible user seed is needed for v1.

## Net/gross/fees/tax handling

v1 should not attempt full personal-investor return correction.

Target standard:

> Historical returns are market/index returns before personal taxes and before user-specific product costs, unless explicitly stated otherwise in the dataset metadata.

Preferences when selecting datasets:

- for equities: prefer net total return index if available and legally usable;
- otherwise use a total-return proxy with caveat;
- avoid price-only series unless no better option exists;
- for bonds: prefer total return bond indices or defensible yield/return proxies;
- for cash: prefer short-rate / money-market return proxy;
- for inflation: Germany/EUR CPI/HICP-type series.

Out of scope for v1:

- capital gains tax;
- Vorabpauschale;
- personal tax rates;
- broker fees;
- ETF TER;
- individual fund tracking difference;
- withholding tax details beyond what is already embedded in the source series.

Future optional improvement:

> Add annual return drag / cost assumptions.

## Tooltip/detail metadata

Dropdown labels stay concise.

Example label:

> Global equities — MSCI World proxy

Tooltip/details include:

- source;
- start/end years;
- usable years after overlap;
- geography/currency;
- nominal vs real;
- gross/net/price/total return;
- license/source note;
- caveats;
- confidence label.

Dataset caveats should be present, but not dominate the normal UI.

## Working implementation phases

### Phase 1 — minimal working historical-bootstrap architecture

Goal: produce a working app version with historical mode wired end-to-end, even if the initial datasets are deliberately small/provisional.

Deliverables:

- Add return model selection: synthetic vs historical annual bootstrap.
- Keep synthetic mode working unchanged.
- Rename visible Fixed bucket to Cash.
- Introduce internal generic portfolio components while preserving the three-row UI.
- Add dataset registry types and source metadata fields.
- Add at least one bundled/provisional valid Germany/EUR dataset set for Equity, Bonds, Cash, and Inflation, or small fixture-like app data clearly marked as provisional if final licensing/data selection is not complete.
- Add manual fixed-real-return option for Cash.
- Implement valid-year intersection.
- Implement synchronized annual sampling with replacement.
- Implement deterministic seeded sampling.
- Show selected default inflation dataset explicitly but read-only.
- Show valid-year count and below-30 warning.
- Add model tests for sampler, valid-year logic, deterministic behavior, and manual series behavior.
- App builds and the main calculator remains usable in both modes.

Acceptance checks:

- `npm test` passes.
- `npm run build` passes.
- Synthetic mode produces the same user-facing behavior as before except the label rename from Fixed to Cash.
- Historical mode can be selected and produces simulated outcomes using synchronized historical years.
- Re-rendering with identical inputs does not change historical results.

### Phase 2 — researched production dataset registry

Goal: replace provisional/default data with researched Germany/EUR-suitable datasets, or adapters where bundling is not legally safe.

Deliverables:

- Analyse/select datasets for:
  - Germany/EUR inflation;
  - global equity exposure for a German/EUR investor;
  - EUR/German bonds;
  - EUR cash / short-rate proxy.
- Record source, license, caveats, confidence, retrieval date, transform version, and checksum where applicable.
- Bundle derived annual data when licensing permits.
- Add remote adapter path when licensing does not permit bundling.
- Keep Phase 1 UI and simulation behavior working.
- Add tests for selected dataset coverage and metadata completeness.

Acceptance checks:

- `npm test` passes.
- `npm run build` passes.
- Historical mode uses production-ranked default datasets or clearly documents any remaining licensing blocker.
- Dataset details/tooltips expose source, year range, basis, caveats, and confidence.

### Phase 3 — UX polish and documentation

Goal: make historical mode understandable and safe for normal users.

Deliverables:

- Improve historical-mode copy and warning display.
- Add concise dataset labels and tooltip/detail content.
- Ensure role-filtered dropdowns are clear.
- Add method caveat near historical mode.
- Add README/docs section explaining historical bootstrap.
- Add UI tests for mode switching, warnings, and dataset selectors if practical.

Acceptance checks:

- `npm test` passes.
- `npm run build` passes.
- A user can understand what historical mode does without reading source code.
- Warnings appear for short usable-year sets.

### Phase 4 — optional future improvements, not required for v1

These should not block a working historical-bootstrap release:

- block bootstrap;
- rolling historical windows;
- regime-aware sampling;
- arbitrary add/remove portfolio rows;
- user-selectable inflation dataset;
- cost/return-drag assumptions;
- nominal cashflow mode;
- dataset version pinning UI;
- advanced dataset selection / show-all datasets.

## Phase 1 handoff summary

If handing off only Phase 1, the implementer should focus on a narrow vertical slice:

1. Preserve current synthetic behavior.
2. Add historical mode as a selectable alternative.
3. Add the data abstractions and sampler.
4. Use a small/provisional bundled Germany/EUR dataset set if final dataset research is not ready.
5. Prove the mode works with tests and build output.

Do not spend Phase 1 trying to solve perfect dataset selection. That belongs in Phase 2, unless a safe obvious public source is immediately available.
