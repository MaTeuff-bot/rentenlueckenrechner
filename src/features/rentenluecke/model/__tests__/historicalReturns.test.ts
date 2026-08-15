import { describe, expect, it } from 'vitest'
import { DEFAULT_INPUT } from '../defaults'
import {
  DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
  DEFAULT_HISTORICAL_RETURN_SERIES_IDS,
  HISTORICAL_INFLATION_SERIES,
  HISTORICAL_MINIMUM_OBSERVATIONS,
  HISTORICAL_RETURN_SERIES,
  createHistoricalBootstrapSeed,
  findInflationSeries,
  findHistoricalReturnSeries,
  generateHistoricalReturnPath,
  getHistoricalDatasetVersion,
  getValidHistoricalYears,
  sampleHistoricalYearsWithReplacement,
  simulateHistoricalBootstrapScenario,
  runHistoricalBootstrapSimulation,
  type InflationSeries,
} from '../historicalReturns'
import { simulateScenario } from '../simulateScenario'
import { createPortfolioComponents } from '../stochasticReturns'

const inflation: InflationSeries = {
  id: 'test-inflation',
  label: 'Test inflation',
  description: 'Test inflation',
  geography: 'DE',
  currency: 'EUR',
  annualInflation: { 2000: 0.02, 2001: 0.03, 2002: 0.04 },
  source: {
    kind: 'bundled',
    path: 'test',
    sourceName: 'test',
    license: 'test',
  },
  license: 'test',
  licenseAllowsBundling: true,
  commercialUseAllowed: true,
  derivedData: false,
  sourceDatasetVersion: 'test',
  sourceChecksum: 'test',
  transformDescription: 'test',
  startYear: 2000,
  endYear: 2002,
  caveats: [],
  confidence: 'low',
  transformVersion: 'test',
}

