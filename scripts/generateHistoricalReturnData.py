#!/usr/bin/env python3
"""Generate production historical return/inflation TypeScript data.

Requires Python packages `pandas` and `pyreadstat` to read JST's Stata `.dta`
file. Install them in a local developer environment, for example:

    python3 -m pip install pandas pyreadstat

The generated TypeScript snapshot is committed to the app; Vite/React runtime
and app builds do not depend on Python.

Raw downloads are cached outside the repo by default:
`/tmp/rentenlueckenrechner-historical-data`. Override with:

    HISTORICAL_DATA_CACHE_DIR=/path/outside/repo python3 scripts/generateHistoricalReturnData.py
    HISTORICAL_JST_DTA=/path/JSTdatasetR6.dta python3 scripts/generateHistoricalReturnData.py
"""

from __future__ import annotations

import csv
import hashlib
import json
import math
import os
from pathlib import Path
from urllib.request import Request, urlopen

try:
    import pandas as pd
except ImportError as exc:  # pragma: no cover - developer environment guard
    raise SystemExit(
        "Missing Python dependency `pandas`. Install with: python3 -m pip install pandas pyreadstat"
    ) from exc

JST_URL = "https://www.macrohistory.net/app/download/9834512469/JSTdatasetR6.dta?t=1763503850"
BUNDESBANK_CPI_URL = (
    "https://api.statistiken.bundesbank.de/rest/data/BBDP1/M.DE.N.VPI.C.A00000.VGJ.LV?format=csv&lang=en"
)
START_YEAR = 1950
END_YEAR = 2020
TRANSFORM_VERSION = "historical-return-data-v1"
GENERATED_AT = os.environ.get("HISTORICAL_DATA_GENERATED_AT", "2026-08-15T00:00:00.000Z")

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src/features/rentenluecke/model/returnData/historicalProductionData.ts"


def main() -> None:
    cache_dir = Path(os.environ.get("HISTORICAL_DATA_CACHE_DIR", "/tmp/rentenlueckenrechner-historical-data"))
    cache_dir.mkdir(parents=True, exist_ok=True)

    jst_path = Path(os.environ["HISTORICAL_JST_DTA"]) if "HISTORICAL_JST_DTA" in os.environ else cache_dir / "JSTdatasetR6.dta"
    cpi_path = cache_dir / "bundesbank-destatis-germany-cpi.csv"

    if not jst_path.exists():
        download(JST_URL, jst_path)
    if not cpi_path.exists():
        download(BUNDESBANK_CPI_URL, cpi_path)

    jst_checksum = sha256_file(jst_path)
    cpi_checksum = sha256_file(cpi_path)
    try:
        jst = pd.read_stata(jst_path, convert_categoricals=False)
    except ImportError as exc:  # pragma: no cover - developer environment guard
        raise SystemExit(
            "Missing Python dependency for reading Stata files. Install with: python3 -m pip install pandas pyreadstat"
        ) from exc

    jst_result = build_jst_series(jst)
    inflation = build_cpi_series(cpi_path)
    synchronized_years = [
        year
        for year in range(START_YEAR, END_YEAR + 1)
        if year in jst_result["equity"]
        and year in jst_result["bond"]
        and year in jst_result["cash"]
        and year in inflation["series"]
    ]

    if synchronized_years != list(range(START_YEAR, END_YEAR + 1)):
        raise SystemExit(f"Expected synchronized years 1950-2020, got {synchronized_years[:3]}...{synchronized_years[-3:]}")

    write_ts(jst_result, inflation, jst_checksum, cpi_checksum)
    print(f"Wrote {OUT.relative_to(ROOT)}")


def download(url: str, out: Path) -> None:
    request = Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urlopen(request, timeout=120) as response:
        data = response.read()
    out.write_bytes(data)


def sha256_file(path: Path) -> str:
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


