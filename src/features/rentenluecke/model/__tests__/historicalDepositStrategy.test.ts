import { describe, expect, it } from 'vitest'
import {
  HISTORICAL_DEPOSIT_JANUARY_1975_ESTIMATE,
  HISTORICAL_DEPOSIT_RAW_ANNUAL_NOMINAL,
  HISTORICAL_DEPOSIT_SOURCE_METADATA,
} from '../returnData/historicalDepositData'
import {
  CASH_REAL_RATE_PROPOSAL,
  DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
  DEFAULT_HISTORICAL_RETURN_SERIES_IDS,
  FIXED_INFLATION_SOURCE_ID,
  HISTORICAL_DEPOSIT_STRATEGY_SOURCE_ID,
  HISTORICAL_RETURN_SERIES,
  REAL_ASSUMPTION_SOURCE_ID,
  PLANNING_RATE_SOURCE_ID,
  calculateExpectedAnnualReturnForSelection,
  createFixedInflationSource,
  findHistoricalReturnSeries,
  findInflationSeries,
  getValidHistoricalYears,
  simulateHistoricalBootstrapReferenceScenario,
} from '../historicalReturns'
import { sampleHistoricalYearsForPath } from '../historicalReturns/bootstrapSampling'
import {
  applyDepositZeroFloor,
  applySourceCostTreatment,
  realTargetToNominalWithFloor,
  resolveComponentNominalReturn,
} from '../historicalReturns/bootstrapSampling'
import { expectedBucketReturns } from '../capitalIncome/returns'
import { cashOnlyInput } from './insuranceFixtures'

const NOV_1974 = 0.055099999999999996
const FEB_1975 = 0.0519
const MONTHLY_1975_FEB_DEC = [
  0.0519, 0.050300000000000004, 0.0501, 0.0453, 0.0414, 0.04019999999999999,
  0.0401, 0.0401, 0.04, 0.04, 0.04,
]

function depositComponent(cost = 0) {
  return {
    id: 'bank',
    label: 'Bank',
    role: 'cash' as const,
    weight: 1,
    returnSeriesId: HISTORICAL_DEPOSIT_STRATEGY_SOURCE_ID,
    annualCostRate: cost,
  }
}

function realComponent(cost = 0) {
  return {
    id: 'bank',
    label: 'Bank',
    role: 'cash' as const,
    weight: 1,
    returnSeriesId: REAL_ASSUMPTION_SOURCE_ID,
    annualCostRate: cost,
  }
}

