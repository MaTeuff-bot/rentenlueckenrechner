import { CurrencyInput } from '../../../shared/components/CurrencyInput'
import { NumberInput } from '../../../shared/components/NumberInput'
import { PercentInput } from '../../../shared/components/PercentInput'
import {
  findHistoricalReturnSeries,
  findInflationSourceOption,
  findSyntheticReturnSeries,
  getInflationSourceOptions,
  getReturnSeriesOptionsForRole,
  HISTORICAL_MINIMUM_OBSERVATIONS,
  isFixedInflationSource,
  type HistoricalReturnSeries,
  type InflationSourceOption,
  type ManualFixedReturnSeries,
  type ReturnSeriesOption,
  type SyntheticReturnSeries,
} from '../model/historicalReturns'
import { inputLabels, type InputFieldName } from '../model/inputSchema'
import {
  ASSET_CLASS_ASSUMPTIONS,
  createPortfolioComponents,
  type AssetAllocation,
  type AssetClassKey,
} from '../model/stochasticReturns'
import type { RentenlueckeInput } from '../model/types'

type InputPanelProps = {
  input: RentenlueckeInput
  allocation: AssetAllocation
  historical: {
    returnSeriesIds: {
      equity: string
      bond: string
      cash: string
    }
    inflationSourceId: string
    manualCashRealReturn: number
  }
  historicalValidYears: number[]
  errors: Partial<Record<InputFieldName, string>>
  allocationError: string | null
  onChange: (field: InputFieldName, value: number) => void
  onAllocationChange: (field: AssetClassKey, value: number) => void
  onHistoricalReturnSeriesChange: (role: 'equity' | 'bond' | 'cash', seriesId: string) => void
  onManualCashRealReturnChange: (value: number) => void
  onInflationSourceChange: (sourceId: string) => void
  onReset: () => void
}