describe('historical returns', () => {
  it('uses production datasets as defaults without fixture or provisional IDs', () => {
    const defaultIds = [
      DEFAULT_HISTORICAL_RETURN_SERIES_IDS.equity,
      DEFAULT_HISTORICAL_RETURN_SERIES_IDS.bond,
      DEFAULT_HISTORICAL_RETURN_SERIES_IDS.cash,
      DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
    ]

    expect(defaultIds.every((id) => !/fixture|provisional/i.test(id))).toBe(true)
    expect(defaultIds).toEqual([
      'jst-r6-developed-equal-weight-equity-real-post1950',
      'jst-r6-developed-equal-weight-bonds-real-post1950',
      'jst-r6-developed-equal-weight-bills-real-post1950',
      'bundesbank-destatis-germany-cpi-yoy-annual-mean-post1950',
    ])
  })

  it('has 1950-2020 synchronized default valid years with 71 observations', () => {
    const components = createPortfolioComponents(
      { equity: 0.7, bonds: 0.2, fixed: 0.1 },
      DEFAULT_HISTORICAL_RETURN_SERIES_IDS,
    )
    const defaultInflation = findInflationSeries(DEFAULT_HISTORICAL_INFLATION_SERIES_ID)!
    const validYears = getValidHistoricalYears(components, defaultInflation)

    expect(validYears).toHaveLength(71)
    expect(validYears[0]).toBe(1950)
    expect(validYears.at(-1)).toBe(2020)
    expect(validYears.length).toBeGreaterThan(HISTORICAL_MINIMUM_OBSERVATIONS)
  })

  it('includes complete production metadata and marks JST as non-commercial', () => {
    const defaultReturnSeries = [
      findHistoricalReturnSeries(DEFAULT_HISTORICAL_RETURN_SERIES_IDS.equity),
      findHistoricalReturnSeries(DEFAULT_HISTORICAL_RETURN_SERIES_IDS.bond),
      findHistoricalReturnSeries(DEFAULT_HISTORICAL_RETURN_SERIES_IDS.cash),
    ]
    const defaultInflation = findInflationSeries(DEFAULT_HISTORICAL_INFLATION_SERIES_ID)

    for (const series of defaultReturnSeries) {
      expect(series).toBeDefined()
      expect(series?.commercialUseAllowed).toBe(false)
      expect(series?.derivedData).toBe(true)
      expect(series?.sourceDatasetVersion).toContain('JST')
      expect(series?.sourceChecksum).toMatch(/^sha256:/)
      expect(series?.checksum).toMatch(/^sha256:/)
      expect(series?.transformDescription).toContain('realReturn')
      expect(series?.countryCoverage?.minCountriesPerYear).toBe(15)
      expect(series?.countryCoverage?.maxCountriesPerYear).toBe(16)
    }

    expect(defaultInflation?.commercialUseAllowed).toBe(true)
    expect(defaultInflation?.derivedData).toBe(true)
    expect(defaultInflation?.sourceDatasetVersion).toBe('BBDP1.M.DE.N.VPI.C.A00000.VGJ.LV')
    expect(defaultInflation?.sourceChecksum).toMatch(/^sha256:/)
    expect(defaultInflation?.checksum).toMatch(/^sha256:/)
  })

  it('computes valid years from observed intersections and ignores manual series coverage', () => {
    const components = createPortfolioComponents(
      { equity: 0.5, bonds: 0.3, fixed: 0.2 },
      {
        equity: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.equity,
        bond: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.bond,
        cash: 'manual-fixed-real',
      },
    )
    const fixtureInflation = findInflationSeries(DEFAULT_HISTORICAL_INFLATION_SERIES_ID)

    expect(fixtureInflation).toBeDefined()
    expect(getValidHistoricalYears(components, fixtureInflation!)).toEqual(Array.from({ length: 71 }, (_, index) => 1950 + index))
  })

  it('samples years with replacement using a deterministic seed', () => {
    const years = [2000, 2001]
    const sampledYears = sampleHistoricalYearsWithReplacement(years, 20, 123)

    expect(sampledYears).toEqual(sampleHistoricalYearsWithReplacement(years, 20, 123))
    expect(sampledYears).toContain(2000)
    expect(sampledYears).toContain(2001)
    expect(new Set(sampledYears).size).toBeLessThan(sampledYears.length)
  })

  it('uses the same sampled year across all assets and inflation', () => {
    const components = createPortfolioComponents(
      { equity: 0.5, bonds: 0.25, fixed: 0.25 },
      {
        equity: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.equity,
        bond: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.bond,
        cash: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.cash,
      },
    )
    const defaultInflation = findInflationSeries(DEFAULT_HISTORICAL_INFLATION_SERIES_ID)!
    const [pathReturn] = generateHistoricalReturnPath(components, defaultInflation, [2020], 0)

    const inflation2020 = defaultInflation.annualInflation[2020]
    const equityNominal = (1 + findHistoricalReturnSeries(DEFAULT_HISTORICAL_RETURN_SERIES_IDS.equity)!.normalizedSeries[2020]) * (1 + inflation2020) - 1
    const bondNominal = (1 + findHistoricalReturnSeries(DEFAULT_HISTORICAL_RETURN_SERIES_IDS.bond)!.normalizedSeries[2020]) * (1 + inflation2020) - 1
    const cashNominal = (1 + findHistoricalReturnSeries(DEFAULT_HISTORICAL_RETURN_SERIES_IDS.cash)!.normalizedSeries[2020]) * (1 + inflation2020) - 1

    expect(pathReturn).toBeCloseTo(0.5 * equityNominal + 0.25 * bondNominal + 0.25 * cashNominal)
  })

  it('includes dataset versions in deterministic seeds', () => {
    const defaultSettings = {
      portfolioComponents: createPortfolioComponents(
        { equity: 0.7, bonds: 0.2, fixed: 0.1 },
        DEFAULT_HISTORICAL_RETURN_SERIES_IDS,
      ),
      inflationSeriesId: DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
      manualCashRealReturn: 0,
      simulations: 25,
    }
    const provisionalEquityId = HISTORICAL_RETURN_SERIES.find((series) => series.role === 'equity' && series.id.includes('fixture'))!.id
    const alternateSettings = {
      ...defaultSettings,
      portfolioComponents: createPortfolioComponents(
        { equity: 0.7, bonds: 0.2, fixed: 0.1 },
        { ...DEFAULT_HISTORICAL_RETURN_SERIES_IDS, equity: provisionalEquityId },
      ),
    }

    expect(getHistoricalDatasetVersion(DEFAULT_HISTORICAL_RETURN_SERIES_IDS.equity)).toContain('sha256:')
    expect(createHistoricalBootstrapSeed(DEFAULT_INPUT, defaultSettings)).not.toBe(
      createHistoricalBootstrapSeed(DEFAULT_INPUT, alternateSettings),
    )
  })

  it('produces stable sampled scenarios and bootstrap summaries for identical inputs', () => {
    const settings = {
      portfolioComponents: createPortfolioComponents(
        { equity: 0.7, bonds: 0.2, fixed: 0.1 },
        {
          equity: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.equity,
          bond: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.bond,
          cash: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.cash,
        },
      ),
      inflationSeriesId: DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
      manualCashRealReturn: 0,
      simulations: 25,
    }

    expect(simulateHistoricalBootstrapScenario(DEFAULT_INPUT, settings)).toEqual(
      simulateHistoricalBootstrapScenario(DEFAULT_INPUT, settings),
    )
    expect(runHistoricalBootstrapSimulation(DEFAULT_INPUT, settings)).toEqual(
      runHistoricalBootstrapSimulation(DEFAULT_INPUT, settings),
    )
  })

  it('uses the fixed-return plan as historical bootstrap reference capital', () => {
    const settings = {
      portfolioComponents: createPortfolioComponents(
        { equity: 0.7, bonds: 0.2, fixed: 0.1 },
        {
          equity: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.equity,
          bond: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.bond,
          cash: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.cash,
        },
      ),
      inflationSeriesId: DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
      manualCashRealReturn: 0,
      simulations: 25,
    }

    const fixedPlan = simulateScenario(DEFAULT_INPUT)
    const sampledPath = simulateHistoricalBootstrapScenario(DEFAULT_INPUT, settings)
    const bootstrapSummary = runHistoricalBootstrapSimulation(DEFAULT_INPUT, settings)

    expect(bootstrapSummary.rows.map((row) => row.planCapitalToday)).toEqual(
      fixedPlan.rows.map((row) => row.closingCapitalToday),
    )
    expect(bootstrapSummary.rows.map((row) => row.planCapitalToday)).not.toEqual(
      sampledPath.rows.map((row) => row.closingCapitalToday),
    )
  })

  it('lets manual fixed-real Cash avoid restricting valid years and converts it with sampled inflation', () => {
    const components = createPortfolioComponents(
      { equity: 0, bonds: 0, fixed: 1 },
      {
        equity: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.equity,
        bond: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.bond,
        cash: 'manual-fixed-real',
      },
    )

    expect(generateHistoricalReturnPath(components, inflation, [2001], 0.01)).toEqual([0.0403])
  })

  it('keeps production series registered before provisional options', () => {
    expect(HISTORICAL_RETURN_SERIES[0]?.id).toBe(DEFAULT_HISTORICAL_RETURN_SERIES_IDS.equity)
    expect(HISTORICAL_INFLATION_SERIES[0]?.id).toBe(DEFAULT_HISTORICAL_INFLATION_SERIES_ID)
  })
})