def build_jst_series(jst: "pd.DataFrame") -> dict:
    required = {"country", "year", "cpi", "eq_tr", "bond_tr", "bill_rate"}
    missing = sorted(required - set(jst.columns))
    if missing:
        raise SystemExit(f"JST dataset is missing expected columns: {', '.join(missing)}")

    jst = jst.sort_values(["country", "year"]).copy()
    by_country_year = {
        (row.country, int(row.year)): row
        for row in jst.itertuples(index=False)
        if finite(getattr(row, "cpi", None))
    }
    roles = {"equity": "eq_tr", "bond": "bond_tr", "cash": "bill_rate"}
    series = {role: {} for role in roles}
    counts = {role: {} for role in roles}
    included_countries: set[str] = set()
    all_countries = set(str(country) for country in jst["country"].dropna().unique())

    for year in range(START_YEAR, END_YEAR + 1):
        for role, column in roles.items():
            values = []
            for country in all_countries:
                row = by_country_year.get((country, year))
                previous = by_country_year.get((country, year - 1))
                if row is None or previous is None:
                    continue
                nominal = getattr(row, column)
                if not finite(nominal) or not finite(row.cpi) or not finite(previous.cpi) or previous.cpi == 0:
                    continue
                country_inflation = row.cpi / previous.cpi - 1
                values.append((1 + float(nominal)) / (1 + float(country_inflation)) - 1)
                included_countries.add(country)
            if values:
                series[role][year] = sum(values) / len(values)
                counts[role][year] = len(values)

    return {
        **series,
        "counts": counts,
        "includedCountries": sorted(included_countries),
        "excludedCountries": sorted(all_countries - included_countries),
    }


def build_cpi_series(cpi_path: Path) -> dict:
    rows_by_year: dict[int, list[float]] = {}
    flags: list[str] = []
    with cpi_path.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.reader(file)
        for row in reader:
            if len(row) < 2 or len(row[0]) != 7 or row[0][4] != "-":
                continue
            year = int(row[0][:4])
            if START_YEAR <= year <= END_YEAR:
                rows_by_year.setdefault(year, []).append(float(row[1]) / 100)
                if len(row) > 2 and row[2]:
                    flags.append(f"{row[0]}: {row[2]}")

    series = {}
    for year in range(START_YEAR, END_YEAR + 1):
        values = rows_by_year.get(year, [])
        if len(values) != 12:
            raise SystemExit(f"Expected 12 Bundesbank CPI observations for {year}, got {len(values)}")
        series[year] = sum(values) / len(values)

    return {"series": series, "flags": flags}


def finite(value: object) -> bool:
    return value is not None and isinstance(value, (int, float)) and math.isfinite(value)


def series_hash(series: dict[int, float]) -> str:
    payload = json.dumps({str(year): series[year] for year in sorted(series)}, separators=(",", ":"), sort_keys=True)
    return "sha256:" + hashlib.sha256(payload.encode("utf-8")).hexdigest()


def ts_record(series: dict[int, float]) -> str:
    lines = ["{"]
    for year in sorted(series):
        lines.append(f"  {year}: {series[year]:.12g},")
    lines.append("}")
    return "\n".join(lines)


