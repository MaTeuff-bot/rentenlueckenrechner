import type { HistoricalReturnSeries } from '../historicalReturns/types'
import { findEtfProfileByIsin } from '../etfProfiles'

const dataPath = 'src/features/rentenluecke/model/returnData/bundledEtfHistoricalReturnData.ts'

function createEtfSeries(
  id: string,
  isin: string,
  normalizedSeries: Record<number, number>,
  checksum: string,
): HistoricalReturnSeries {
  const profile = findEtfProfileByIsin(isin)
  if (!profile) throw new Error(`Missing bundled ETF profile for ${isin}`)
  const years = Object.keys(normalizedSeries).map(Number)

  return {
    id,
    label: `${profile.name} (${profile.ticker})`,
    description: `Statische annualisierte Kalenderjahresrenditen aus Yahoo Adjusted Close für die EUR-Xetra-Notierung ${profile.ticker}.`,
    role: 'equity',
    suitableFor: ['equity'],
    geography: 'Global',
    currency: 'EUR',
    returnBasis: 'nominal',
    returnType: 'adjustedMarketPrice',
    sourceKind: 'bundledEtf',
    costTreatment: 'netOfFundCosts',
    source: {
      kind: 'bundled',
      path: dataPath,
      sourceName: `Yahoo Finance adjusted close (${profile.ticker}, Xetra EUR)`,
      sourceUrl: `https://finance.yahoo.com/quote/${profile.ticker}/history/`,
      license: 'Static derived annual observations; Yahoo terms apply to source market data',
    },
    license: 'Static derived annual observations; Yahoo terms apply to source market data',
    licenseAllowsBundling: true,
    commercialUseAllowed: false,
    derivedData: true,
    sourceDatasetVersion: `Yahoo Finance ${profile.ticker} annual adjusted close through 2025`,
    sourceChecksum: checksum,
    transformDescription: 'Annual normalized return supplied from consecutive Yahoo adjusted close observations; no live fetch.',
    normalizedSeries,
    startYear: Math.min(...years),
    endYear: Math.max(...years),
    caveats: [
      'Static fallback data; the application performs no live Yahoo fetch.',
      'Yahoo adjusted market prices are not official fund NAV or an official fund total-return series.',
      `Observations use the EUR-denominated Xetra listing ${profile.ticker}; currency and market-price effects can differ from fund NAV.`,
      `The ETF TER (${(profile.ter * 100).toFixed(2)}%) is considered reflected in ETF price/NAV, so bucket annual costs are not deducted again.`,
    ],
    confidence: 'medium',
    transformVersion: 'bundled-etf-yahoo-adjusted-close-v1',
    checksum,
  }
}

export const BUNDLED_ETF_HISTORICAL_RETURN_SERIES: HistoricalReturnSeries[] = [
  createEtfSeries('etf-ie00b6r52259-iusq', 'IE00B6R52259', {
    2012: 0.030884, 2013: 0.174308, 2014: 0.190182, 2015: 0.083144,
    2016: 0.108846, 2017: 0.091401, 2018: -0.059713, 2019: 0.301449,
    2020: 0.049403, 2021: 0.291337, 2022: -0.135814, 2023: 0.185685,
    2024: 0.245261, 2025: 0.090164,
  }, 'sha256:4fb1dc1990984d3c11088ca00a92521b02c82d998a79a3de2d50ea25a9bc6df8'),
  createEtfSeries('etf-ie00b4l5yc18-eunm', 'IE00B4L5YC18', {
    2010: 0.2874, 2011: -0.166181, 2012: 0.144855, 2013: -0.080716,
    2014: 0.094922, 2015: -0.050715, 2016: 0.145662, 2017: 0.198884,
    2018: -0.108411, 2019: 0.209068, 2020: 0.068371, 2021: 0.046763,
    2022: -0.144748, 2023: 0.057103, 2024: 0.140888, 2025: 0.191798,
  }, 'sha256:8db101b120857ddc5195752a78f55791fc6f15ae13a797d670bc9d99f4a61bea'),
]