describe('historical deposit source generation', () => {
  it('covers full annual bank history 1968-2025 with 58 observations', () => {
    const years = Object.keys(HISTORICAL_DEPOSIT_RAW_ANNUAL_NOMINAL).map(Number).sort((a, b) => a - b)
    expect(years).toHaveLength(58)
    expect(years[0]).toBe(1968)
    expect(years.at(-1)).toBe(2025)
    expect(years.every((year) => Number.isFinite(HISTORICAL_DEPOSIT_RAW_ANNUAL_NOMINAL[year]))).toBe(true)
  })

  it('estimates January 1975 by 2/3 time-in-month interpolation, not the midpoint', () => {
    const expected = NOV_1974 + (FEB_1975 - NOV_1974) * (2 / 3)
    expect(HISTORICAL_DEPOSIT_JANUARY_1975_ESTIMATE).toBe(expected)
    expect(HISTORICAL_DEPOSIT_JANUARY_1975_ESTIMATE).not.toBe((NOV_1974 + FEB_1975) / 2)
    const annual1975 = (MONTHLY_1975_FEB_DEC.reduce((sum, value) => sum + value, 0) + expected) / 12
    expect(HISTORICAL_DEPOSIT_RAW_ANNUAL_NOMINAL[1975]).toBe(annual1975)
    expect(HISTORICAL_DEPOSIT_SOURCE_METADATA.january1975Estimated).toBe(true)
  })

  it('annualizes early quarterly representatives without overweighting extras', () => {
    expect(HISTORICAL_DEPOSIT_RAW_ANNUAL_NOMINAL[1968]).toBe(0.035)
    expect(HISTORICAL_DEPOSIT_RAW_ANNUAL_NOMINAL[1969]).toBeCloseTo(0.0375, 12)
    expect(HISTORICAL_DEPOSIT_RAW_ANNUAL_NOMINAL[1971]).toBeCloseTo((0.05 + 0.0453 + 0.0453 + 0.0452) / 4, 12)
    expect(HISTORICAL_DEPOSIT_RAW_ANNUAL_NOMINAL[1973]).toBeCloseTo((0.0451 + 0.0452 + 0.055099999999999996 + 0.055099999999999996) / 4, 12)
    expect(HISTORICAL_DEPOSIT_RAW_ANNUAL_NOMINAL[1974]).toBeCloseTo(0.0551, 12)
  })

  it('preserves the observed 2021 negative in the raw series', () => {
    expect(HISTORICAL_DEPOSIT_RAW_ANNUAL_NOMINAL[2021]).toBeLessThan(0)
    expect(findHistoricalReturnSeries(HISTORICAL_DEPOSIT_STRATEGY_SOURCE_ID)?.normalizedSeries[2021]).toBeLessThan(0)
  })

  it('floors negatives to zero while zero/positive pass through identically', () => {
    expect(applyDepositZeroFloor(HISTORICAL_DEPOSIT_RAW_ANNUAL_NOMINAL[2021])).toBe(0)
    expect(applyDepositZeroFloor(0)).toBe(0)
    expect(applyDepositZeroFloor(0.035)).toBe(0.035)
    expect(applyDepositZeroFloor(HISTORICAL_DEPOSIT_RAW_ANNUAL_NOMINAL[1968])).toBe(
      HISTORICAL_DEPOSIT_RAW_ANNUAL_NOMINAL[1968],
    )
  })

  it('describes the raw composite real mean 1968-2020 including interpolated 1975', () => {
    const inflation = findInflationSeries(DEFAULT_HISTORICAL_INFLATION_SERIES_ID)!
    const reals = Array.from({ length: 53 }, (_, index) => 1968 + index).map(
      (year) => (1 + HISTORICAL_DEPOSIT_RAW_ANNUAL_NOMINAL[year]) / (1 + inflation.annualInflation[year]) - 1,
    )
    const mean = reals.reduce((sum, value) => sum + value, 0) / reals.length
    expect(mean).toBeCloseTo(-0.0027631615093, 10)
    expect(CASH_REAL_RATE_PROPOSAL).toBeCloseTo(-0.0028, 4)
  })
})

