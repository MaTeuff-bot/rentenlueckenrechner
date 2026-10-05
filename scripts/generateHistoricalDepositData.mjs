#!/usr/bin/env node
// Generates the compact bundled German savings/deposit annual nominal series.
// Stdlib only (node). Reproducible: `node scripts/generateHistoricalDepositData.mjs`
// Research provenance: Bundesbank SU0022 (<=2002) / SUD101 (>=2003) monthly
// annualized quotes, annualized per docs in
// /workspace/renten-rate-rationale/docs/research/tagesgeld-composite (not copied).
// Early sparse years embed the selected representative quotes; 1976 onward embeds
// the audited annual means (mean of 12 monthly quotes). January 1975 is estimated
// by linear time-in-month interpolation Nov1974 -> Feb1975 with Jan at 2/3 of the
// interval (NOT the midpoint); no raw monthly observation is invented.
import { writeFile } from 'node:fs/promises'
import process from 'node:process'

const OUTPUT_PATH = 'src/features/rentenluecke/model/returnData/historicalDepositData.ts'

// Representative quarterly quotes (fractional units), selected per spec:
// 1968: Mar/Jun/Sep/Nov (one per quarter, Q4 November shift);
// 1969-1974: Feb/May/Aug/Nov. Extra observations in 1971/1973 are retained in
// the research audit but intentionally not overweighted here.
const QUARTERLY_QUOTES = {
  1968: [[3, 0.035], [6, 0.035], [9, 0.035], [11, 0.035]],
  1969: [[2, 0.035], [5, 0.035], [8, 0.04], [11, 0.04]],
  1970: [[2, 0.045], [5, 0.05], [8, 0.05], [11, 0.05]],
  1971: [[2, 0.05], [5, 0.0453], [8, 0.0453], [11, 0.0452]],
  1972: [[2, 0.045], [5, 0.04019999999999999], [8, 0.0401], [11, 0.0401]],
  1973: [[2, 0.0451], [5, 0.0452], [8, 0.055099999999999996], [11, 0.055099999999999996]],
  1974: [[2, 0.055099999999999996], [5, 0.055099999999999996], [8, 0.055099999999999996], [11, 0.055099999999999996]],
}

// Eleven observed Feb-Dec 1975 monthly quotes (fractional units), in calendar order.
const MONTHLY_1975_FEB_DEC = [
  0.0519, 0.050300000000000004, 0.0501, 0.0453, 0.0414, 0.04019999999999999,
  0.0401, 0.0401, 0.04, 0.04, 0.04,
]
const NOV_1974_RATE = 0.055099999999999996
const FEB_1975_RATE = 0.0519

