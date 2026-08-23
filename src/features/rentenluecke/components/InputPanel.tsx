import {
  findInflationSourceOption,
  getInflationSourceOptions,
  HISTORICAL_MINIMUM_OBSERVATIONS,
} from '../model/historicalReturns'
import { type InputFieldName } from '../model/inputSchema'
import { calculatePortfolioBucketTotal, type PortfolioBucket } from '../model/portfolioBuckets'
import { type AssetAllocation } from '../model/stochasticReturns'
import { createPortfolioComponentsFromBuckets } from '../model/portfolioBuckets'
import type { RentenlueckeInput } from '../model/types'
import { InflationSourceSection } from './InputPanel/InflationSourceSection'
import { PersonalDataSection, RetirementCashflowSection, SavingsSection } from './InputPanel/BasicInputSections'
import { InflationSourceCard, ReturnSourceCard } from './InputPanel/SourceDetailsCard'
import { PortfolioBucketSection } from './InputPanel/PortfolioBucketSection'
import { findReturnSeriesOption, isHistoricalSource, isSyntheticSource, shortInflationLabel } from './InputPanel/sourceDisplay'

type InputPanelProps = {
  input: RentenlueckeInput
  allocation: AssetAllocation
  portfolioBuckets: PortfolioBucket[]
  historical: {
    inflationSourceId: string
  }
  historicalValidYears: number[]
  errors: Partial<Record<InputFieldName, string>>
  allocationError: string | null
  portfolioBucketError: string | null
  onChange: (field: InputFieldName, value: number) => void
  onPortfolioBucketChange: (id: string, patch: Partial<Omit<PortfolioBucket, 'id'>>) => void
  onPortfolioBucketAdd: () => void
  onPortfolioBucketRemove: (id: string) => void
  onInflationSourceChange: (sourceId: string) => void
  onReset: () => void
}

export function InputPanel({
  input,
  allocation,
  portfolioBuckets,
  historical,
  historicalValidYears,
  errors,
  allocationError,
  portfolioBucketError,
  onChange,
  onPortfolioBucketChange,
  onPortfolioBucketAdd,
  onPortfolioBucketRemove,
  onInflationSourceChange,
  onReset,
}: InputPanelProps) {
  const portfolioComponents = createPortfolioComponentsFromBuckets(portfolioBuckets)
  const inflationSource = findInflationSourceOption(historical.inflationSourceId, input.annualInflationRate)
  const inflationOptions = getInflationSourceOptions(input.annualInflationRate)
  const selectedReturnSources = portfolioComponents.map((component) => {
    const role = component.role === 'bond' ? 'bond' : component.role === 'cash' ? 'cash' : 'equity'
    return {
      id: component.id,
      role,
      label: component.label,
      source: findReturnSeriesOption(component.returnSeriesId ?? ''),
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

        <PersonalDataSection input={input} errors={errors} onChange={onChange} />

        <SavingsSection input={input} errors={errors} onChange={onChange} />

        <PortfolioBucketSection
          buckets={portfolioBuckets}
          total={calculatePortfolioBucketTotal(portfolioBuckets)}
          allocation={allocation}
          error={portfolioBucketError ?? allocationError}
          onUpdate={onPortfolioBucketChange}
          onAdd={onPortfolioBucketAdd}
          onRemove={onPortfolioBucketRemove}
        />

        <RetirementCashflowSection input={input} errors={errors} onChange={onChange} />

        <fieldset className="wide-fieldset">
          <legend>Ausgewählte Quellen im Detail</legend>
          <div className="source-detail-grid">
            {selectedReturnSources.map(({ id, label, source }) =>
              source ? <ReturnSourceCard key={id} label={label} source={source} /> : null,
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

        <InflationSourceSection
          input={input}
          errors={errors}
          inflationSource={inflationSource}
          inflationOptions={inflationOptions}
          selectedInflationSourceId={historical.inflationSourceId}
          onChange={onChange}
          onInflationSourceChange={onInflationSourceChange}
        />
      </div>
    </section>
  )
}
