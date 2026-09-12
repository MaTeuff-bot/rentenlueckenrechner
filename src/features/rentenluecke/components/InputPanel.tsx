import { useEffect } from 'react'
import { TimelineSection } from './InputPanel/TimelineSection'
import { InsuranceRateAssumptions } from './InputPanel/InsuranceRateAssumptions'
import { AssumptionsPanel } from './AssumptionsPanel'
import { focusField } from './inputNavigation'
import { sectionStatus, type ScenarioIssue, type FlowSection } from '../model/scenarioIssues'
import type { ChildrenAnswer } from '../model/childrenAnswer'
import { createDefaultRetirementInsurance, type RetirementInsurance } from '../model/retirementInsurance'
import { RetirementInsuranceSection } from './InputPanel/RetirementInsuranceSection'
import {
  findInflationSourceOption,
  getInflationSourceOptions,
  HISTORICAL_MINIMUM_OBSERVATIONS,
} from '../model/historicalReturns'
import { type InputFieldName } from '../model/inputSchema'
import { calculatePortfolioBucketTotal, type PortfolioBucket } from '../model/portfolioBuckets'
import { type AssetAllocation } from '../model/stochasticReturns'
import { createPortfolioComponentsFromBuckets } from '../model/portfolioBuckets'
import type { RentenlueckeInput, RetirementIncomeStream } from '../model/types'
import { InflationSourceSection } from './InputPanel/InflationSourceSection'
import { RetirementSpendingSection, SavingsSection } from './InputPanel/BasicInputSections'
import { RetirementIncomeStreamsSection } from './InputPanel/RetirementIncomeStreamsSection'
import { InflationSourceCard, ReturnSourceCard } from './InputPanel/SourceDetailsCard'
import { PortfolioBucketSection } from './InputPanel/PortfolioBucketSection'
import { EtfProfileCatalog } from './InputPanel/EtfProfileCatalog'
import { findReturnSeriesOption, isHistoricalSource, isSyntheticSource, shortInflationLabel } from './InputPanel/sourceDisplay'

type InputPanelProps = {
  issues?: ScenarioIssue[]
  childrenAnswer?: ChildrenAnswer
  onChildrenChange?: (answer: ChildrenAnswer) => void
  onTransitionChange?: (value: number | undefined) => void
  input: RentenlueckeInput
  allocation: AssetAllocation
  portfolioBuckets: PortfolioBucket[]
  retirementIncomeStreams: RetirementIncomeStream[]
  historical: {
    inflationSourceId: string
  }
  historicalValidYears: number[]
  errors: Partial<Record<InputFieldName, string>>
  allocationError: string | null
  portfolioBucketError: string | null
  onRetirementInsuranceChange: (insurance: RetirementInsurance) => void
  onChange: (field: InputFieldName, value: number) => void
  onPortfolioBucketChange: (id: string, patch: Partial<Omit<PortfolioBucket, 'id'>>) => void
  onPortfolioBucketAdd: () => void
  onPortfolioBucketRemove: (id: string) => void
  onRetirementIncomeStreamChange: (id: string, patch: Partial<Omit<RetirementIncomeStream, 'id'>>) => void
  onRetirementIncomeStreamAdd: () => void
  onRetirementIncomeStreamRemove: (id: string) => void
  onInflationSourceChange: (sourceId: string) => void
  onReset: () => void
}

