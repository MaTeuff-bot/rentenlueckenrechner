import {
  findHistoricalReturnSeries,
  findSyntheticReturnSeries,
  getReturnSeriesOptionsForRole,
  isFixedInflationSource,
  type HistoricalReturnSeries,
  type InflationSourceOption,
  type ManualFixedReturnSeries,
  type ReturnSeriesOption,
  type SyntheticReturnSeries,
} from '../../model/historicalReturns'

export function findReturnSeriesOption(id: string, manualCashRealReturn: number): ReturnSeriesOption | undefined {
  if (id === 'manual-fixed-real') {
    return getReturnSeriesOptionsForRole('cash', manualCashRealReturn).find((option) => option.id === id)
  }

  return findHistoricalReturnSeries(id) ?? findSyntheticReturnSeries(id)
}

export function isManualFixedSource(source: ReturnSeriesOption): source is ManualFixedReturnSeries {
  return source.id === 'manual-fixed-real'
}

export function isSyntheticSource(source: ReturnSeriesOption): source is ManualFixedReturnSeries | SyntheticReturnSeries {
  return 'kind' in source
}

export function isGeneratedSyntheticSource(source: ReturnSeriesOption): source is SyntheticReturnSeries {
  return isSyntheticSource(source) && !isManualFixedSource(source)
}

export function isHistoricalSource(source: ReturnSeriesOption): source is HistoricalReturnSeries {
  return !isSyntheticSource(source)
}

export function formatDropdownLabel(source: ReturnSeriesOption): string {
  if (isManualFixedSource(source)) {
    return 'Cash: fester Realzins'
  }

  if (isGeneratedSyntheticSource(source)) {
    return source.label.replace('Synthetisch: ', 'Synthetisch: ')
  }

  if (source.role === 'equity') {
    return 'Historisch: Aktien, entwickelte Märkte'
  }

  if (source.role === 'bond') {
    return 'Historisch: Staatsanleihen, entwickelte Märkte'
  }

  if (source.role === 'cash') {
    return 'Historisch: Bills/Cash, entwickelte Märkte'
  }

  return source.label
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
  if (isManualFixedSource(source)) {
    return 'Manuelle Eingabe'
  }

  return source.sourceDatasetVersion
}

export function getCoverageLabel(source: ReturnSeriesOption): string {
  if (isManualFixedSource(source)) {
    return 'Keine historische Jahresabdeckung'
  }

  if (isGeneratedSyntheticSource(source)) {
    return 'Keine historische Jahresabdeckung'
  }

  return `${source.startYear}-${source.endYear}, ${Object.keys(source.normalizedSeries).length} Beobachtungen`
}

export function getBasisLabel(source: ReturnSeriesOption): string {
  if (isManualFixedSource(source)) {
    return 'Fester Realzins'
  }

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