def write_ts(jst: dict, inflation: dict, jst_checksum: str, cpi_checksum: str) -> None:
    country_counts = {
        role: {
            "min": min(jst["counts"][role].values()),
            "max": max(jst["counts"][role].values()),
        }
        for role in ["equity", "bond", "cash"]
    }
    metadata = {
        "generatedAt": GENERATED_AT,
        "transformVersion": TRANSFORM_VERSION,
        "jstSourceChecksum": jst_checksum,
        "bundesbankCpiSourceChecksum": cpi_checksum,
        "jstSeriesChecksums": {role: series_hash(jst[role]) for role in ["equity", "bond", "cash"]},
        "inflationSeriesChecksum": series_hash(inflation["series"]),
        "countryCoverage": {
            "includedCountries": jst["includedCountries"],
            "excludedCountries": jst["excludedCountries"],
            "minCountriesPerYear": min(count["min"] for count in country_counts.values()),
            "maxCountriesPerYear": max(count["max"] for count in country_counts.values()),
            "byRole": country_counts,
        },
        "cpiFlags": inflation["flags"],
    }
    source = json.dumps(metadata, indent=2)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        f"""import type {{ HistoricalReturnSeries, InflationSeries }} from '../historicalReturns'

export const HISTORICAL_PRODUCTION_DATA_METADATA = {source} as const

const jstSource = {{
  kind: 'bundled',
  path: 'src/features/rentenluecke/model/returnData/historicalProductionData.ts',
  sourceName: 'Jorda-Schularick-Taylor Macrohistory Database R.6',
  sourceUrl: 'https://www.macrohistory.net/database/',
  license: 'CC BY-NC-SA 4.0',
}} as const

const bundesbankDestatisSource = {{
  kind: 'bundled',
  path: 'src/features/rentenluecke/model/returnData/historicalProductionData.ts',
  sourceName: 'Bundesbank time series sourced to Federal Statistical Office, Wiesbaden',
  sourceUrl: 'https://api.statistiken.bundesbank.de/rest/data/BBDP1/M.DE.N.VPI.C.A00000.VGJ.LV?format=csv&lang=en',
  license: 'Bundesbank/ESCB statistics reuse terms; Destatis/Federal Statistical Office attribution',
}} as const

const sharedJstCaveats = [
  'Derived from JST R.6 nominal local-currency returns deflated by each country CPI and equal-weighted across developed countries with finite observations.',
  'Local-real developed-market proxy; not an exact EUR-hedged or EUR-converted ETF return.',
  'JST-derived data is CC BY-NC-SA 4.0 and not cleared for commercial use.',
  'Includes source-supplied reconstructed/interpolated JST observations where present; no app-side interpolation or fill is applied.',
]

const countryCoverage = HISTORICAL_PRODUCTION_DATA_METADATA.countryCoverage

export const HISTORICAL_PRODUCTION_RETURN_SERIES: HistoricalReturnSeries[] = [
  {{
    id: 'jst-r6-developed-equal-weight-equity-real-post1950',
    label: 'JST entwickelte Aktien, real, 1950-2020',
    description: 'Equal-weight developed-market equity total-return proxy derived from JST R.6 and converted to local real annual returns.',
    role: 'equity',
    suitableFor: ['equity'],
    geography: 'Global',
    currency: 'EUR',
    returnBasis: 'real',
    returnType: 'grossTotal',
    source: jstSource,
    license: 'CC BY-NC-SA 4.0',
    licenseAllowsBundling: true,
    commercialUseAllowed: false,
    derivedData: true,
    sourceDatasetVersion: 'JST Macrohistory Database R.6',
    sourceChecksum: HISTORICAL_PRODUCTION_DATA_METADATA.jstSourceChecksum,
    normalizedSeries: {ts_record(jst["equity"])},
    startYear: 1950,
    endYear: 2020,
    caveats: sharedJstCaveats,
    confidence: 'medium',
    transformVersion: HISTORICAL_PRODUCTION_DATA_METADATA.transformVersion,
    transformDescription: 'realReturn = (1 + nominalReturn) / (1 + countryCpiInflation) - 1; equal-weight finite country real returns by year for 1950-2020.',
    checksum: HISTORICAL_PRODUCTION_DATA_METADATA.jstSeriesChecksums.equity,
    generatedAt: HISTORICAL_PRODUCTION_DATA_METADATA.generatedAt,
    countryCoverage,
  }},
  {{
    id: 'jst-r6-developed-equal-weight-bonds-real-post1950',
    label: 'JST entwickelte Staatsanleihen, real, 1950-2020',
    description: 'Equal-weight developed-market long-term government bond total-return proxy derived from JST R.6 and converted to local real annual returns.',
    role: 'bond',
    suitableFor: ['bond'],
    geography: 'Global',
    currency: 'EUR',
    returnBasis: 'real',
    returnType: 'grossTotal',
    source: jstSource,
    license: 'CC BY-NC-SA 4.0',
    licenseAllowsBundling: true,
    commercialUseAllowed: false,
    derivedData: true,
    sourceDatasetVersion: 'JST Macrohistory Database R.6',
    sourceChecksum: HISTORICAL_PRODUCTION_DATA_METADATA.jstSourceChecksum,
    normalizedSeries: {ts_record(jst["bond"])},
    startYear: 1950,
    endYear: 2020,
    caveats: sharedJstCaveats,
    confidence: 'medium',
    transformVersion: HISTORICAL_PRODUCTION_DATA_METADATA.transformVersion,
    transformDescription: 'realReturn = (1 + nominalReturn) / (1 + countryCpiInflation) - 1; equal-weight finite country real returns by year for 1950-2020.',
    checksum: HISTORICAL_PRODUCTION_DATA_METADATA.jstSeriesChecksums.bond,
    generatedAt: HISTORICAL_PRODUCTION_DATA_METADATA.generatedAt,
    countryCoverage,
  }},
  {{
    id: 'jst-r6-developed-equal-weight-bills-real-post1950',
    label: 'JST entwickelte Bills/Cash, real, 1950-2020',
    description: 'Equal-weight developed-market government bill and short-rate cash proxy derived from JST R.6 and converted to local real annual returns.',
    role: 'cash',
    suitableFor: ['cash'],
    geography: 'Global',
    currency: 'EUR',
    returnBasis: 'real',
    returnType: 'yieldBased',
    source: jstSource,
    license: 'CC BY-NC-SA 4.0',
    licenseAllowsBundling: true,
    commercialUseAllowed: false,
    derivedData: true,
    sourceDatasetVersion: 'JST Macrohistory Database R.6',
    sourceChecksum: HISTORICAL_PRODUCTION_DATA_METADATA.jstSourceChecksum,
    normalizedSeries: {ts_record(jst["cash"])},
    startYear: 1950,
    endYear: 2020,
    caveats: [
      ...sharedJstCaveats,
      'Spain cash/bill observations are missing in one post-1950 year, so that aggregate year uses fewer countries.',
    ],
    confidence: 'medium',
    transformVersion: HISTORICAL_PRODUCTION_DATA_METADATA.transformVersion,
    transformDescription: 'realReturn = (1 + nominalReturn) / (1 + countryCpiInflation) - 1; equal-weight finite country real returns by year for 1950-2020.',
    checksum: HISTORICAL_PRODUCTION_DATA_METADATA.jstSeriesChecksums.cash,
    generatedAt: HISTORICAL_PRODUCTION_DATA_METADATA.generatedAt,
    countryCoverage,
  }},
]

export const HISTORICAL_PRODUCTION_INFLATION_SERIES: InflationSeries[] = [
  {{
    id: 'bundesbank-destatis-germany-cpi-yoy-annual-mean-post1950',
    label: 'Deutschland CPI Inflation, 1950-2020',
    description: 'German CPI annual inflation proxy computed as the arithmetic mean of 12 monthly year-on-year percent changes from the Bundesbank-hosted Destatis/Federal Statistical Office series.',
    geography: 'DE',
    currency: 'EUR',
    annualInflation: {ts_record(inflation["series"])},
    source: bundesbankDestatisSource,
    license: 'Bundesbank/ESCB statistics reuse terms; Destatis/Federal Statistical Office attribution',
    licenseAllowsBundling: true,
    commercialUseAllowed: true,
    derivedData: true,
    sourceDatasetVersion: 'BBDP1.M.DE.N.VPI.C.A00000.VGJ.LV',
    sourceChecksum: HISTORICAL_PRODUCTION_DATA_METADATA.bundesbankCpiSourceChecksum,
    startYear: 1950,
    endYear: 2020,
    caveats: [
      'Annual inflation is a generated proxy: arithmetic mean of monthly year-on-year CPI percent changes divided by 100.',
      'Bundesbank CSV metadata names Federal Statistical Office, Wiesbaden as the source.',
      'April 1952 is flagged as an estimated value in the source CSV.',
    ],
    confidence: 'high',
    transformVersion: HISTORICAL_PRODUCTION_DATA_METADATA.transformVersion,
    transformDescription: 'Mean of 12 monthly year-on-year German CPI percent-change observations for each calendar year, divided by 100.',
    checksum: HISTORICAL_PRODUCTION_DATA_METADATA.inflationSeriesChecksum,
    generatedAt: HISTORICAL_PRODUCTION_DATA_METADATA.generatedAt,
  }},
]
""",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
