# Data Licenses

This repository separates application code licensing from bundled dataset licensing.

## Application Code

Application source code is covered by the repository's code license in `LICENSE`, if present. Dataset terms below do not grant broader rights to third-party data than their original providers allow.

## JST Macrohistory R.6 Derived Return Snapshots

Bundled historical equity, bond, and bill/cash return snapshots are derived from the Jordà-Schularick-Taylor Macrohistory Database, release R.6.

- Source: https://www.macrohistory.net/database/
- Dataset file used by the generator: `JSTdatasetR6.dta`
- License signal: Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)
- Commercial use: not allowed for this bundled derived dataset.
- Share-alike: derived snapshots should be redistributed only under compatible terms.
- Attribution: cite the JST Macrohistory Database / MacroFinance & MacroHistory Lab when using or redistributing these derived snapshots.

The calculator treats JST as a replaceable dataset provider. A future commercial version can replace the non-commercial JST-derived snapshots with a commercially licensed or permissively licensed provider without changing the historical bootstrap model.

## Bundesbank / Destatis German CPI Inflation Snapshot

Bundled German CPI inflation values are generated from a Bundesbank-hosted time series sourced to the Federal Statistical Office, Wiesbaden.

- Source endpoint: https://api.statistiken.bundesbank.de/rest/data/BBDP1/M.DE.N.VPI.C.A00000.VGJ.LV?format=csv&lang=en
- Bundesbank series: `BBDP1.M.DE.N.VPI.C.A00000.VGJ.LV`
- Source named in the CSV metadata: Federal Statistical Office, Wiesbaden.
- Transformation: arithmetic mean of the 12 monthly year-on-year CPI percent-change observations for each calendar year, divided by 100.

Bundesbank/ESCB statistics reuse terms generally allow reuse free of charge with source attribution, while requiring that statistics and metadata are not misrepresented and that third-party rights remain respected. Destatis GENESIS/open-data material is generally made available under `Datenlizenz Deutschland - Namensnennung - Version 2.0`; cite Destatis/Federal Statistical Office and mark transformed calculations as own calculations.

This repository stores transformed annual values, source metadata, checksums, and caveats so users can distinguish the bundled snapshot from the original provider statistics.

## Yahoo Finance ETF Adjusted-Close Fallbacks

The two bundled ETF series are static annual normalized returns derived from Yahoo Finance adjusted close observations for the EUR-denominated Xetra listings `IUSQ.DE` and `EUNM.DE`. The application does not fetch Yahoo data at runtime.

- These are adjusted market-price series, not official fund NAV or official fund total-return series.
- Market-price, currency, and adjustment effects can differ from official fund reporting.
- The ETF TER is considered already reflected in the ETF price/NAV. Simulations therefore do not deduct a bucket's annual cost rate again when either ETF source is selected.
- Yahoo's terms and any applicable third-party market-data rights apply to the source observations; the bundled records retain source URLs, transformation notes, and checksums.

## Bundesbank German Savings/Deposit Rate Proxy (Annualized Snapshot)

Bundled annual nominal observations for the German savings/deposit proxy combine two Bundesbank MFI interest-rate statistics: `SU0022` (savings deposits, through 2002) and `SUD101` (households' overnight deposits, from 2003).

- Source endpoints:
  - https://api.statistiken.bundesbank.de/rest/data/BBIB1/M.DE.B.H.DNB.SPM.K3M.A.N1.11A?format=csv&lang=en
  - https://api.statistiken.bundesbank.de/rest/data/BBIM1/M.DE.B.L21.A.R.A.2250.EUR.N?format=csv&lang=en
- Reuse terms: https://www.bundesbank.de/en/service/terms-of-use (Bundesbank/ESCB statistics reuse terms). Attribution: `Quelle: Deutsche Bundesbank, MFI-Zinsstatistik SU0022/SUD101; eigene Annualisierung als eigene Berechnung (own calculation)`.
- Compact checked-in monthly snapshots (official raw percent values, own calculation from them):
  - `scripts/data/su0022-monthly.csv` (`sha256:a3b1e4676cea324fc1d5f77df1b4760fa3b125113c67406fccb4ff5c2273f57e`)
  - `scripts/data/sud101-monthly.csv` (`sha256:b745fa2aff9fcc9d6db08e3b8665957434b6e1be8ddeba4122921d110b1c2172`)
- Research originals for independent comparison (not bundled, no runtime dependency):
  - `su0022-official.csv` (`sha256:0bcb3e368150ce5603f4cad3815da0cdb94e94378eba4e4ae8beb7d821df2b56`)
  - `sud101-official.csv` (`sha256:73e27339ee8ac436fc92b8d7cda2745b276bf99356502e6d528a6f421c1ee359`)
- Transformation (own calculation, reproducible via `node scripts/generateHistoricalDepositData.mjs` which validates the input hashes): annual arithmetic means of annualized quotes — 1968 quarterly representatives (Mar/Jun/Sep/Nov), 1969–1974 (Feb/May/Aug/Nov), 1975 eleven observed Feb–Dec months plus an estimated January (linear time-in-month interpolation Nov 1974 → Feb 1975, January at 2/3, marked as an estimate, no invented raw observation), from 1976 the mean of 12 monthly quotes.
- Derived annual series checksum `sha256:35f7d0cba8083333adadd87d78fcfebede9cbbade55e31ebfbdb9562b6f47397` (canonical JSON of year→value); annual values byte-identical to the approved method.
- Raw annual values are preserved including the observed 2021 negative; the account-switching strategy applies `max(0, raw)` at simulation time.
- This is a German savings/overnight proxy with a 2003 product/methodology break, not best available Tagesgeld. Bundesbank/ESCB statistics reuse terms apply; cite the Bundesbank and mark transformed calculations as own calculations.
