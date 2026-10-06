#!/usr/bin/env node
// Generates the compact bundled German savings/deposit annual nominal series.
// Stdlib only (node:crypto, node:fs). Reproducible: `node scripts/generateHistoricalDepositData.mjs`
// Inputs are compact checked-in official raw monthly snapshots:
//   scripts/data/su0022-monthly.csv  (SU0022, 1968-2002 selected months, percent p.a.)
//   scripts/data/sud101-monthly.csv  (SUD101, 2003-2025 all months, percent p.a.)
// Each input SHA256 is recorded below and validated before generation. The snapshots
// were extracted verbatim (month,rate_percent) from the official Bundesbank CSVs:
//   su0022-official.csv sha256:0bcb3e368150ce5603f4cad3815da0cdb94e94378eba4e4ae8beb7d821df2b56
//   sud101-official.csv sha256:73e27339ee8ac436fc92b8d7cda2745b276bf99356502e6d528a6f421c1ee359
// Compare e.g. `grep "^1975-02" scripts/data/su0022-monthly.csv` against the official
// `1975-02,5.19,` row. No /workspace runtime dependency: the app bundles only the
// derived annual series in historicalDepositData.ts.
// Annualization (own calculation, eigene Berechnung): 1968 quarterly reps Mar/Jun/Sep/Nov,
// 1969-1974 Feb/May/Aug/Nov, 1975 eleven observed Feb-Dec plus estimated January via
// linear time-in-month interpolation Nov1974->Feb1975 with Jan at 2/3 (NOT midpoint,
// no invented raw observation), 1976 onward mean of 12 monthly quotes. Raw annual
// nominals preserve observed negatives; strategy floor max(0, raw) applies at simulation.
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import process from 'node:process'

const OUTPUT_PATH = 'src/features/rentenluecke/model/returnData/historicalDepositData.ts'
const SU0022_PATH = 'scripts/data/su0022-monthly.csv'
const SUD101_PATH = 'scripts/data/sud101-monthly.csv'