// Audited annual means for 1976 onward (each the arithmetic mean of 12 monthly
// annualized quotes per the research audit). Embedded compactly; the 160MB
// bootstrap-path exports and third-party raw files are intentionally not copied.
const ANNUAL_MEANS_1976_2025 = {
  1976: 0.03630833333333334,
  1977: 0.031333333333333345,
  1978: 0.02550833333333334,
  1979: 0.03145,
  1980: 0.046441666666666666,
  1981: 0.049166666666666664,
  1982: 0.04851666666666667,
  1983: 0.032608333333333336,
  1984: 0.030100000000000002,
  1985: 0.028808333333333328,
  1986: 0.025033333333333335,
  1987: 0.021075,
  1988: 0.02008333333333333,
  1989: 0.024325,
  1990: 0.02809166666666667,
  1991: 0.02825,
  1992: 0.028124999999999997,
  1993: 0.025400000000000002,
  1994: 0.020949999999999996,
  1995: 0.02040833333333333,
  1996: 0.019925,
  1997: 0.0171,
  1998: 0.015608333333333335,
  1999: 0.013058333333333333,
  2000: 0.012466666666666668,
  2001: 0.011916666666666667,
  2002: 0.010233333333333332,
  2003: 0.011366666666666666,
  2004: 0.011391666666666666,
  2005: 0.011941666666666668,
  2006: 0.0136,
  2007: 0.017433333333333332,
  2008: 0.01945833333333333,
  2009: 0.010525,
  2010: 0.006941666666666666,
  2011: 0.007766666666666667,
  2012: 0.006666666666666668,
  2013: 0.003991666666666667,
  2014: 0.0028249999999999994,
  2015: 0.0015833333333333333,
  2016: 0.0009000000000000001,
  2017: 0.00042500000000000003,
  2018: 0.0001916666666666667,
  2019: 0.0001166666666666667,
  2020: 8.333333333333334e-06,
  2021: -6.666666666666668e-05,
  2022: 9.03501810404587e-21,
  2023: 0.003716666666666667,
  2024: 0.005816666666666667,
  2025: 0.004733333333333333,
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function annualizeEarlyYears() {
  const annuals = {}
  for (const [yearText, quotes] of Object.entries(QUARTERLY_QUOTES)) {
    const year = Number(yearText)
    const expectedMonths = year === 1968 ? [3, 6, 9, 11] : [2, 5, 8, 11]
    const actualMonths = quotes.map(([month]) => month)
    if (JSON.stringify(actualMonths) !== JSON.stringify(expectedMonths)) {
      throw new Error(`Unexpected quarterly months for ${year}: ${actualMonths}`)
    }
    if (quotes.length !== 4) throw new Error(`Expected 4 quarterly quotes for ${year}`)
    annuals[year] = mean(quotes.map(([, rate]) => rate))
  }
  return annuals
}

// January 1975 lies 2/3 along the Nov1974 -> Feb1975 time-in-month interval
// (mid-Nov to mid-Feb is 3 month-steps; mid-Jan is 2 steps after mid-Nov).
// This is linear interpolation of the quoted level, NOT a midpoint average
// and NOT an invented raw monthly observation.
function estimateJanuary1975() {
  const january = NOV_1974_RATE + (FEB_1975_RATE - NOV_1974_RATE) * (2 / 3)
  const midpoint = (NOV_1974_RATE + FEB_1975_RATE) / 2
  if (january === midpoint) throw new Error('January 1975 estimate must not equal the midpoint')
  return january
}

const earlyAnnuals = annualizeEarlyYears()
const january1975 = estimateJanuary1975()
const annual1975 = (MONTHLY_1975_FEB_DEC.reduce((sum, value) => sum + value, 0) + january1975) / 12

const RAW_ANNUAL_NOMINAL = { ...earlyAnnuals, 1975: annual1975, ...ANNUAL_MEANS_1976_2025 }
const years = Object.keys(RAW_ANNUAL_NOMINAL).map(Number).sort((a, b) => a - b)
if (JSON.stringify(years) !== JSON.stringify(Array.from({ length: 58 }, (_, index) => 1968 + index))) {
  throw new Error(`Expected full annual coverage 1968-2025, got ${years[0]}-${years[years.length - 1]} (${years.length} years)`)
}
for (const [year, value] of Object.entries(RAW_ANNUAL_NOMINAL)) {
  if (!Number.isFinite(value)) throw new Error(`Non-finite annual nominal for ${year}`)
}
if (!(RAW_ANNUAL_NOMINAL[2021] < 0)) throw new Error('Expected the observed 2021 negative annual nominal to be preserved')

const lines = Object.entries(RAW_ANNUAL_NOMINAL)
  .map(([year, value]) => `  ${year}: ${value},`)
  .join('\n')

const output = `import type { HistoricalReturnSeries } from '../historicalReturns/types'\nimport {\n  HISTORICAL_DEPOSIT_STRATEGY_SOURCE_ID,\n  HISTORICAL_DEPOSIT_STRATEGY_VERSION,\n} from '../historicalReturns/constants'\n\nexport const HISTORICAL_DEPOSIT_SOURCE_METADATA = {\n  seriesId: 'BBIB1.M.DE.B.H.DNB.SPM.K3M.A.N1.11A (SU0022, bis 2002) / BBIM1.M.DE.B.L21.A.R.A.2250.EUR.N (SUD101, ab 2003)',\n  sourceName: 'Deutsche Bundesbank MFI-Zinsstatistik (Spareinlagen/Tagesgeld-Proxy)',\n  sourceUrls: [\n    'https://api.statistiken.bundesbank.de/rest/data/BBIB1/M.DE.B.H.DNB.SPM.K3M.A.N1.11A?format=csv&lang=en',\n    'https://api.statistiken.bundesbank.de/rest/data/BBIM1/M.DE.B.L21.A.R.A.2250.EUR.N?format=csv&lang=en',\n  ],\n  coverage: '1968-2025, 58 Jahresbeobachtungen (roh, nominal)',\n  january1975Estimate: ${january1975},\n  january1975Estimated: true,\n  generator: 'scripts/generateHistoricalDepositData.mjs (Node-Stdlib, reproduzierbar)',\n  license: 'Bundesbank/ESCB statistics reuse terms; eigene Annualisierung als eigene Berechnung',\n} as const\n\nexport const HISTORICAL_DEPOSIT_JANUARY_1975_ESTIMATE = ${january1975}\n\nexport const HISTORICAL_DEPOSIT_RAW_ANNUAL_NOMINAL: Record<number, number> = {\n${lines}\n}\n\nexport const HISTORICAL_DEPOSIT_RETURN_SERIES: HistoricalReturnSeries = {\n  id: HISTORICAL_DEPOSIT_STRATEGY_SOURCE_ID,\n  label: 'Deutsche Spareinlagen/Tagesgeld-Proxy, nominal, 1968-2025',\n  description: 'Deutscher Spar-/Einlagenzins-Proxy (SU0022 bis 2002, SUD101 ab 2003) als annualisierte Jahresreihe; Rohwerte mit beobachteten Negativwerten erhalten, Strategie floor bei Anwendung.',\n  role: 'cash',\n  suitableFor: ['cash'],\n  geography: 'DE',\n  currency: 'EUR',\n  returnBasis: 'nominal',\n  returnType: 'yieldBased',\n  sourceKind: 'historicalDataset',\n  costTreatment: 'deductBucketAnnualCost',\n  source: {\n    kind: 'bundled',\n    path: 'src/features/rentenluecke/model/returnData/historicalDepositData.ts',\n    sourceName: 'Deutsche Bundesbank MFI-Zinsstatistik (Spareinlagen/Tagesgeld-Proxy)',\n    license: 'Bundesbank/ESCB statistics reuse terms; eigene Annualisierung als eigene Berechnung',\n  },\n  license: 'Bundesbank/ESCB statistics reuse terms; eigene Annualisierung als eigene Berechnung',\n  licenseAllowsBundling: true,\n  commercialUseAllowed: true,\n  derivedData: true,\n  sourceDatasetVersion: HISTORICAL_DEPOSIT_STRATEGY_VERSION,\n  sourceChecksum: 'bundled-annual-means-v1',\n  transformDescription: 'Jahresmittel annualisierter Notierungen: 1968 vier Quartalsrepraesentanten (Mae/Jun/Sep/Nov), 1969-1974 Feb/Mai/Aug/Nov, 1975 elf beobachtete Feb-Dez-Monate plus geschaetzter Januar (linear zeitanteilig Nov1974->Feb1975, Januar bei 2/3, Sch\u00e4tzung markiert), ab 1976 Mittel aus 12 Monatsnotierungen.',\n  generatedAt: '2026-10-05T00:00:00.000Z',\n  rawSeries: HISTORICAL_DEPOSIT_RAW_ANNUAL_NOMINAL,\n  normalizedSeries: HISTORICAL_DEPOSIT_RAW_ANNUAL_NOMINAL,\n  startYear: 1968,\n  endYear: 2025,\n  caveats: [\n    'Deutscher Spar-/Tagesgeld-Proxy mit Produkt-/Methodenbruch 2003, kein bestes Tagesgeld.',\n    'Januar 1975 ist eine markierte Schaetzung (keine erfundene Rohbeobachtung); fruehe Annualisierung ueber Quartalsrepraesentanten.',\n    'Rohwerte mit Negativbeobachtung erhalten; die Kontowechsel-Strategie wendet max(0, roh) an.',\n  ],\n  confidence: 'medium',\n  transformVersion: HISTORICAL_DEPOSIT_STRATEGY_VERSION,\n}\n`

await writeFile(OUTPUT_PATH, output)
process.stdout.write('Wrote ' + OUTPUT_PATH + ' (' + years.length + ' annual observations, Jan1975=' + january1975 + ')\\n')
