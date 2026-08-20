import { createSeededRandom, sampleNormal, type PortfolioComponent } from '../stochasticReturns'
import { findHistoricalReturnSeries, findSyntheticReturnSeries, isSyntheticReturnSeriesId } from './returnSeriesRegistry'
import { isFixedInflationSource } from './inflationSeriesRegistry'
import type { InflationSourceOption } from './types'

export function sampleHistoricalYearsWithReplacement(years: number[], count: number, seed: number): number[] {
  if (years.length === 0 && count > 0) {
    throw new Error('Historical bootstrap needs at least one valid sample year.')
  }

  const rng = createSeededRandom(seed)
  return Array.from({ length: count }, () => years[Math.floor(rng() * years.length)])
}

export function generateHistoricalReturnPath(
  components: PortfolioComponent[],
  inflationSource: InflationSourceOption,
  sampledYears: number[],
  manualCashRealReturn: number,
  rng: () => number = createSeededRandom(0),
): number[] {
  return sampledYears.map((year) => {
    const inflation = resolveInflationForSampledYear(inflationSource, year)

    return components.reduce((portfolioReturn, component) => {
      if (component.weight === 0) {
        return portfolioReturn
      }

      const annualReturn = resolveComponentNominalReturn(component, year, inflation, manualCashRealReturn, rng)
      return portfolioReturn + component.weight * annualReturn
    }, 0)
  })
}

export function generateHistoricalInflationPath(inflationSource: InflationSourceOption, sampledYears: number[]): number[] {
  return sampledYears.map((year) => resolveInflationForSampledYear(inflationSource, year))
}

export function sampleHistoricalYearsForPath(
  components: PortfolioComponent[],
  inflationSource: InflationSourceOption,
  validYears: number[],
  count: number,
  seed: number,
): number[] {
  if (validYears.length === 0 && !requiresSampledCalendarYear(components, inflationSource)) {
    return Array.from({ length: count }, (_, index) => index)
  }

  return sampleHistoricalYearsWithReplacement(validYears, count, seed)
}

export function resolveInflationForSampledYear(inflationSource: InflationSourceOption, year: number): number {
  if (isFixedInflationSource(inflationSource)) {
    return inflationSource.annualInflationRate
  }

  const inflation = inflationSource.annualInflation[year]
  if (!Number.isFinite(inflation)) {
    throw new Error(`Missing ${inflationSource.label} inflation for ${year}`)
  }

  return inflation
}

export function resolveComponentExpectedNominalReturn(
  component: PortfolioComponent,
  year: number,
  inflation: number,
  manualCashRealReturn: number,
): number {
  if (component.returnSeriesId === 'manual-fixed-real') {
    return realToNominalReturn(manualCashRealReturn, inflation)
  }

  const syntheticSeries = component.returnSeriesId ? findSyntheticReturnSeries(component.returnSeriesId) : undefined
  if (syntheticSeries) {
    return syntheticSeries.expectedAnnualReturn
  }

  const series = component.returnSeriesId ? findHistoricalReturnSeries(component.returnSeriesId) : undefined
  if (!series) {
    throw new Error(`Unknown return series for ${component.label}: ${component.returnSeriesId ?? 'missing'}`)
  }

  const annualReturn = series.normalizedSeries[year]
  if (!Number.isFinite(annualReturn)) {
    throw new Error(`Missing ${series.label} return for ${year}`)
  }

  return series.returnBasis === 'real' ? realToNominalReturn(annualReturn, inflation) : annualReturn
}

function requiresSampledCalendarYear(components: PortfolioComponent[], inflationSource: InflationSourceOption): boolean {
  return !isFixedInflationSource(inflationSource) || components.some((component) => {
    return Boolean(component.returnSeriesId && !isSyntheticReturnSeriesId(component.returnSeriesId))
  })
}

function resolveComponentNominalReturn(
  component: PortfolioComponent,
  year: number,
  inflation: number,
  manualCashRealReturn: number,
  rng: () => number,
): number {
  if (component.returnSeriesId === 'manual-fixed-real') {
    return realToNominalReturn(manualCashRealReturn, inflation)
  }

  const syntheticSeries = component.returnSeriesId ? findSyntheticReturnSeries(component.returnSeriesId) : undefined
  if (syntheticSeries) {
    return Math.max(-1, sampleNormal(rng, syntheticSeries.expectedAnnualReturn, syntheticSeries.annualVolatility))
  }

  const series = component.returnSeriesId ? findHistoricalReturnSeries(component.returnSeriesId) : undefined
  if (!series) {
    throw new Error(`Unknown return series for ${component.label}: ${component.returnSeriesId ?? 'missing'}`)
  }

  const annualReturn = series.normalizedSeries[year]
  if (!Number.isFinite(annualReturn)) {
    throw new Error(`Missing ${series.label} return for ${year}`)
  }

  return series.returnBasis === 'real' ? realToNominalReturn(annualReturn, inflation) : annualReturn
}

function realToNominalReturn(realReturn: number, inflation: number): number {
  return (1 + realReturn) * (1 + inflation) - 1
}
