import {
  findHistoricalReturnSeries,
  findPlanningRateReturnSeries,
  findSyntheticReturnSeries,
  isFixedInflationSource,
  type HistoricalReturnSeries,
  type InflationSourceOption,
  type PlanningRateReturnSeries,
  type ReturnSeriesCategory,
  type ReturnSeriesOption,
  type SyntheticReturnSeries,
  getReturnSeriesCategory,
} from '../../model/historicalReturns'

export function findReturnSeriesOption(id: string): ReturnSeriesOption | undefined {
  return findHistoricalReturnSeries(id) ?? findSyntheticReturnSeries(id) ?? findPlanningRateReturnSeries(id)
}

export function isPlanningRateSource(source: ReturnSeriesOption): source is PlanningRateReturnSeries {
  return 'kind' in source && (source as { kind?: string }).kind === 'planningRate'
}

export function isSyntheticSource(source: ReturnSeriesOption): source is SyntheticReturnSeries {
  return 'kind' in source && (source as { kind?: string }).kind === 'synthetic'
}

export function isGeneratedSyntheticSource(source: ReturnSeriesOption): source is SyntheticReturnSeries {
  return isSyntheticSource(source)
}

export function isHistoricalSource(source: ReturnSeriesOption): source is HistoricalReturnSeries {
  return !('kind' in source)
}

export function formatDropdownLabel(source: ReturnSeriesOption): string {
  const category = getReturnSeriesCategory(source.id)
  const categoryLabel = formatSourceCategoryLabel(category)
  if (isPlanningRateSource(source)) {
    return `${categoryLabel} — ${source.label}`
  }
  if (isGeneratedSyntheticSource(source)) {
    return `${categoryLabel} — ${source.label}`
  }

  if (source.role === 'equity') {
    if (source.sourceKind === 'bundledEtf') return `Aktien — ETF: ${source.label}`
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
  if (isPlanningRateSource(source)) return 'Rechenannahmen (Planungszins)'
  return isSyntheticSource(source) ? 'Synthetische Modellannahme' : (source as HistoricalReturnSeries).source.sourceName
}

export function getSourceVersion(source: ReturnSeriesOption): string {
  return source.sourceDatasetVersion
}

export function getCoverageLabel(source: ReturnSeriesOption): string {
  if (isPlanningRateSource(source)) {
    if (source.id === 'tagesgeld-realannahme-v1') {
      return 'Alle simulierten Jahre (Realziel mit 0 %-Floor)'
    }
    return 'Alle simulierten Jahre (konstanter Satz)'
  }
  if (isGeneratedSyntheticSource(source)) {
    return 'Keine historische Jahresabdeckung'
  }

  const historical = source as HistoricalReturnSeries
  return `${historical.startYear}-${historical.endYear}, ${Object.keys(historical.normalizedSeries).length} Beobachtungen`
}

export function getBasisLabel(source: ReturnSeriesOption): string {
  if (isPlanningRateSource(source)) {
    if (source.id === 'tagesgeld-realannahme-v1') {
      return 'Realziel nominalisiert mit 0 %-Untergrenze, Volatilität 0 % (Zielbindung entfällt am Floor)'
    }
    return 'Konstanter nominaler Planungszins, Volatilität 0 %'
  }
  if (isGeneratedSyntheticSource(source)) {
    return `Synthetischer Renditepfad, Erwartung ${formatPercent(source.expectedAnnualReturn)}, Volatilität ${formatPercent(source.annualVolatility)}`
  }

  const historical = source as HistoricalReturnSeries
  const typeLabel =
    historical.returnType === 'grossTotal'
      ? 'Total Return'
      : historical.returnType === 'adjustedMarketPrice'
        ? 'Yahoo Adjusted Market Price'
        : historical.returnType === 'yieldBased' ? 'Zins-/Bills-Proxy' : 'Proxy'
  return `${historical.returnBasis === 'real' ? 'Real' : 'Nominal'}, ${typeLabel}, ${historical.currency}`
}

export function getLicenseLabel(source: ReturnSeriesOption): string {
  if (isPlanningRateSource(source)) {
    return 'Planungsannahme, kein externer Datensatz'
  }
  if (isSyntheticSource(source)) {
    return 'Modellannahme, kein externer Datensatz'
  }

  const historical = source as HistoricalReturnSeries
  return historical.commercialUseAllowed ? historical.license : `${historical.license}; nicht für kommerzielle Nutzung freigegeben`
}

export function getCostTreatmentLabel(source: ReturnSeriesOption): string {
  return source.costTreatment === 'netOfFundCosts'
    ? 'ETF-TER/OCF bereits in der Renditequelle berücksichtigt; zusätzliche Bucket-Kosten werden aktuell nicht abgezogen'
    : 'Bucket-Kosten werden jährlich von der Rendite abgezogen'
}

export function formatCaveatTag(caveat: string): string {
  if (caveat.includes('Static fallback data')) {
    return 'statischer Datenstand'
  }

  if (caveat.includes('not official fund NAV')) {
    return 'Adjusted Close ≠ Fonds-NAV'
  }

  if (caveat.includes('EUR-denominated Xetra listing')) {
    return 'EUR/Xetra-Marktkurs'
  }

  if (caveat.includes('not cleared for commercial use')) {
    return 'nicht kommerziell'
  }

  if (caveat.includes('not an exact EUR-hedged') || caveat.includes('ETF')) {
    return 'ETF/EUR-Proxy'
  }

  if (caveat.includes('equal-weighted')) {
    return 'gleichgewichtet'
  }

  if (caveat.includes('Konstanter Planungszins')) {
    return 'konstanter Planungszins'
  }
  if (caveat.includes('Ergebnisbänder enthalten keine Zinsunsicherheit')) {
    return 'ohne Zinsunsicherheit'
  }
  if (caveat.includes('Bucket-Kosten werden separat')) {
    return 'Kosten separat'
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
