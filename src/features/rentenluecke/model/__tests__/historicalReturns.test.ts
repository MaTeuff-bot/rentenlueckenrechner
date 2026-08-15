import { describe, expect, it } from 'vitest'
import { DEFAULT_INPUT } from '../defaults'
import {
  DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
  DEFAULT_HISTORICAL_RETURN_SERIES_IDS,
  findInflationSeries,
  generateHistoricalReturnPath,
  getValidHistoricalYears,
  sampleHistoricalYearsWithReplacement,
  simulateHistoricalBootstrapScenario,
  runHistoricalBootstrapSimulation,
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
  startYear: 2000,
  endYear: 2002,
  caveats: [],
  confidence: 'low',
  transformVersion: 'test',
}

describe('historical returns', () => {
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
    expect(getValidHistoricalYears(components, fixtureInflation!)).toEqual([
      2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024,
    ])
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
    const fixtureInflation = findInflationSeries(DEFAULT_HISTORICAL_INFLATION_SERIES_ID)!
    const [pathReturn] = generateHistoricalReturnPath(components, fixtureInflation, [2022], 0)

    const equityNominal = (1 - 0.17) * (1 + 0.069) - 1
    const bondNominal = (1 - 0.12) * (1 + 0.069) - 1
    const cashNominal = (1 - 0.07) * (1 + 0.069) - 1

    expect(pathReturn).toBeCloseTo(0.5 * equityNominal + 0.25 * bondNominal + 0.25 * cashNominal)
  })

  it('produces deterministic historical scenario and stochastic summaries for identical inputs', () => {
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
})