export function InputPanel({
  issues = [], childrenAnswer = { kind: 'missing' }, onChildrenChange, onTransitionChange = () => {},
  input,
  allocation,
  portfolioBuckets,
  retirementIncomeStreams,
  historical,
  historicalValidYears,
  errors,
  allocationError,
  portfolioBucketError,
  onChange,
  onRetirementInsuranceChange,
  onPortfolioBucketChange,
  onPortfolioBucketAdd,
  onPortfolioBucketRemove,
  onRetirementIncomeStreamChange,
  onRetirementIncomeStreamAdd,
  onRetirementIncomeStreamRemove,
  onInflationSourceChange,
  onReset,
}: InputPanelProps) {
  useEffect(() => {
    const originals = issues.map((issue, index) => {
      const field = document.getElementById(issue.fieldId)
      if (!field) return null
      const original = { field, invalid: field.getAttribute('aria-invalid'), described: field.getAttribute('aria-describedby') }
      field.setAttribute('aria-invalid', 'true')
      field.setAttribute('aria-describedby', `${original.described ?? ''} flow-issue-${index}`.trim())
      return original
    })
    return () => originals.forEach(original => {
      if (!original) return
      for (const [attr, value] of [['aria-invalid', original.invalid], ['aria-describedby', original.described]] as const) {
        if (value === null) original.field.removeAttribute(attr)
        else original.field.setAttribute(attr, value)
      }
    })
  }, [issues])
  const sections: [FlowSection, string, string][] = [
    ['zeitplan', 'Zeitplan', `Heute ${input.currentAge}, Arbeitsende ${input.retirementAge}, Planung bis ${input.planningAge}`],
    ['ausgaben', 'Ausgaben', `${input.monthlyDesiredSpendingToday} € monatlich heute`],
    ['einkommen', 'Einkommen', `${retirementIncomeStreams.length} Einkommensquellen`],
    ['vermoegen', 'Vermögen & Sparen', `${portfolioBuckets.length} Anlagen; Sparrate ${input.monthlyContributionToday} € bis Arbeitsende`],
    ['versicherung', 'Versicherung', 'KV/PV für Brücke und Rentenphase'],
    ['ergebnis', 'Ergebnis', issues.length ? 'Eingaben bitte ergänzen oder prüfen' : 'Deine Ruhestandsplanung'],
  ]
  const heading = (section: FlowSection) => {
    const [, label, summary] = sections.find(([id]) => id === section)!
    return <header><h3>{label} <span className="section-status">{sectionStatus(issues, section)}</span></h3><p>{summary.replaceAll('NaN', 'offen')}</p></header>
  }
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

      <nav className="flow-navigation" aria-label="Ruhestandsplanung">
        {sections.map(([id, label]) => <a key={id} href={`#${id}`} onClick={event => { event.preventDefault(); focusField(id) }}>{label}</a>)}
      </nav>
      {issues.length > 0 && <div className="validation-summary" role="status"><p>Bitte ergänze offene Angaben oder prüfe markierte Werte.</p><ul>{issues.map((issue, index) => <li key={`${issue.code}-${index}`} id={`flow-issue-${index}`}><a href={`#${issue.fieldId}`} onClick={event => { event.preventDefault(); focusField(issue.fieldId, issue.section === 'vermoegen' ? 'portfolio-add' : issue.section) }}>{issue.kind === 'missing' ? 'Offen' : 'Prüfen'}: {issue.message}</a></li>)}</ul></div>}
      {usesJstSource && <p className="source-warning">JST-Quellen: nur nicht kommerzielle Nutzung.</p>}
      {input.retirementInsurance?.rates && Object.values(input.retirementInsurance.rates).some(v => v !== undefined) && <p className="source-warning">Eigene gesetzliche Satzannahmen sind aktiv. Unter den Rechenannahmen prüfen.</p>}
      <div className="input-grid">
        <section id="zeitplan" className="flow-section" tabIndex={-1}>{heading('zeitplan')}
          <TimelineSection input={{ ...input, retirementIncomeStreams }} errors={errors} onChange={onChange} onStreamChange={onRetirementIncomeStreamChange} onTransitionChange={onTransitionChange} />
        </section>
        <section id="ausgaben" className="flow-section" tabIndex={-1}>{heading('ausgaben')}
          <RetirementSpendingSection input={input} errors={errors} onChange={onChange} />
        </section>
        <section id="einkommen" className="flow-section" tabIndex={-1}>{heading('einkommen')}
        <RetirementIncomeStreamsSection
          input={input}
          insurance={input.retirementInsurance}
          streams={retirementIncomeStreams}
          onUpdate={onRetirementIncomeStreamChange}
          onAdd={onRetirementIncomeStreamAdd}
          onRemove={onRetirementIncomeStreamRemove}
        />

        </section>
        <section id="vermoegen" className="flow-section" tabIndex={-1}>{heading('vermoegen')}
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

        </section>
        <section id="versicherung" className="flow-section" tabIndex={-1}>{heading('versicherung')}
          <RetirementInsuranceSection input={input} insurance={input.retirementInsurance ?? createDefaultRetirementInsurance()} onChange={onRetirementInsuranceChange} childrenAnswer={childrenAnswer} onChildrenChange={onChildrenChange} />
        </section>
        <details id="annahmen" className="flow-section"><summary>Rechenannahmen <span className="section-status">{sectionStatus(issues, 'annahmen')}</span></summary>
        <InflationSourceSection
          input={input}
          errors={errors}
          inflationSource={inflationSource}
          inflationOptions={inflationOptions}
          selectedInflationSourceId={historical.inflationSourceId}
          onChange={onChange}
          onInflationSourceChange={onInflationSourceChange}
        />

        <fieldset className="wide-fieldset source-overview">
          <legend>Renditequellen und Details</legend>
          <div className="source-chip-list" aria-label="Kurzstatus der Renditequellen">
            <span>{validYearLabel}</span>
            <span>Inflation: {inflationSource ? shortInflationLabel(inflationSource) : historical.inflationSourceId}</span>
            <span>Stichprobe mit Zurücklegen</span>
            {usesJstSource ? <span>JST: nicht kommerziell</span> : null}
          </div>
          {historicalValidYears.length < HISTORICAL_MINIMUM_OBSERVATIONS ? (
            <p className="source-warning">Warnung: Unter {HISTORICAL_MINIMUM_OBSERVATIONS} Beobachtungen können Bootstrap-Ergebnisse instabil sein.</p>
          ) : null}
          {hasHistoricalSource && hasSyntheticSource ? (
            <p className="source-mixed-note">Gemischte Quellen: Historische Anlagen bestimmen den gemeinsamen Jahrespool; synthetische Anlagen ziehen separat und verkleinern die historische Überlappung nicht.</p>
          ) : null}
          <details className="method-details source-overview-details">
            <summary>Ausgewählte Quellen im Detail</summary>
            <div className="historical-mode-note"><strong>Historischer Jahres-Bootstrap:</strong> Die Simulation mischt ganze Kalenderjahre aus den gewählten Quellen und zeigt Bandbreiten statt eines einzelnen Planwerts. Historische Aktien, Anleihen und Cash teilen sich dasselbe gezogene Jahr; synthetische Quellen laufen als eigene What-if-Annahmen mit.</div>
            <div className="source-detail-grid">
              {selectedReturnSources.map(({ id, label, source }) => source ? <ReturnSourceCard key={id} label={label} source={source} /> : null)}
              {inflationSource ? <InflationSourceCard source={inflationSource} /> : null}
            </div>
            <EtfProfileCatalog selectedSourceIds={selectedReturnSources.map(({ source }) => source?.id ?? '')} />
            <h3>Methode und Grenzen</h3>
            <p>Historische Quellen ziehen Jahre mit Zurücklegen: Dasselbe Jahr kann in einem Verlauf mehrfach vorkommen. Historische Quellen teilen sich dabei das gezogene Kalenderjahr, damit die Jahresbeziehungen zwischen Renditen und Inflation erhalten bleiben.</p>
            <p>Synthetische Quellen ziehen separat je Anlageklasse und reduzieren die historische Überlappung nicht. Die Bandbreite ist kein Backtest eines konkreten Zeitraums und keine Prognose. Sie ist ein Proxy, nicht die exakte Rendite eines bestimmten ETF, Fonds oder EUR-Anlegers.</p>
          </details>
        </fieldset>
          <InsuranceRateAssumptions insurance={input.retirementInsurance ?? createDefaultRetirementInsurance()} onChange={onRetirementInsuranceChange} />
          <AssumptionsPanel />
        </details>
      </div>
    </section>
  )
}
