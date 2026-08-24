import { describe, expect, it } from 'vitest'
import {
  BUNDLED_ETF_PROFILES,
  findEtfProfileByIsin,
  findEtfProfileByTicker,
  findEtfProfileByWkn,
  getBundledEtfProfiles,
} from '../etfProfiles'

describe('bundled ETF profile registry', () => {
  it('contains exactly the two metadata-only profiles', () => {
    expect(getBundledEtfProfiles()).toBe(BUNDLED_ETF_PROFILES)
    expect(BUNDLED_ETF_PROFILES).toHaveLength(2)
    expect(BUNDLED_ETF_PROFILES.map(({ isin }) => isin)).toEqual(['IE00B6R52259', 'IE00B4L5YC18'])
    expect(BUNDLED_ETF_PROFILES.map(({ ter }) => ter)).toEqual([0.002, 0.0018])
    expect(BUNDLED_ETF_PROFILES.every(({ sources }) =>
      sources[0].name === 'iShares' && sources[0].role === 'primary'
      && sources[1].name === 'justETF' && sources[1].role === 'cross-check',
    )).toBe(true)
  })

  it('finds profiles by ISIN, WKN, and exchange ticker', () => {
    expect(findEtfProfileByIsin('IE00B6R52259')?.wkn).toBe('A1JMDF')
    expect(findEtfProfileByWkn('A0RPWJ')?.ticker).toBe('EUNM.DE')
    expect(findEtfProfileByTicker('IUSQ.DE')?.name).toBe('iShares MSCI ACWI UCITS ETF USD (Acc)')
    expect(findEtfProfileByIsin('unknown')).toBeUndefined()
  })
})
