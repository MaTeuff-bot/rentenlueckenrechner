import { CurrencyInput } from '../../../shared/components/CurrencyInput'
import { NumberInput } from '../../../shared/components/NumberInput'
import { PercentInput } from '../../../shared/components/PercentInput'
import {
  findHistoricalReturnSeries,
  findInflationSeries,
  findSyntheticReturnSeries,
  getReturnSeriesOptionsForRole,
  HISTORICAL_MINIMUM_OBSERVATIONS,
  type HistoricalReturnSeries,
  type InflationSeries,
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
    inflationSeriesId: string
    manualCashRealReturn: number
  }
  historicalValidYears: number[]
  errors: Partial<Record<InputFieldName, string>>
  allocationError: string | null
  onChange: (field: InputFieldName, value: number) => void
  onAllocationChange: (field: AssetClassKey, value: number) => void
  onHistoricalReturnSeriesChange: (role: 'equity' | 'bond' | 'cash', seriesId: string) => void
  onManualCashRealReturnChange: (value: number) => void
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
  onReset,
}: InputPanelProps) {
  const portfolioComponents = createPortfolioComponents(allocation, historical.returnSeriesIds)
  const inflationSeries = findInflationSeries(historical.inflationSeriesId)
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
            <span>Inflation: {inflationSeries ? shortInflationLabel(inflationSeries) : historical.inflationSeriesId}</span>
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
          <div className="field">
            <label className="field-label" htmlFor="historical-inflation-series">
              Inflationsdatensatz
            </label>
            <input
              id="historical-inflation-series"
              value={inflationSeries?.label ?? historical.inflationSeriesId}
              readOnly
              title={inflationSeries?.caveats.join(' ')}
            />
          </div>
        </fieldset>

        <fieldset className="wide-fieldset">
          <legend>Ausgewählte Quellen im Detail</legend>
          <div className="source-detail-grid">
            {selectedReturnSources.map(({ role, label, source }) =>
              source ? <ReturnSourceCard key={role} label={label} source={source} /> : null,
            )}
            {inflationSeries ? <InflationSourceCard source={inflationSeries} /> : null}
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
          <legend>Annahmen</legend>
          <PercentInput
            id="annualInflationRate"
            label={inputLabels.annualInflationRate}
            value={input.annualInflationRate}
            min={-5}
            max={20}
            error={errors.annualInflationRate}
            onChange={(value) => onChange('annualInflationRate', value)}
          />
          <PercentInput
            id="annualReturnBeforeRetirement"
            label={inputLabels.annualReturnBeforeRetirement}
            value={input.annualReturnBeforeRetirement}
            min={-50}
            max={50}
            error={errors.annualReturnBeforeRetirement}
            readOnly
            onChange={(value) => onChange('annualReturnBeforeRetirement', value)}
          />
          <PercentInput
            id="annualReturnInRetirement"
            label={inputLabels.annualReturnInRetirement}
            value={input.annualReturnInRetirement}
            min={-50}
            max={50}
            error={errors.annualReturnInRetirement}
            readOnly
            onChange={(value) => onChange('annualReturnInRetirement', value)}
          />
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

function InflationSourceCard({ source }: { source: InflationSeries }) {
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
    return `Nominal, Erwartung ${formatPercent(source.expectedAnnualReturn)}, Volatilität ${formatPercent(source.annualVolatility)}`
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

  if (caveat.includes('Provisional fixture')) {
    return 'provisorisch'
  }

  return caveat
}

function shortInflationLabel(source: InflationSeries): string {
  return source.label.replace('Deutschland CPI Inflation', 'Deutschland CPI')
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)} %`
}