export function InputPanel({
  input,
  allocation,
  historical,
  historicalValidYears,
  errors,
  allocationError,
  onChange,
  onAllocationChange,
  onHistoricalReturnSeriesChange,
  onManualCashRealReturnChange,
  onInflationSourceChange,
  onReset,
}: InputPanelProps) {
  const portfolioComponents = createPortfolioComponents(allocation, historical.returnSeriesIds)
  const inflationSource = findInflationSourceOption(historical.inflationSourceId, input.annualInflationRate)
  const inflationOptions = getInflationSourceOptions(input.annualInflationRate)
  const selectedReturnSources = portfolioComponents.map((component) => {
    const role = component.role === 'bond' ? 'bond' : component.role === 'cash' ? 'cash' : 'equity'
    return {
      role,
      label: component.label,
      source: findReturnSeriesOption(component.returnSeriesId ?? '', historical.manualCashRealReturn),
    }
  })
  const hasHistoricalSource = selectedReturnSources.some(({ source }) => source && isHistoricalSource(source))
  const hasSyntheticSource = selectedReturnSources.some(({ source }) => source && isSyntheticSource(source))
  const usesJstSource = selectedReturnSources.some(
    ({ source }) => source && isHistoricalSource(source) && !source.commercialUseAllowed,
  )
  const validYearLabel =
    historicalValidYears.length === 0
      ? 'Keine nutzbaren historischen Jahre'
      : `${historicalValidYears[0]}-${historicalValidYears.at(-1)}, ${historicalValidYears.length} Beobachtungen`

  return (
    <section className="panel input-panel" aria-labelledby="inputs-title">
      <div className="panel-heading">
        <div>
          <h2 id="inputs-title">Eingaben</h2>
          <p>Deine Eingaben werden nur lokal in diesem Browser gespeichert.</p>
        </div>
        <button className="secondary-button" type="button" onClick={onReset}>
          Eingaben zurücksetzen
        </button>
      </div>

      <div className="input-grid">
        <fieldset className="wide-fieldset">
          <legend>Renditequellen</legend>
          <div className="historical-mode-note">
            <strong>Historischer Jahres-Bootstrap:</strong> Die Simulation mischt ganze Kalenderjahre aus den gewählten
            Quellen und zeigt Bandbreiten statt eines einzelnen Planwerts. Historische Aktien, Anleihen und Cash teilen
            sich dasselbe gezogene Jahr; synthetische Quellen laufen als eigene What-if-Annahmen mit.
          </div>
          <div className="source-chip-list" aria-label="Kurzstatus der Renditequellen">
            <span>{validYearLabel}</span>
            <span>Inflation: {inflationSource ? shortInflationLabel(inflationSource) : historical.inflationSourceId}</span>
            <span>Stichprobe mit Zurücklegen</span>
            {usesJstSource ? <span>JST: nicht kommerziell</span> : null}
          </div>
          {historicalValidYears.length < HISTORICAL_MINIMUM_OBSERVATIONS ? (
            <p className="source-warning">
              Warnung: Unter {HISTORICAL_MINIMUM_OBSERVATIONS} Beobachtungen können Bootstrap-Ergebnisse instabil sein.
            </p>
          ) : null}
          {hasHistoricalSource && hasSyntheticSource ? (
            <p className="source-mixed-note">
              Gemischte Quellen: Historische Anlagen bestimmen den gemeinsamen Jahrespool; synthetische Anlagen ziehen
              separat und verkleinern die historische Überlappung nicht.
            </p>
          ) : null}
        </fieldset>

        <fieldset>
          <legend>Persönliche Daten</legend>
          <NumberInput
            id="currentAge"
            label={inputLabels.currentAge}
            value={input.currentAge}
            min={0}
            max={100}
            error={errors.currentAge}
            onChange={(value) => onChange('currentAge', value)}
          />
          <NumberInput
            id="retirementAge"
            label={inputLabels.retirementAge}
            value={input.retirementAge}
            min={0}
            max={100}
            error={errors.retirementAge}
            onChange={(value) => onChange('retirementAge', value)}
          />
          <NumberInput
            id="planningAge"
            label={inputLabels.planningAge}
            value={input.planningAge}
            min={0}
            max={120}
            error={errors.planningAge}
            onChange={(value) => onChange('planningAge', value)}
          />
        </fieldset>

        <fieldset>
          <legend>Vermögen und Sparrate</legend>
          <CurrencyInput
            id="currentCapital"
            label={inputLabels.currentCapital}
            value={input.currentCapital}
            error={errors.currentCapital}
            onChange={(value) => onChange('currentCapital', value)}
          />
          <CurrencyInput
            id="monthlyContributionToday"
            label={inputLabels.monthlyContributionToday}
            value={input.monthlyContributionToday}
            error={errors.monthlyContributionToday}
            onChange={(value) => onChange('monthlyContributionToday', value)}
          />
        </fieldset>

        <fieldset>
          <legend>Ausgaben und Einkommen im Ruhestand</legend>
          <CurrencyInput
            id="monthlyDesiredSpendingToday"
            label={inputLabels.monthlyDesiredSpendingToday}
            value={input.monthlyDesiredSpendingToday}
            error={errors.monthlyDesiredSpendingToday}
            onChange={(value) => onChange('monthlyDesiredSpendingToday', value)}
          />
          <CurrencyInput
            id="monthlyRetirementIncomeToday"
            label={inputLabels.monthlyRetirementIncomeToday}
            value={input.monthlyRetirementIncomeToday}
            error={errors.monthlyRetirementIncomeToday}
            onChange={(value) => onChange('monthlyRetirementIncomeToday', value)}
          />
        </fieldset>

        <fieldset>
          <legend>Aufteilung</legend>
          {ASSET_CLASS_ASSUMPTIONS.map((assumption) => (
            <PercentInput
              key={assumption.key}
              id={`allocation-${assumption.key}`}
              label={assumption.label}
              value={allocation[assumption.key]}
              min={0}
              max={100}
              error={allocationError && assumption.key === 'fixed' ? allocationError : undefined}
              onChange={(value) => onAllocationChange(assumption.key, value)}
            />
          ))}
        </fieldset>

        <fieldset>
          <legend>Renditequellen je Anlageklasse</legend>
          {portfolioComponents.map((component) => {
            const role = component.role === 'bond' ? 'bond' : component.role === 'cash' ? 'cash' : 'equity'
            const options = getReturnSeriesOptionsForRole(component.role, historical.manualCashRealReturn)

            return (
              <div className="field" key={component.id}>
                <label className="field-label" htmlFor={`historical-series-${role}`}>
                  {component.label}
                </label>
                <select
                  id={`historical-series-${role}`}
                  value={component.returnSeriesId}
                  onChange={(event) => onHistoricalReturnSeriesChange(role, event.target.value)}
                >
                  {options.map((option) => (
                    <option key={option.id} value={option.id} title={option.caveats.join(' ')}>
                      {formatDropdownLabel(option)}
                    </option>
                  ))}
                </select>
              </div>
            )
          })}
          {historical.returnSeriesIds.cash === 'manual-fixed-real' ? (
            <PercentInput
              id="manualCashRealReturn"
              label="Cash: manueller fester Realzins"
              value={historical.manualCashRealReturn}
              min={-50}
              max={50}
              onChange={onManualCashRealReturnChange}
            />
          ) : null}
        </fieldset>

        <fieldset className="wide-fieldset">
          <legend>Ausgewählte Quellen im Detail</legend>
          <div className="source-detail-grid">
            {selectedReturnSources.map(({ role, label, source }) =>
              source ? <ReturnSourceCard key={role} label={label} source={source} /> : null,
            )}
            {inflationSource ? <InflationSourceCard source={inflationSource} /> : null}
          </div>
          <details className="method-details">
            <summary>Methode und Grenzen</summary>
            <p>
              Historische Quellen ziehen Jahre mit Zurücklegen: Dasselbe Jahr kann in einem Verlauf mehrfach vorkommen.
              Historische Quellen teilen sich dabei das gezogene Kalenderjahr, damit die Jahresbeziehungen zwischen
              Renditen und Inflation erhalten bleiben.
            </p>
            <p>
              Synthetische Quellen ziehen separat je Anlageklasse und reduzieren die historische Überlappung nicht. Die
              Bandbreite ist kein Backtest eines konkreten Zeitraums und keine Prognose. Sie ist ein Proxy, nicht die
              exakte Rendite eines bestimmten ETF, Fonds oder EUR-Anlegers.
            </p>
          </details>
        </fieldset>

        <fieldset>
          <legend>Inflation</legend>
          <p className="field-help">
            Die Szenario-Inflation steuert Zahlungsströme in heutiger Kaufkraft und die reale Darstellung des Ledgers.
            Bei historischen Quellen wird der gewählte CPI-Jahrespfad zusätzlich mit den gezogenen Kalenderjahren synchronisiert.
          </p>
          <div className="field">
            <label className="field-label" htmlFor="inflation-source">
              Inflationsquelle
            </label>
            <select
              id="inflation-source"
              value={historical.inflationSourceId}
              onChange={(event) => onInflationSourceChange(event.target.value)}
            >
              {inflationOptions.map((option) => (
                <option key={option.id} value={option.id} title={option.caveats.join(' ')}>
                  {formatInflationDropdownLabel(option)}
                </option>
              ))}
            </select>
          </div>
          {inflationSource && isFixedInflationSource(inflationSource) ? (
            <PercentInput
              id="annualInflationRate"
              label={inputLabels.annualInflationRate}
              value={input.annualInflationRate}
              min={-5}
              max={20}
              error={errors.annualInflationRate}
              onChange={(value) => onChange('annualInflationRate', value)}
            />
          ) : null}
        </fieldset>
      </div>
    </section>
  )
}

