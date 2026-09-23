import { describe, expect, it } from 'vitest'
import { portfolioEstimatorReadiness } from '../capitalIncome/portfolioEstimator'
import { SYNTHETIC_RETURN_SERIES_IDS } from '../historicalReturns/constants'

const bankCash = { id: 'bank', value: 50000, holding: 'ordinary-bank-deposit', returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.cash } as never
const bankEquityProxy = { id: 'bank', value: 50000, holding: 'ordinary-bank-deposit', returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.equity } as never

const completeSettings = { fundAcquisitionCost: 80000, projectedBasisRate: 0.032, scopeConfirmed: true, lossScopeConfirmed: true }

describe('portfolioEstimatorReadiness (insurance-independent)', () => {
  it('reports ready only with classification, cost, scopes and valid basis rate', () => {
    const buckets = [{ id: 'fund', value: 100000, holding: 'accumulating-equity-fund', returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.equity }] as never
    expect(portfolioEstimatorReadiness(completeSettings, buckets, 100000).ready).toBe(true)
    expect(portfolioEstimatorReadiness(undefined, buckets, 100000).ready).toBe(false)
  })
  it('requires classification and rejects unsupported holdings without insurance', () => {
    const missing = [{ id: 'a', value: 1000, returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.equity }] as never
    expect(portfolioEstimatorReadiness(completeSettings, missing, 1000).issues.join(' ')).toContain('klassifizieren')
    const unsupported = [{ id: 'a', value: 1000, holding: 'unsupported', returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.equity }] as never
    const issues = portfolioEstimatorReadiness(completeSettings, unsupported, 1000).issues
    expect(issues.join(' ')).toContain('entfernen/ersetzen')
    expect(portfolioEstimatorReadiness(completeSettings, unsupported, 1000).ready).toBe(false)
  })
  it('distinguishes missing, zero and invalid fund acquisition cost', () => {
    const buckets = [{ id: 'fund', value: 1000, holding: 'accumulating-equity-fund', returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.equity }] as never
    expect(portfolioEstimatorReadiness({ ...completeSettings, fundAcquisitionCost: undefined }, buckets, 1000).issues.join(' ')).toContain('Anschaffungskosten')
    expect(portfolioEstimatorReadiness({ ...completeSettings, fundAcquisitionCost: 0 }, buckets, 1000).ready).toBe(true)
    expect(portfolioEstimatorReadiness({ ...completeSettings, fundAcquisitionCost: NaN }, buckets, 1000).ready).toBe(false)
    expect(portfolioEstimatorReadiness({ ...completeSettings, fundAcquisitionCost: -1 }, buckets, 1000).issues.join(' ')).toContain('Anschaffungskosten')
  })
  it('requires a gross cash proxy for bank deposits (bank proxy)', () => {
    const good = [bankCash] as unknown as Parameters<typeof portfolioEstimatorReadiness>[1]
    expect(portfolioEstimatorReadiness({ projectedBasisRate: 0.032, scopeConfirmed: true, lossScopeConfirmed: true }, good, 50000).ready).toBe(true)
    const bad = [bankEquityProxy] as unknown as Parameters<typeof portfolioEstimatorReadiness>[1]
    const issues = portfolioEstimatorReadiness({ projectedBasisRate: 0.032, scopeConfirmed: true, lossScopeConfirmed: true }, bad, 50000).issues
    expect(issues.join(' ')).toContain('Bankeinlagen')
  })
  it('requires scope confirmations and a valid projected basis rate', () => {
    const buckets = [{ id: 'fund', value: 1000, holding: 'accumulating-equity-fund', returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.equity }] as never
    expect(portfolioEstimatorReadiness({ ...completeSettings, scopeConfirmed: undefined }, buckets, 1000).issues.join(' ')).toContain('Anlageumfang')
    expect(portfolioEstimatorReadiness({ ...completeSettings, lossScopeConfirmed: false }, buckets, 1000).issues.join(' ')).toContain('Kapitalverluste')
    expect(portfolioEstimatorReadiness({ ...completeSettings, projectedBasisRate: NaN }, buckets, 1000).issues.join(' ')).toContain('Basiszins')
    expect(portfolioEstimatorReadiness({ ...completeSettings, projectedBasisRate: 2 }, buckets, 1000).ready).toBe(false)
  })
  it('does not require fund cost when no fund is held', () => {
    const buckets = [bankCash] as unknown as Parameters<typeof portfolioEstimatorReadiness>[1]
    const settings = { projectedBasisRate: 0.032, scopeConfirmed: true, lossScopeConfirmed: true }
    expect(portfolioEstimatorReadiness(settings, buckets, 50000).ready).toBe(true)
  })
})
