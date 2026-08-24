export type EtfDistributionPolicy = 'accumulating' | 'distributing'
export type EtfAssetClass = 'equity' | 'bond' | 'cash' | 'other'
export type EtfProfileSource = {
  name: 'iShares' | 'justETF'
  role: 'primary' | 'cross-check'
  url: string
}

/** Reference metadata only. ETF profiles are deliberately not return series or portfolio buckets. */
export type EtfProfile = {
  isin: string
  wkn: string
  name: string
  issuer: string
  ticker: string
  exchange: string
  listingCurrency: string
  fundCurrency: string
  ter: number
  distributionPolicy: EtfDistributionPolicy
  domicile: string
  assetClass: EtfAssetClass
  sources: readonly EtfProfileSource[]
}

export const BUNDLED_ETF_PROFILES = [
  {
    isin: 'IE00B6R52259',
    wkn: 'A1JMDF',
    name: 'iShares MSCI ACWI UCITS ETF USD (Acc)',
    issuer: 'iShares',
    ticker: 'IUSQ.DE',
    exchange: 'XETRA',
    listingCurrency: 'EUR',
    fundCurrency: 'USD',
    ter: 0.002,
    distributionPolicy: 'accumulating',
    domicile: 'Ireland',
    assetClass: 'equity',
    sources: [
      {
        name: 'iShares',
        role: 'primary',
        url: 'https://www.ishares.com/de/privatanleger/de/produkte/251850/ishares-msci-acwi-ucits-etf',
      },
      {
        name: 'justETF',
        role: 'cross-check',
        url: 'https://www.justetf.com/en/etf-profile.html?isin=IE00B6R52259',
      },
    ],
  },
  {
    isin: 'IE00B4L5YC18',
    wkn: 'A0RPWJ',
    name: 'iShares MSCI EM UCITS ETF USD (Acc)',
    issuer: 'iShares',
    ticker: 'EUNM.DE',
    exchange: 'XETRA',
    listingCurrency: 'EUR',
    fundCurrency: 'USD',
    ter: 0.0018,
    distributionPolicy: 'accumulating',
    domicile: 'Ireland',
    assetClass: 'equity',
    sources: [
      {
        name: 'iShares',
        role: 'primary',
        url: 'https://www.ishares.com/de/privatanleger/de/produkte/251858/ishares-msci-emerging-markets-ucits-etf-acc-fund',
      },
      {
        name: 'justETF',
        role: 'cross-check',
        url: 'https://www.justetf.com/en/etf-profile.html?isin=IE00B4L5YC18',
      },
    ],
  },
] as const satisfies readonly EtfProfile[]

export function getBundledEtfProfiles(): readonly EtfProfile[] {
  return BUNDLED_ETF_PROFILES
}

export function findEtfProfileByIsin(isin: string): EtfProfile | undefined {
  return BUNDLED_ETF_PROFILES.find((profile) => profile.isin === isin)
}

export function findEtfProfileByWkn(wkn: string): EtfProfile | undefined {
  return BUNDLED_ETF_PROFILES.find((profile) => profile.wkn === wkn)
}

export function findEtfProfileByTicker(ticker: string): EtfProfile | undefined {
  return BUNDLED_ETF_PROFILES.find((profile) => profile.ticker === ticker)
}