function findReturnSeriesOption(id: string, manualCashRealReturn: number): ReturnSeriesOption | undefined {
  if (id === 'manual-fixed-real') {
    return getReturnSeriesOptionsForRole('cash', manualCashRealReturn).find((option) => option.id === id)
  }

  return findHistoricalReturnSeries(id) ?? findSyntheticReturnSeries(id)
}

function ReturnSourceCard({ label, source }: { label: string; source: ReturnSeriesOption }) {
  const caveats = source.caveats.slice(0, 3)

  return (
    <article className="source-detail-card">
      <h3>{label}</h3>
      <dl>
        <div>
          <dt>Quelle</dt>
          <dd>{getSourceName(source)}</dd>
        </div>
        <div>
          <dt>Version</dt>
          <dd>{getSourceVersion(source)}</dd>
        </div>
        <div>
          <dt>Abdeckung</dt>
          <dd>{getCoverageLabel(source)}</dd>
        </div>
        <div>
          <dt>Basis</dt>
          <dd>{getBasisLabel(source)}</dd>
        </div>
        <div>
          <dt>Lizenz</dt>
          <dd>{getLicenseLabel(source)}</dd>
        </div>
      </dl>
      <CaveatTags caveats={caveats} />
    </article>
  )
}

function InflationSourceCard({ source }: { source: InflationSourceOption }) {
  if (isFixedInflationSource(source)) {
    return (
      <article className="source-detail-card">
        <h3>Inflation</h3>
        <dl>
          <div>
            <dt>Quelle</dt>
            <dd>Manuelle Eingabe</dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>Feste Annahme</dd>
          </div>
          <div>
            <dt>Abdeckung</dt>
            <dd>Alle simulierten Jahre</dd>
          </div>
          <div>
            <dt>Basis</dt>
            <dd>{formatPrecisePercent(source.annualInflationRate)} pro Jahr</dd>
          </div>
          <div>
            <dt>Lizenz</dt>
            <dd>Manuelle Modellannahme</dd>
          </div>
        </dl>
        <CaveatTags caveats={source.caveats.slice(0, 3)} />
      </article>
    )
  }

  return (
    <article className="source-detail-card">
      <h3>Inflation</h3>
      <dl>
        <div>
          <dt>Quelle</dt>
          <dd>{source.source.sourceName}</dd>
        </div>
        <div>
          <dt>Version</dt>
          <dd>{source.sourceDatasetVersion}</dd>
        </div>
        <div>
          <dt>Abdeckung</dt>
          <dd>{source.startYear}-{source.endYear}, {Object.keys(source.annualInflation).length} Beobachtungen</dd>
        </div>
        <div>
          <dt>Basis</dt>
          <dd>Deutsche CPI-Inflation, {source.currency}</dd>
        </div>
        <div>
          <dt>Lizenz</dt>
          <dd>{source.license}</dd>
        </div>
      </dl>
      <CaveatTags caveats={source.caveats.slice(0, 3)} />
    </article>
  )
}

