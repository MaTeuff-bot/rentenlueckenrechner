import {
  findHistoricalReturnSeries,
  findSyntheticReturnSeries,
  isFixedInflationSource,
  type HistoricalReturnSeries,
  type InflationSourceOption,
  type ReturnSeriesCategory,
  type ReturnSeriesOption,
  type SyntheticReturnSeries,
  getReturnSeriesCategory,
} from '../../model/historicalReturns'

export function findReturnSeriesOption(id: string): ReturnSeriesOption | undefined {
  return findHistoricalReturnSeries(id) ?? findSyntheticReturnSeries(id)
}

export function isSyntheticSource(source: ReturnSeriesOption): source is SyntheticReturnSeries {
  return 'kind' in source
}

export function isGeneratedSyntheticSource(source: ReturnSeriesOption): source is SyntheticReturnSeries {
  return isSyntheticSource(source)
}

export function isHistoricalSource(source: ReturnSeriesOption): source is HistoricalReturnSeries {
  return !isSyntheticSource(source)
}

export function formatDropdownLabel(source: ReturnSeriesOption): string {
  const category = getReturnSeriesCategory(source.id)
  const categoryLabel = formatSourceCategoryLabel(category)
  if (isGeneratedSyntheticSource(source)) {
    return `${categoryLabel} — ${source.label}`
  }

  if (source.role === 'equity') {
    return 'Aktien — Historisch: entwickelte Märkte'
  }

  if (source.role === 'bond') {
    return 'Anleihen — Historisch: Staatsanleihen, entwickelte Märkte'
  }

  if (source.role === 'cash') {
    return 'Cash — Historisch: Bills, entwickelte Märkte'
  }

  return source.label
}

export function formatSourceCategoryLabel(category: ReturnSeriesCategory | undefined): string {
  if (category === 'equity') return 'Aktien'
  if (category === 'bond') return 'Anleihen'
  if (category === 'cash') return 'Cash'
  return 'Unbekannt'
}

export function formatInflationDropdownLabel(source: InflationSourceOption): string {
  if (isFixedInflationSource(source)) {
    return `Manuell: feste Inflation (${formatPrecisePercent(source.annualInflationRate)})`
  }

  return `Historisch: ${source.label}`
}

export function getSourceName(source: ReturnSeriesOption): string {
  return isSyntheticSource(source) ? 'Synthetische Modellannahme' : source.source.sourceName
}

export function getSourceVersion(source: ReturnSeriesOption): string {
  return source.sourceDatasetVersion
}

export function getCoverageLabel(source: ReturnSeriesOption): string {
  if (isGeneratedSyntheticSource(source)) {
    return 'Keine historische Jahresabdeckung'
  }

  return `${source.startYear}-${source.endYear}, ${Object.keys(source.normalizedSeries).length} Beobachtungen`
}

export function getBasisLabel(source: ReturnSeriesOption): string {
  if (isGeneratedSyntheticSource(source)) {
    return `Synthetischer Renditepfad, Erwartung ${formatPercent(source.expectedAnnualReturn)}, Volatilität ${formatPercent(source.annualVolatility)}`
  }

  const typeLabel =
    source.returnType === 'grossTotal' ? 'Total Return' : source.returnType === 'yieldBased' ? 'Zins-/Bills-Proxy' : 'Proxy'
  return `${source.returnBasis === 'real' ? 'Real' : 'Nominal'}, ${typeLabel}, ${source.currency}`
}

export function getLicenseLabel(source: ReturnSeriesOption): string {
  if (isSyntheticSource(source)) {
    return 'Modellannahme, kein externer Datensatz'
  }

  return source.commercialUseAllowed ? source.license : `${source.license}; nicht für kommerzielle Nutzung freigegeben`
}

export function formatCaveatTag(caveat: string): string {
  if (caveat.includes('not cleared for commercial use')) {
    return 'nicht kommerziell'
  }

  if (caveat.includes('not an exact EUR-hedged') || caveat.includes('ETF')) {
    return 'ETF/EUR-Proxy'
  }

  if (caveat.includes('equal-weighted')) {
    return 'gleichgewichtet'
  }

  if (caveat.includes('Synthetic source')) {
    return 'synthetisch'
  }

  if (caveat.includes('Manual synthetic')) {
    return 'manuell'
  }

  if (caveat.includes('Annual inflation')) {
    return 'CPI-Jahresproxy'
  }

  if (caveat.includes('estimated value')) {
    return 'Schätzwert enthalten'
  }

  return caveat
}

export function shortInflationLabel(source: InflationSourceOption): string {
  if (isFixedInflationSource(source)) {
    return `Manuell ${formatPrecisePercent(source.annualInflationRate)}`
  }

  return source.label.replace('Deutschland CPI Inflation', 'Deutschland CPI')
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)} %`
}

export function formatPrecisePercent(value: number): string {
  return `${Number((value * 100).toFixed(2)).toLocaleString('de-DE')} %`
}
