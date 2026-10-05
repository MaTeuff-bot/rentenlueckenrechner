# Tagesgeld — Gemeinsame Annahme — Rule snapshot (2026)

Scope: liquid ordinary bank deposits (Tagesgeld) as a cash-category holding
(`ordinary-bank-deposit`) with a non-negative nominal gross credited rate
(0 allowed). Separate proportional bucket costs stay; negative net return
through costs is allowed; negative real return through inflation is allowed.
Never add inflation into the nominal rate except via the documented
real-target formula below.

Rule snapshot: `tagesgeld-common-v1-2026-10-05` (constant `tagesgeld-planzins-v1`,
historical `tagesgeld-historisch-strategie-v1-2026-10-05`,
real `tagesgeld-realannahme-v1-2026-10-05`).
No calibration claim; the 2 % constant proposal and the −0,28 % real proposal
are explicitly confirmed proposals, not validated market or long-term values.

## Modes (Rechenannahmen, one shared selection)

- `constant-nominal` (default proposal): source id `tagesgeld-planzins-v1`,
  kind `planningRate`, category/role `cash`, expected return = planning rate,
  volatility 0, cost treatment `deductBucketAnnualCost`. Same rate on all paths
  (reference, bootstrap, required-capital search), all years/buckets/paths.
  Multiple bank buckets share this one rate; no per-bucket factor, no spurious
  diversification. Resolution independent of sampled year and scenario inflation.
  Threaded via `HistoricalBootstrapSettings.cashPlanningRate`. Result bands omit
  cash rate uncertainty (constant).
- `historical-zero-floor` (Kontowechsel-Strategie): source id
  `tagesgeld-historisch-strategie-v1`, historical nominal series 1968–2025.
  Applied nominal per sampled year `max(0, rawAnnualNominal)`; raw values
  preserved including the observed 2021 negative; real/cost/net never floored.
  Paired sampling: joint common calendar-year intersection with selected
  assets/inflation (default JST/current German CPI 1968–2020 including 1975 =
  53 years); never draw deposit/inflation independently of equity. Fixed
  inflation supported with the nominal series unchanged (never re-nominalize an
  already nominal series). Short ETF windows disclosed. Threaded via the
  historical series (no `cashPlanningRate`/`cashRealRate` needed).
- `real-assumption-zero-floor` (label `Realzins-Annahme mit nominaler
  0%-Untergrenze`): source id `tagesgeld-realannahme-v1`, editable finite
  signed target `>-1`, default proposal about −0,28 % p.a. (descriptive raw
  composite mean 1968–2020 including interpolated 1975 about
  −0,27631615093 %, not a calibrated prediction). Per sampled year
  `nominal = max(0, (1+realTarget)*(1+sampledInflation)-1)`; real consequences
  from the applied nominal. With historical inflation use the same sampled year;
  with fixed inflation use the fixed input. Where the 0 % floor binds the target
  is disclosed as not achieved. Threaded via
  `HistoricalBootstrapSettings.cashRealRate`.

Guards throw without silent fallback: constant `Tagesgeld-Planungszins fehlt
oder ist ungültig; unter Rechenannahmen festlegen.`, real `Realzins-Annahme
fehlt oder ist ungültig; unter Rechenannahmen festlegen.` Year sampling:
constant and real sources do not restrict sample years (like synthetic);
historical restricts to its joint window. Seed material includes the threaded
rate(s) in `createHistoricalBootstrapSeed` input hashing.

## Default, persistence, confirmation

- Default proposal is constant nominal 2 %; saved confirmed constant scenarios
  are never reinterpreted.
- New options are explicitly selectable; consistent explicit assumption
  confirmation before forecast; no extra strategy toggle.
- Unrelated edits never clear the common confirmation; a mode change always
  requires truthful re-consent (`cashPlanningRateConfirmed=false`).
- Unknown/malformed stored modes are truthfully invalid, never silently
  reinterpreted as constant.
- Raw bank-source/mode inconsistency is preserved on load (no silent
  normalization); unrelated bucket edits (value/costs/name) never auto-fix the
  source. Only a valid explicit re-confirmation adopts the matching source for
  all declared `ordinary-bank-deposit` buckets.
- A bank-source/selected-mode mismatch for any of the three modes blocks
  calculation with an explicit re-confirmation issue naming the expected source
  (`tagesgeld-planzins-v1`, `tagesgeld-historisch-strategie-v1`,
  `tagesgeld-realannahme-v1`).