describe('joint calendar-year sampling', () => {
  it('intersects the default JST/CPI history 1968-2020 including 1975 (53 years)', () => {
    const components = [
      { id: 'equity', label: 'Aktien', role: 'equity' as const, weight: 0.6, returnSeriesId: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.equity, annualCostRate: 0 },
      depositComponent(),
    ]
    components[1].weight = 0.4
    const inflation = findInflationSeries(DEFAULT_HISTORICAL_INFLATION_SERIES_ID)!
    const validYears = getValidHistoricalYears(components, inflation)
    expect(validYears).toHaveLength(53)
    expect(validYears[0]).toBe(1968)
    expect(validYears.at(-1)).toBe(2020)
    expect(validYears).toContain(1975)
  })

  it('pairs deposit, equity and inflation on the same seeded calendar year', () => {
    const components = [
      { id: 'equity', label: 'Aktien', role: 'equity' as const, weight: 0.6, returnSeriesId: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.equity, annualCostRate: 0 },
      { ...depositComponent(), weight: 0.4 },
    ]
    const inflation = findInflationSeries(DEFAULT_HISTORICAL_INFLATION_SERIES_ID)!
    const validYears = getValidHistoricalYears(components, inflation)
    const first = sampleHistoricalYearsForPath(components, inflation, validYears, 5, 42)
    const second = sampleHistoricalYearsForPath(components, inflation, validYears, 5, 42)
    expect(first).toEqual(second)
    expect(first.every((year) => validYears.includes(year))).toBe(true)
    const rng = () => 0.5
    for (const year of first) {
      const yearInflation = inflation.annualInflation[year]
      const bankNominal = resolveComponentNominalReturn(depositComponent(), year, yearInflation, rng)
      expect(bankNominal).toBe(Math.max(0, HISTORICAL_DEPOSIT_RAW_ANNUAL_NOMINAL[year]))
      const equitySeries = findHistoricalReturnSeries(DEFAULT_HISTORICAL_RETURN_SERIES_IDS.equity)!
      const equityNominal = resolveComponentNominalReturn(
        components[0], year, yearInflation, rng,
      )
      expect(equityNominal).toBeCloseTo(
        (1 + equitySeries.normalizedSeries[year]) * (1 + yearInflation) - 1, 12,
      )
    }
  })

  it('supports fixed inflation with the nominal historical bank series without re-nominalization', () => {
    const components = [
      { id: 'equity', label: 'Aktien', role: 'equity' as const, weight: 0.5, returnSeriesId: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.equity, annualCostRate: 0 },
      { ...depositComponent(), weight: 0.5 },
    ]
    const lowFixed = createFixedInflationSource(0.01)
    const highFixed = createFixedInflationSource(0.05)
    expect(getValidHistoricalYears(components, lowFixed)).toHaveLength(53)
    expect(getValidHistoricalYears(components, highFixed)).toHaveLength(53)
    const rng = () => 0.5
    for (const year of [1968, 1975, 2003, 2020]) {
      const lowNominal = resolveComponentNominalReturn(depositComponent(), year, 0.01, rng)
      const highNominal = resolveComponentNominalReturn(depositComponent(), year, 0.05, rng)
      expect(lowNominal).toBe(highNominal)
      expect(lowNominal).toBe(Math.max(0, HISTORICAL_DEPOSIT_RAW_ANNUAL_NOMINAL[year]))
    }
  })

  it('leaves fund-only sampling untouched', () => {
    const components = [
      { id: 'fund', label: 'Fonds', role: 'equity' as const, weight: 1, returnSeriesId: 'synthetic-equity-assumption-v1', annualCostRate: 0 },
    ]
    const fixed = createFixedInflationSource(0.02)
    expect(getValidHistoricalYears(components, fixed)).toEqual([])
    expect(sampleHistoricalYearsForPath(components, fixed, [], 4, 7)).toEqual([0, 1, 2, 3])
  })
})

describe('real-rate target with nominal floor', () => {
  it('applies (1+real)*(1+inflation)-1 then max(0, nominal)', () => {
    expect(realTargetToNominalWithFloor(0.02, 0.03)).toBeCloseTo(1.02 * 1.03 - 1, 12)
    expect(realTargetToNominalWithFloor(CASH_REAL_RATE_PROPOSAL, 0.02)).toBeCloseTo(
      (1 + CASH_REAL_RATE_PROPOSAL) * 1.02 - 1, 12,
    )
    expect(realTargetToNominalWithFloor(-0.0028, -0.5)).toBe(0)
    expect(realTargetToNominalWithFloor(-0.5, 0.01)).toBe(0)
    const rng = () => 0.5
    expect(resolveComponentNominalReturn(realComponent(), 2000, 0.02, rng, undefined, 0.01)).toBeCloseTo(
      1.01 * 1.02 - 1, 12,
    )
    expect(resolveComponentNominalReturn(realComponent(), 2000, -0.5, rng, undefined, -0.0028)).toBe(0)
  })

  it('keeps bucket costs separate so the floor never hides negative net', () => {
    expect(applySourceCostTreatment(0, HISTORICAL_DEPOSIT_STRATEGY_SOURCE_ID, 0.01)).toBeCloseTo(-0.01, 12)
    expect(applySourceCostTreatment(0, REAL_ASSUMPTION_SOURCE_ID, 0.01)).toBeCloseTo(-0.01, 12)
    expect(applySourceCostTreatment(0.02, PLANNING_RATE_SOURCE_ID, 0)).toBe(0.02)
  })

  it('rejects missing or out-of-range real targets instead of falling back', () => {
    const rng = () => 0.5
    expect(() => resolveComponentNominalReturn(realComponent(), 2000, 0.02, rng)).toThrow(/Realzins-Annahme/)
    expect(() => resolveComponentNominalReturn(realComponent(), 2000, 0.02, rng, undefined, -1)).toThrow(/Realzins-Annahme/)
    expect(() => resolveComponentNominalReturn(realComponent(), 2000, 0.02, rng, undefined, Number.NaN)).toThrow(/Realzins-Annahme/)
  })
})

