import {
  findInflationSourceOption,
  getInflationSourceOptions,
  HISTORICAL_MINIMUM_OBSERVATIONS,
} from '../model/historicalReturns'
import { type InputFieldName } from '../model/inputSchema'
import { createPortfolioComponents, type AssetAllocation, type AssetClassKey } from '../model/stochasticReturns'
import type { RentenlueckeInput } from '../model/types'
import { AllocationSection } from './InputPanel/AllocationSection'
import { InflationSourceSection } from './InputPanel/InflationSourceSection'
import { PersonalDataSection, RetirementCashflowSection, SavingsSection } from './InputPanel/BasicInputSections'
import { InflationSourceCard, ReturnSourceCard } from './InputPanel/SourceDetailsCard'
import { ReturnSourceSection } from './InputPanel/ReturnSourceSection'
import { findReturnSeriesOption, isHistoricalSource, isSyntheticSource, shortInflationLabel } from './InputPanel/sourceDisplay'

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

        <PersonalDataSection input={input} errors={errors} onChange={onChange} />

        <SavingsSection input={input} errors={errors} onChange={onChange} />

        <RetirementCashflowSection input={input} errors={errors} onChange={onChange} />

        <AllocationSection
          allocation={allocation}
          allocationError={allocationError}
          onAllocationChange={onAllocationChange}
        />

        <ReturnSourceSection
          portfolioComponents={portfolioComponents}
          manualCashRealReturn={historical.manualCashRealReturn}
          onHistoricalReturnSeriesChange={onHistoricalReturnSeriesChange}
          onManualCashRealReturnChange={onManualCashRealReturnChange}
        />

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