// Actual SHA256 of the checked-in compact snapshots (hex, no prefix).
const SU0022_SHA256 = 'a3b1e4676cea324fc1d5f77df1b4760fa3b125113c67406fccb4ff5c2273f57e'
const SUD101_SHA256 = 'b745fa2aff9fcc9d6db08e3b8665957434b6e1be8ddeba4122921d110b1c2172'
// Research originals for independent comparison (not read at generation).
const RESEARCH_SU0022_SHA256 = '0bcb3e368150ce5603f4cad3815da0cdb94e94378eba4e4ae8beb7d821df2b56'
const RESEARCH_SUD101_SHA256 = '73e27339ee8ac436fc92b8d7cda2745b276bf99356502e6d528a6f421c1ee359'

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function parseMonthlyCsv(text, path) {
  const lines = text.split('\n')
  if (lines[0].trim() !== 'month,rate_percent') throw new Error(`Unexpected header in ${path}: ${lines[0]}`)
  const obs = new Map()
  for (const line of lines.slice(1)) {
    if (line.trim() === '') continue
    const [month, rate] = line.split(',')
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error(`Bad month in ${path}: ${line}`)
    if (rate === undefined || rate === '' || rate === '.') throw new Error(`Missing rate in ${path}: ${line}`)
    const percent = Number(rate)
    if (!Number.isFinite(percent)) throw new Error(`Non-finite rate in ${path}: ${line}`)
    if (obs.has(month)) throw new Error(`Duplicate month in ${path}: ${month}`)
    obs.set(month, percent / 100)
  }
  return obs
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

const suBytes = await readFile(SU0022_PATH)
const sudBytes = await readFile(SUD101_PATH)
const suHash = sha256Hex(suBytes)
const sudHash = sha256Hex(sudBytes)
if (suHash !== SU0022_SHA256) throw new Error(`SU0022 snapshot hash mismatch: got ${suHash}, expected ${SU0022_SHA256}`)
if (sudHash !== SUD101_SHA256) throw new Error(`SUD101 snapshot hash mismatch: got ${sudHash}, expected ${SUD101_SHA256}`)

const su = parseMonthlyCsv(suBytes.toString('utf-8'), SU0022_PATH)
const sud = parseMonthlyCsv(sudBytes.toString('utf-8'), SUD101_PATH)

function requireMonth(map, ym, path) {
  const value = map.get(ym)
  if (value === undefined) throw new Error(`Missing required month ${ym} in ${path}`)
  return value
}

// Early quarterly annualization.
const earlyAnnuals = {}
for (let year = 1968; year <= 1974; year++) {
  const months = year === 1968 ? [3, 6, 9, 11] : [2, 5, 8, 11]
  const quotes = months.map((m) => {
    const ym = `${year}-${String(m).padStart(2, '0')}`
    return requireMonth(su, ym, SU0022_PATH)
  })
  earlyAnnuals[year] = mean(quotes)
}

// January 1975 lies 2/3 along Nov1974 -> Feb1975 time-in-month (mid-Nov to mid-Feb
// is 3 steps; mid-Jan is 2 steps after mid-Nov). Linear level interpolation, NOT midpoint.
const NOV_1974_RATE = requireMonth(su, '1974-11', SU0022_PATH)
const FEB_1975_RATE = requireMonth(su, '1975-02', SU0022_PATH)
const january1975 = NOV_1974_RATE + (FEB_1975_RATE - NOV_1974_RATE) * (2 / 3)
const midpoint1975 = (NOV_1974_RATE + FEB_1975_RATE) / 2
if (january1975 === midpoint1975) throw new Error('January 1975 estimate must not equal the midpoint')
const febDec1975 = []
for (let m = 2; m <= 12; m++) {
  febDec1975.push(requireMonth(su, `1975-${String(m).padStart(2, '0')}`, SU0022_PATH))
}
const annual1975 = (febDec1975.reduce((s, v) => s + v, 0) + january1975) / 12

// 1976 onward: mean of 12 monthly quotes (SU0022 through 2002, SUD101 from 2003).
const annualMeans = {}
for (let year = 1976; year <= 2002; year++) {
  const vals = []
  for (let m = 1; m <= 12; m++) vals.push(requireMonth(su, `${year}-${String(m).padStart(2, '0')}`, SU0022_PATH))
  annualMeans[year] = mean(vals)
}
for (let year = 2003; year <= 2025; year++) {
  const vals = []
  for (let m = 1; m <= 12; m++) vals.push(requireMonth(sud, `${year}-${String(m).padStart(2, '0')}`, SUD101_PATH))
  annualMeans[year] = mean(vals)
}

const RAW_ANNUAL_NOMINAL = { ...earlyAnnuals, 1975: annual1975, ...annualMeans }
const years = Object.keys(RAW_ANNUAL_NOMINAL).map(Number).sort((a, b) => a - b)
if (JSON.stringify(years) !== JSON.stringify(Array.from({ length: 58 }, (_, index) => 1968 + index))) {
  throw new Error(`Expected full annual coverage 1968-2025, got ${years[0]}-${years[years.length - 1]} (${years.length} years)`)
}
for (const [year, value] of Object.entries(RAW_ANNUAL_NOMINAL)) {
  if (!Number.isFinite(value)) throw new Error(`Non-finite annual nominal for ${year}`)
}
if (!(RAW_ANNUAL_NOMINAL[2021] < 0)) throw new Error('Expected the observed 2021 negative annual nominal to be preserved')

// Genuine series checksum: sha256 of canonical JSON {year: value} sorted, no spaces.
const canonical = JSON.stringify(Object.fromEntries(years.map((y) => [String(y), RAW_ANNUAL_NOMINAL[y]])))
const seriesChecksum = 'sha256:' + sha256Hex(canonical)

const lines = Object.entries(RAW_ANNUAL_NOMINAL)
  .map(([year, value]) => `  ${year}: ${value},`)
  .join('\n')

const output = `import type { HistoricalReturnSeries } from '../historicalReturns/types'\nimport {\n  HISTORICAL_DEPOSIT_STRATEGY_SOURCE_ID,\n  HISTORICAL_DEPOSIT_STRATEGY_VERSION,\n} from '../historicalReturns/constants'\n\nexport const HISTORICAL_DEPOSIT_SOURCE_METADATA = {\n  seriesId: 'BBIB1.M.DE.B.H.DNB.SPM.K3M.A.N1.11A (SU0022, bis 2002) / BBIM1.M.DE.B.L21.A.R.A.2250.EUR.N (SUD101, ab 2003)',\n  sourceName: 'Deutsche Bundesbank MFI-Zinsstatistik (Spareinlagen/Tagesgeld-Proxy)',\n  sourceUrls: [\n    'https://api.statistiken.bundesbank.de/rest/data/BBIB1/M.DE.B.H.DNB.SPM.K3M.A.N1.11A?format=csv&lang=en',\n    'https://api.statistiken.bundesbank.de/rest/data/BBIM1/M.DE.B.L21.A.R.A.2250.EUR.N?format=csv&lang=en',\n  ],\n  reuseTermsUrl: 'https://www.bundesbank.de/en/homepage/user-information/terms-of-use-regarding-the-reuse-of-escb-statistics-621188',\n  attribution: 'Quelle: Deutsche Bundesbank, MFI-Zinsstatistik SU0022/SUD101; eigene Annualisierung als eigene Berechnung (own calculation)',\n  coverage: '1968-2025, 58 Jahresbeobachtungen (roh, nominal)',\n  january1975Estimate: ${january1975},\n  january1975Estimated: true,\n  generator: 'scripts/generateHistoricalDepositData.mjs (Node-Stdlib, reproduzierbar)',\n  inputs: {\n    su0022MonthlyCsv: '${SU0022_PATH}',\n    su0022Sha256: 'sha256:${SU0022_SHA256}',\n    sud101MonthlyCsv: '${SUD101_PATH}',\n    sud101Sha256: 'sha256:${SUD101_SHA256}',\n    researchSu0022Sha256: 'sha256:${RESEARCH_SU0022_SHA256}',\n    researchSud101Sha256: 'sha256:${RESEARCH_SUD101_SHA256}',\n  },\n  license: 'Bundesbank/ESCB statistics reuse terms (https://www.bundesbank.de/en/homepage/user-information/terms-of-use-regarding-the-reuse-of-escb-statistics-621188); eigene Annualisierung als eigene Berechnung (own calculation)',\n} as const\n\nexport const HISTORICAL_DEPOSIT_JANUARY_1975_ESTIMATE = ${january1975}\n\nexport const HISTORICAL_DEPOSIT_RAW_ANNUAL_NOMINAL: Record<number, number> = {\n${lines}\n}\n\nexport const HISTORICAL_DEPOSIT_RETURN_SERIES: HistoricalReturnSeries = {\n  id: HISTORICAL_DEPOSIT_STRATEGY_SOURCE_ID,\n  label: 'Deutsche Spareinlagen/Tagesgeld-Proxy, nominal, 1968-2025',\n  description: 'Deutscher Spar-/Einlagenzins-Proxy (SU0022 bis 2002, SUD101 ab 2003) als annualisierte Jahresreihe; Rohwerte mit beobachteten Negativwerten erhalten, Strategie floor bei Anwendung.',\n  role: 'cash',\n  suitableFor: ['cash'],\n  geography: 'DE',\n  currency: 'EUR',\n  returnBasis: 'nominal',\n  returnType: 'yieldBased',\n  sourceKind: 'historicalDataset',\n  costTreatment: 'deductBucketAnnualCost',\n  source: {\n    kind: 'bundled',\n    path: 'src/features/rentenluecke/model/returnData/historicalDepositData.ts',\n    sourceName: 'Deutsche Bundesbank MFI-Zinsstatistik (Spareinlagen/Tagesgeld-Proxy)',\n    sourceUrl: 'https://api.statistiken.bundesbank.de/rest/data/BBIM1/M.DE.B.L21.A.R.A.2250.EUR.N?format=csv&lang=en',\n    license: 'Bundesbank/ESCB statistics reuse terms (https://www.bundesbank.de/en/homepage/user-information/terms-of-use-regarding-the-reuse-of-escb-statistics-621188); eigene Annualisierung als eigene Berechnung (own calculation)',\n  },\n  license: 'Bundesbank/ESCB statistics reuse terms (https://www.bundesbank.de/en/homepage/user-information/terms-of-use-regarding-the-reuse-of-escb-statistics-621188); eigene Annualisierung als eigene Berechnung (own calculation)',\n  licenseAllowsBundling: true,\n  commercialUseAllowed: true,\n  derivedData: true,\n  sourceDatasetVersion: HISTORICAL_DEPOSIT_STRATEGY_VERSION,\n  sourceChecksum: '${seriesChecksum}',\n  transformDescription: 'Jahresmittel annualisierter Notierungen: 1968 vier Quartalsrepraesentanten (Mae/Jun/Sep/Nov), 1969-1974 Feb/Mai/Aug/Nov, 1975 elf beobachtete Feb-Dez-Monate plus geschaetzter Januar (linear zeitanteilig Nov1974->Feb1975, Januar bei 2/3, Schätzung markiert), ab 1976 Mittel aus 12 Monatsnotierungen.',\n  generatedAt: '2026-10-05T00:00:00.000Z',\n  rawSeries: HISTORICAL_DEPOSIT_RAW_ANNUAL_NOMINAL,\n  normalizedSeries: HISTORICAL_DEPOSIT_RAW_ANNUAL_NOMINAL,\n  startYear: 1968,\n  endYear: 2025,\n  caveats: [\n    'Deutscher Spar-/Tagesgeld-Proxy mit Produkt-/Methodenbruch 2003, kein bestes Tagesgeld.',\n    'Januar 1975 ist eine markierte Schaetzung (keine erfundene Rohbeobachtung); fruehe Annualisierung ueber Quartalsrepraesentanten.',\n    'Rohwerte mit Negativbeobachtung erhalten; die Kontowechsel-Strategie wendet max(0, roh) an.',\n  ],\n  confidence: 'medium',\n  transformVersion: HISTORICAL_DEPOSIT_STRATEGY_VERSION,\n}\n`

await writeFile(OUTPUT_PATH, output)
process.stdout.write('Wrote ' + OUTPUT_PATH + ' (' + years.length + ' annual observations, Jan1975=' + january1975 + ', series=' + seriesChecksum + ')\\n')
