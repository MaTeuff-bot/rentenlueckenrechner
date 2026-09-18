import { describe, expect, it } from 'vitest'
import {
  HISTORICAL_RETURN_SERIES,
  SYNTHETIC_RETURN_SERIES,
  findHistoricalReturnSeries,
  findSyntheticReturnSeries,
  isSyntheticReturnSeriesId,
} from './returnSeriesRegistry.js'

function linearHistorical(id: string) {
  return HISTORICAL_RETURN_SERIES.find((series) => series.id === id)
}

function linearSynthetic(id: string) {
  return SYNTHETIC_RETURN_SERIES.find((series) => series.id === id)
}

describe('registry hoisting parity', () => {
  it('returns byte-identical series for supported ids', () => {
    for (const series of HISTORICAL_RETURN_SERIES) {
      expect(findHistoricalReturnSeries(series.id)).toBe(linearHistorical(series.id))
      expect(findHistoricalReturnSeries(series.id)).toBe(series)
    }
    for (const series of SYNTHETIC_RETURN_SERIES) {
      expect(findSyntheticReturnSeries(series.id)).toBe(linearSynthetic(series.id))
      expect(findSyntheticReturnSeries(series.id)).toBe(series)
    }
  })
  it('returns identical undefined for unsupported ids', () => {
    for (const id of ['__unknown__', '', 'nope', 'HISTORICAL', 'synthetic']) {
      expect(findHistoricalReturnSeries(id)).toBeUndefined()
      expect(findSyntheticReturnSeries(id)).toBeUndefined()
      expect(linearHistorical(id)).toBeUndefined()
      expect(linearSynthetic(id)).toBeUndefined()
    }
    for (const series of SYNTHETIC_RETURN_SERIES) {
      expect(isSyntheticReturnSeriesId(series.id)).toBe(true)
    }
    for (const series of HISTORICAL_RETURN_SERIES) {
      expect(isSyntheticReturnSeriesId(series.id)).toBe(false)
    }
    expect(isSyntheticReturnSeriesId('__unknown__')).toBe(false)
  })
  it('memoized maps do not mutate shared series objects', () => {
    const before = JSON.stringify([...HISTORICAL_RETURN_SERIES, ...SYNTHETIC_RETURN_SERIES].map((s) => s.id))
    for (const series of HISTORICAL_RETURN_SERIES) findHistoricalReturnSeries(series.id)
    for (const series of SYNTHETIC_RETURN_SERIES) findSyntheticReturnSeries(series.id)
    const after = JSON.stringify([...HISTORICAL_RETURN_SERIES, ...SYNTHETIC_RETURN_SERIES].map((s) => s.id))
    expect(after).toBe(before)
  })
})
