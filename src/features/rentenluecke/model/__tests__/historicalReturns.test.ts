import { describe, expect, it } from 'vitest'
import { DEFAULT_INPUT } from '../defaults'
import {
  DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
  DEFAULT_HISTORICAL_RETURN_SERIES_IDS,
  FIXED_INFLATION_SOURCE_ID,
  HISTORICAL_INFLATION_SERIES,
  HISTORICAL_MINIMUM_OBSERVATIONS,
  HISTORICAL_RETURN_SERIES,
  SYNTHETIC_RETURN_SERIES_IDS,
  calculateExpectedAnnualReturnForSelection,
  createHistoricalBootstrapSeed,
  createFixedInflationSource,
  findInflationSeries,
  findHistoricalReturnSeries,
  generateHistoricalReturnPath,
  getHistoricalDatasetVersion,
  getReturnSeriesOptionsForRole,
  getValidHistoricalYears,
  sampleHistoricalYearsWithReplacement,
  simulateHistoricalBootstrapScenario,
  runHistoricalBootstrapSimulation,
  simulateHistoricalBootstrapReferenceScenario,
  type InflationSeries,
} from '../historicalReturns'
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

  it('does not expose provisional fixture datasets in runtime options', () => {
    const runtimeIdsAndLabels = [
      ...HISTORICAL_RETURN_SERIES.flatMap((series) => [series.id, series.label]),
      ...HISTORICAL_INFLATION_SERIES.flatMap((series) => [series.id, series.label]),
      ...getReturnSeriesOptionsForRole('equity', 0).flatMap((series) => [series.id, series.label]),
      ...getReturnSeriesOptionsForRole('bond', 0).flatMap((series) => [series.id, series.label]),
      ...getReturnSeriesOptionsForRole('cash', 0).flatMap((series) => [series.id, series.label]),
    ]

    expect(runtimeIdsAndLabels.every((value) => !/fixture|provisional|provisorisch/i.test(value))).toBe(true)
    expect(getReturnSeriesOptionsForRole('cash', 0).map((series) => series.id)).toContain('manual-fixed-real')
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
    const defaultInflation = findInflationSeries(DEFAULT_HISTORICAL_INFLATION_SERIES_ID)

    expect(defaultInflation).toBeDefined()
    expect(getValidHistoricalYears(components, defaultInflation!)).toEqual(Array.from({ length: 71 }, (_, index) => 1950 + index))
  })

  it('does not let synthetic source selections restrict valid historical years', () => {
    const allHistoricalComponents = createPortfolioComponents(
      { equity: 0.5, bonds: 0.3, fixed: 0.2 },
      {
        equity: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.equity,
        bond: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.bond,
        cash: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.cash,
      },
    )
    const mixedComponents = createPortfolioComponents(
      { equity: 0.5, bonds: 0.3, fixed: 0.2 },
      {
        equity: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.equity,
        bond: SYNTHETIC_RETURN_SERIES_IDS.bond,
        cash: SYNTHETIC_RETURN_SERIES_IDS.cash,
      },
    )
    const equityOnlyValidYears = getValidHistoricalYears(
      createPortfolioComponents(
        { equity: 1, bonds: 0, fixed: 0 },
        {
          equity: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.equity,
          bond: SYNTHETIC_RETURN_SERIES_IDS.bond,
          cash: SYNTHETIC_RETURN_SERIES_IDS.cash,
        },
      ),
      inflation,
    )
    const defaultInflation = findInflationSeries(DEFAULT_HISTORICAL_INFLATION_SERIES_ID)!

    expect(getValidHistoricalYears(mixedComponents, defaultInflation)).toEqual(
      getValidHistoricalYears(allHistoricalComponents, defaultInflation),
    )
    expect(equityOnlyValidYears).toEqual([2000, 2001, 2002])
  })

  it('does not let fixed inflation constrain valid years beyond historical return sources', () => {
    const fixedInflation = createFixedInflationSource(0.02)
    const historicalComponents = createPortfolioComponents(
      { equity: 1, bonds: 0, fixed: 0 },
      {
        equity: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.equity,
        bond: SYNTHETIC_RETURN_SERIES_IDS.bond,
        cash: SYNTHETIC_RETURN_SERIES_IDS.cash,
      },
    )
    const syntheticComponents = createPortfolioComponents(
      { equity: 1, bonds: 0, fixed: 0 },
      {
        equity: SYNTHETIC_RETURN_SERIES_IDS.equity,
        bond: SYNTHETIC_RETURN_SERIES_IDS.bond,
        cash: SYNTHETIC_RETURN_SERIES_IDS.cash,
      },
    )

    expect(getValidHistoricalYears(historicalComponents, inflation)).toEqual([2000, 2001, 2002])
    expect(getValidHistoricalYears(historicalComponents, fixedInflation)).toEqual(
      Array.from({ length: 71 }, (_, index) => 1950 + index),
    )
    expect(getValidHistoricalYears(syntheticComponents, fixedInflation)).toEqual([])
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

  it('uses fixed inflation for real-to-nominal conversion when manual inflation is selected', () => {
    const components = createPortfolioComponents(
      { equity: 1, bonds: 0, fixed: 0 },
      {
        equity: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.equity,
        bond: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.bond,
        cash: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.cash,
      },
    )
    const fixedInflation = createFixedInflationSource(0.1)
    const [pathReturn] = generateHistoricalReturnPath(components, fixedInflation, [2020], 0)
    const equityReal = findHistoricalReturnSeries(DEFAULT_HISTORICAL_RETURN_SERIES_IDS.equity)!.normalizedSeries[2020]

    expect(pathReturn).toBeCloseTo((1 + equityReal) * 1.1 - 1)
  })

  it('uses historical CPI for ledger inflation when historical inflation is selected', () => {
    const input = {
      ...DEFAULT_INPUT,
      currentAge: 40,
      retirementAge: 41,
      planningAge: 42,
      monthlyContributionToday: 100,
      annualInflationRate: 0,
    }
    const settings = {
      portfolioComponents: createPortfolioComponents(
        { equity: 0, bonds: 0, fixed: 1 },
        {
          equity: SYNTHETIC_RETURN_SERIES_IDS.equity,
          bond: SYNTHETIC_RETURN_SERIES_IDS.bond,
          cash: 'manual-fixed-real',
        },
      ),
      inflationSourceId: DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
      manualCashRealReturn: 0,
      simulations: 1,
    }
    const result = simulateHistoricalBootstrapReferenceScenario(input, settings)
    const sampledFirstYear = result.metadata.sampledYears[0]
    const selectedInflation = findInflationSeries(DEFAULT_HISTORICAL_INFLATION_SERIES_ID)!.annualInflation[sampledFirstYear]

    expect(result.rows[1].inflationFactor).toBeCloseTo(1 + selectedInflation)
    expect(result.rows[0].inflationFactor).toBe(1)
    expect(result.rows[1].inflationFactor).not.toBe(1)
  })

  it('uses manual fixed inflation for every ledger year when fixed inflation is selected', () => {
    const input = {
      ...DEFAULT_INPUT,
      currentAge: 40,
      retirementAge: 42,
      planningAge: 43,
      monthlyContributionToday: 100,
      annualInflationRate: 0.03,
    }
    const settings = {
      portfolioComponents: createPortfolioComponents(
        { equity: 1, bonds: 0, fixed: 0 },
        {
          equity: SYNTHETIC_RETURN_SERIES_IDS.equity,
          bond: SYNTHETIC_RETURN_SERIES_IDS.bond,
          cash: SYNTHETIC_RETURN_SERIES_IDS.cash,
        },
      ),
      inflationSourceId: FIXED_INFLATION_SOURCE_ID,
      manualCashRealReturn: 0,
      simulations: 1,
    }
    const result = simulateHistoricalBootstrapReferenceScenario(input, settings)

    expect(result.metadata.validYears).toEqual([])
    expect(result.rows.map((row) => row.inflationFactor)).toEqual([1, 1.03, 1.03 ** 2])
  })

  it('samples synthetic components independently from nominal assumptions within mixed historical paths', () => {
    const components = createPortfolioComponents(
      { equity: 0.5, bonds: 0.5, fixed: 0 },
      {
        equity: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.equity,
        bond: SYNTHETIC_RETURN_SERIES_IDS.bond,
        cash: SYNTHETIC_RETURN_SERIES_IDS.cash,
      },
    )
    const defaultInflation = findInflationSeries(DEFAULT_HISTORICAL_INFLATION_SERIES_ID)!
    const firstPath = generateHistoricalReturnPath(
      components,
      defaultInflation,
      [2020, 2020, 2020],
      0,
      () => 0.5,
    )
    const secondPath = generateHistoricalReturnPath(
      components,
      defaultInflation,
      [2020, 2020, 2020],
      0,
      () => 0.5,
    )
    const inflation2020 = defaultInflation.annualInflation[2020]
    const equityNominal = (1 + findHistoricalReturnSeries(DEFAULT_HISTORICAL_RETURN_SERIES_IDS.equity)!.normalizedSeries[2020]) * (1 + inflation2020) - 1
    const sampledSyntheticBondReturn = 0.03 - Math.sqrt(-2 * Math.log(0.5)) * 0.07

    expect(firstPath).toEqual(secondPath)
    expect(firstPath[0]).toBeCloseTo(0.5 * equityNominal + 0.5 * sampledSyntheticBondReturn)
    expect(firstPath).not.toEqual([equityNominal, equityNominal, equityNominal])
  })

  it('includes dataset versions in deterministic seeds', () => {
    const defaultSettings = {
      portfolioComponents: createPortfolioComponents(
        { equity: 0.7, bonds: 0.2, fixed: 0.1 },
        DEFAULT_HISTORICAL_RETURN_SERIES_IDS,
      ),
      inflationSourceId: DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
      manualCashRealReturn: 0,
      simulations: 25,
    }

    expect(getHistoricalDatasetVersion(DEFAULT_HISTORICAL_RETURN_SERIES_IDS.equity)).toContain('sha256:')
    expect(createHistoricalBootstrapSeed(DEFAULT_INPUT, defaultSettings)).not.toBe(
      createHistoricalBootstrapSeed(DEFAULT_INPUT, {
        ...defaultSettings,
        portfolioComponents: createPortfolioComponents(
          { equity: 0.7, bonds: 0.2, fixed: 0.1 },
          { ...DEFAULT_HISTORICAL_RETURN_SERIES_IDS, bond: SYNTHETIC_RETURN_SERIES_IDS.bond },
        ),
      }),
    )
  })

  it('keeps mixed historical and synthetic bootstrap summaries deterministic for identical settings', () => {
    const settings = {
      portfolioComponents: createPortfolioComponents(
        { equity: 0.7, bonds: 0.2, fixed: 0.1 },
        {
          equity: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.equity,
          bond: SYNTHETIC_RETURN_SERIES_IDS.bond,
          cash: SYNTHETIC_RETURN_SERIES_IDS.cash,
        },
      ),
      inflationSourceId: DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
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
      inflationSourceId: DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
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

  it('calculates the reference return from the currently selected sources', () => {
    const syntheticSettings = {
      portfolioComponents: createPortfolioComponents(
        { equity: 0.7, bonds: 0.2, fixed: 0.1 },
        {
          equity: SYNTHETIC_RETURN_SERIES_IDS.equity,
          bond: SYNTHETIC_RETURN_SERIES_IDS.bond,
          cash: SYNTHETIC_RETURN_SERIES_IDS.cash,
        },
      ),
      inflationSourceId: FIXED_INFLATION_SOURCE_ID,
      manualCashRealReturn: 0,
      simulations: 25,
    }
    const historicalSettings = {
      ...syntheticSettings,
      portfolioComponents: createPortfolioComponents(
        { equity: 0.7, bonds: 0.2, fixed: 0.1 },
        {
          equity: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.equity,
          bond: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.bond,
          cash: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.cash,
        },
      ),
    }

    const syntheticExpectedReturn = calculateExpectedAnnualReturnForSelection(DEFAULT_INPUT, syntheticSettings)
    const historicalExpectedReturn = calculateExpectedAnnualReturnForSelection(DEFAULT_INPUT, historicalSettings)

    expect(syntheticExpectedReturn).toBeCloseTo(0.057)
    expect(historicalExpectedReturn).not.toBeCloseTo(syntheticExpectedReturn)
  })

  it('uses fixed-return rows with the selected inflation source as bootstrap reference capital', () => {
    const settings = {
      portfolioComponents: createPortfolioComponents(
        { equity: 0.7, bonds: 0.2, fixed: 0.1 },
        {
          equity: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.equity,
          bond: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.bond,
          cash: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.cash,
        },
      ),
      inflationSourceId: FIXED_INFLATION_SOURCE_ID,
      manualCashRealReturn: 0,
      simulations: 25,
    }

    const fixedReturnSelectedInflationPlan = simulateHistoricalBootstrapReferenceScenario(DEFAULT_INPUT, settings)
    const bootstrapSummary = runHistoricalBootstrapSimulation(DEFAULT_INPUT, settings)

    expect(bootstrapSummary.rows.map((row) => row.planCapitalToday)).toEqual(
      fixedReturnSelectedInflationPlan.rows.map((row) => row.closingCapitalToday),
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

  it('keeps production series registered as runtime historical datasets', () => {
    expect(HISTORICAL_RETURN_SERIES[0]?.id).toBe(DEFAULT_HISTORICAL_RETURN_SERIES_IDS.equity)
    expect(HISTORICAL_INFLATION_SERIES[0]?.id).toBe(DEFAULT_HISTORICAL_INFLATION_SERIES_ID)
  })

  it('keeps bootstrap seeds and results stable when a component label is renamed', () => {
    const settings = {
      portfolioComponents: createPortfolioComponents(
        { equity: 0.7, bonds: 0.2, fixed: 0.1 },
        DEFAULT_HISTORICAL_RETURN_SERIES_IDS,
      ),
      inflationSourceId: DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
      manualCashRealReturn: 0,
      simulations: 25,
    }
    const renamedSettings = {
      ...settings,
      portfolioComponents: settings.portfolioComponents.map((component, index) =>
        index === 0 ? { ...component, label: 'Renamed bucket' } : component,
      ),
    }

    expect(createHistoricalBootstrapSeed(DEFAULT_INPUT, renamedSettings)).toBe(
      createHistoricalBootstrapSeed(DEFAULT_INPUT, settings),
    )
    expect(simulateHistoricalBootstrapScenario(DEFAULT_INPUT, renamedSettings)).toEqual(
      simulateHistoricalBootstrapScenario(DEFAULT_INPUT, settings),
    )
  })
})