- Bank buckets have no per-bucket source dropdown (common display only); fund
  source controls, bank costs, unsupported-holding guards and fund-only
  independence are preserved. Holding is never inferred from source.
- Bank-to-fund reclassification resets a bank planning source to the equity
  default instead of silently keeping a cash proxy as a fund source. Ordinary
  bank-holding validation and fund invalid-source reset stay distinct.

## Nominal floor strategy and limitations (disclosed alongside controls)

Assume the saver moves to a suitable account avoiding negative credited interest;
access is not guaranteed for every balance/period; switching effort/costs,
eligibility, balance caps and deposit-insurance allocation are not modeled.
Raw historical rates preserved; 0 % strategy floor, paired market/inflation year
preserved; net costs/inflation can still lose money. Source is a German
savings/overnight proxy with a 2003 product/methodology break (SU0022 through
2002, SUD101 from 2003), not best Tagesgeld. January 1975 is a marked estimate
(linear time-in-month Nov1974→Feb1975, Jan at 2/3, not midpoint, no invented raw
observation); early years annualized via quarterly representatives
(1968 Mar/Jun/Sep/Nov; 1969–1974 Feb/May/Aug/Nov); from 1976 mean of 12 monthly
quotes. No promise for the future. The existing constant nominal rate is clearly
distinct. No claim that every scenario succeeds if unrelated state is
incomplete/unsupported.

## Deterministic expected-return convention

Reference scenario and required-capital search never silently fall back to
constant nominal; they use the selected mode consistently:

- Constant: expected nominal = planning rate.
- Historical: expected nominal = mean of floored nominals over the joint window
  (default 53-year mean; fixed-inflation window 58-year mean).
- Real: expected nominal = mean of floored `(1+realTarget)*(1+inflation)-1` over
  the joint window (fixed inflation collapses to the single-year value).

`expectedBucketReturns` and `sampledBucketReturns` report
`grossBankReturnRate` (gross, before bucket costs) and `totalReturnRate`
(`gross − annualCostRate`, floored at −1 like other sources).

## Ordering (yearly ledger)

Gross bank interest is credited once per year from bank opening balance × rate;
no double crediting, no principal re-taxation. Cost deduction and tax follow the
existing capital-income ordering (fund-only Teilfreistellung first, then
unexempted bank interest, single shared loss pot/allowance). KV/PV and pension
tax follow the existing yearly ledger slots; charts and summary cards derive
from the same simulation result. Constant bands omit cash rate uncertainty;
historical/real bands reflect sampled year/inflation variability.

## NOT modeled

- Calibration of the 2 % and −0,28 % proposals; variable-rate offers beyond the
  three documented modes; bank-switching effort/costs/eligibility/caps/insurance
  allocation; inflation coupling beyond the real-target formula.
- Bonds/money-market funds, allocation/drift changes, surplus reinvestment,
  new asset classes.

## Open follow-ups (do not resolve here)

1. Calibration/validation of the proposal values and any varying-rate extension
   beyond the three modes.
2. Commercial data-provider replacement for non-commercial JST snapshots
   (model unchanged).

## Source register (reproducible, own calculation)

- Bundesbank MFI statistics SU0022/SUD101 endpoints (see
  `HISTORICAL_DEPOSIT_SOURCE_METADATA.sourceUrls`), reuse terms
  https://www.bundesbank.de/en/service/terms-of-use with attribution
  `Quelle: Deutsche Bundesbank, MFI-Zinsstatistik SU0022/SUD101; eigene
  Annualisierung als eigene Berechnung (own calculation)`.
- Compact checked-in monthly snapshots `scripts/data/su0022-monthly.csv`
  (`sha256:a3b1e4676cea324fc1d5f77df1b4760fa3b125113c67406fccb4ff5c2273f57e`)
  and `scripts/data/sud101-monthly.csv`
  (`sha256:b745fa2aff9fcc9d6db08e3b8665957434b6e1be8ddeba4122921d110b1c2172`),
  extracted verbatim from official CSVs (`sha256:0bcb3e368150ce5603f4cad3815da0cdb94e94378eba4e4ae8beb7d821df2b56`,
  `sha256:73e27339ee8ac436fc92b8d7cda2745b276bf99356502e6d528a6f421c1ee359`);
  generator `scripts/generateHistoricalDepositData.mjs` validates input hashes
  and writes `historicalDepositData.ts` with series
  `sha256:35f7d0cba8083333adadd87d78fcfebede9cbbade55e31ebfbdb9562b6f47397`.
  Annual values byte-identical to the approved method; transform is an own
  calculation, not provider statistics.