describe('deterministic reference and required capital', () => {
  function depositInput() {
    const bucketValue = 10000
    return cashOnlyInput({
      currentCapital: bucketValue,
      estimatorPortfolio: [
        { id: 'bank', name: 'Bank', value: bucketValue, holding: 'ordinary-bank-deposit' as const, returnSeriesId: HISTORICAL_DEPOSIT_STRATEGY_SOURCE_ID },
      ],
    })
  }

  it('averages floored nominals over the joint window for the deterministic reference', () => {
    const input = depositInput()
    const settings = {
      portfolioComponents: [{ ...depositComponent(), weight: 1 }],
      inflationSourceId: DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
      simulations: 10,
    }
    const expected = calculateExpectedAnnualReturnForSelection(input, settings)
    const inflation = findInflationSeries(DEFAULT_HISTORICAL_INFLATION_SERIES_ID)!
    const manual =
      Array.from({ length: 53 }, (_, index) => 1968 + index).reduce(
        (sum, year) => sum + Math.max(0, HISTORICAL_DEPOSIT_RAW_ANNUAL_NOMINAL[year]), 0,
      ) / 53
    expect(inflation.annualInflation[1975]).toBeDefined()
    expect(expected).toBeCloseTo(manual, 12)
  })

  it('keeps the reference deterministic and distinct from a silent constant fallback', () => {
    const input = depositInput()
    const settings = {
      portfolioComponents: [{ ...depositComponent(), weight: 1 }],
      inflationSourceId: DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
      simulations: 10,
    }
    const first = simulateHistoricalBootstrapReferenceScenario(input, settings)
    const second = simulateHistoricalBootstrapReferenceScenario(input, settings)
    expect(first.rows.map((row) => row.closingCapitalToday)).toEqual(
      second.rows.map((row) => row.closingCapitalToday),
    )
    expect(first.metadata.validYears).toHaveLength(53)
    const constantSettings = {
      portfolioComponents: [
        { id: 'bank', label: 'Bank', role: 'cash' as const, weight: 1, returnSeriesId: PLANNING_RATE_SOURCE_ID, annualCostRate: 0 },
      ],
      inflationSourceId: DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
      simulations: 10,
      cashPlanningRate: 0.02,
    }
    const constant = simulateHistoricalBootstrapReferenceScenario(input, constantSettings)
    expect(first.rows[0].closingCapitalToday).not.toBe(constant.rows[0].closingCapitalToday)
    expect(Number.isFinite(first.summary.projectedCapitalAtRetirement)).toBe(true)
  })

  it('credits gross bank interest once and taxes it through the existing ledger', () => {
    const input = depositInput()
    const settings = {
      portfolioComponents: [{ ...depositComponent(), weight: 1 }],
      inflationSourceId: FIXED_INFLATION_SOURCE_ID,
      simulations: 1,
    }
    const fixedInput = { ...input, annualInflationRate: 0.02 }
    const buckets = expectedBucketReturns(fixedInput, settings)
    const flooredMean =
      Object.values(HISTORICAL_DEPOSIT_RAW_ANNUAL_NOMINAL).reduce((sum, value) => sum + Math.max(0, value), 0) / 58
    expect(buckets[0].grossBankReturnRate).toBeCloseTo(flooredMean, 12)
    expect(buckets[0].totalReturnRate).toBeCloseTo(flooredMean, 12)
    const result = simulateHistoricalBootstrapReferenceScenario(fixedInput, settings)
    expect(result.rows.length).toBeGreaterThan(0)
    expect(result.rows.every((row) => Number.isFinite(row.closingCapital))).toBe(true)
  })
})

describe('deposit registry', () => {
  it('registers the German deposit proxy as a cash-category historical nominal series', () => {
    const series = findHistoricalReturnSeries(HISTORICAL_DEPOSIT_STRATEGY_SOURCE_ID)
    expect(series).toBeDefined()
    expect(series!.role).toBe('cash')
    expect(series!.returnBasis).toBe('nominal')
    expect(series!.startYear).toBe(1968)
    expect(series!.endYear).toBe(2025)
    expect(HISTORICAL_RETURN_SERIES.map((entry) => entry.id)).toContain(HISTORICAL_DEPOSIT_STRATEGY_SOURCE_ID)
  })
})