function CaveatTags({ caveats }: { caveats: readonly string[] }) {
  return (
    <div className="source-caveats" aria-label="Caveats">
      {caveats.map((caveat) => (
        <span key={caveat}>{formatCaveatTag(caveat)}</span>
      ))}
    </div>
  )
}

function isManualFixedSource(source: ReturnSeriesOption): source is ManualFixedReturnSeries {
  return source.id === 'manual-fixed-real'
}

function isSyntheticSource(source: ReturnSeriesOption): source is ManualFixedReturnSeries | SyntheticReturnSeries {
  return 'kind' in source
}

function isGeneratedSyntheticSource(source: ReturnSeriesOption): source is SyntheticReturnSeries {
  return isSyntheticSource(source) && !isManualFixedSource(source)
}

function isHistoricalSource(source: ReturnSeriesOption): source is HistoricalReturnSeries {
  return !isSyntheticSource(source)
}

function formatDropdownLabel(source: ReturnSeriesOption): string {
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

function formatInflationDropdownLabel(source: InflationSourceOption): string {
  if (isFixedInflationSource(source)) {
    return `Manuell: feste Inflation (${formatPrecisePercent(source.annualInflationRate)})`
  }

  return `Historisch: ${source.label}`
}

function getSourceName(source: ReturnSeriesOption): string {
  return isSyntheticSource(source) ? 'Synthetische Modellannahme' : source.source.sourceName
}

function getSourceVersion(source: ReturnSeriesOption): string {
  if (isManualFixedSource(source)) {
    return 'Manuelle Eingabe'
  }

  return source.sourceDatasetVersion
}

function getCoverageLabel(source: ReturnSeriesOption): string {
  if (isManualFixedSource(source)) {
    return 'Keine historische Jahresabdeckung'
  }

  if (isGeneratedSyntheticSource(source)) {
    return 'Keine historische Jahresabdeckung'
  }

  return `${source.startYear}-${source.endYear}, ${Object.keys(source.normalizedSeries).length} Beobachtungen`
}

function getBasisLabel(source: ReturnSeriesOption): string {
  if (isManualFixedSource(source)) {
    return 'Fester Realzins'
  }

  if (isGeneratedSyntheticSource(source)) {
    return `Synthetischer Renditepfad, Erwartung ${formatPercent(source.expectedAnnualReturn)}, Volatilität ${formatPercent(source.annualVolatility)}`
  }

  const typeLabel = source.returnType === 'grossTotal' ? 'Total Return' : source.returnType === 'yieldBased' ? 'Zins-/Bills-Proxy' : 'Proxy'
  return `${source.returnBasis === 'real' ? 'Real' : 'Nominal'}, ${typeLabel}, ${source.currency}`
}

function getLicenseLabel(source: ReturnSeriesOption): string {
  if (isSyntheticSource(source)) {
    return 'Modellannahme, kein externer Datensatz'
  }

  return source.commercialUseAllowed ? source.license : `${source.license}; nicht für kommerzielle Nutzung freigegeben`
}

function formatCaveatTag(caveat: string): string {
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

function shortInflationLabel(source: InflationSourceOption): string {
  if (isFixedInflationSource(source)) {
    return `Manuell ${formatPrecisePercent(source.annualInflationRate)}`
  }

  return source.label.replace('Deutschland CPI Inflation', 'Deutschland CPI')
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)} %`
}

function formatPrecisePercent(value: number): string {
  return `${Number((value * 100).toFixed(2)).toLocaleString('de-DE')} %`
}
