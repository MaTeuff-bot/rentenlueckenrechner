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
