import { applyCoverage, defaultCoverageAnswers, type InsuranceCoverageAnswers } from '../model/insuranceCoverage'
import { needsEstimator } from '../model/capitalIncome/setup'
import { CapitalEstimatorSetup } from './InputPanel/CapitalEstimatorSetup'
import { useEffect, useState, type MouseEvent } from 'react'
import {
  INPUT_TABS,
  resolveSectionRequest,
  sectionAnchorField,
  sectionLabel,
  sectionSummary,
  tabForSection,
  tabStatus as getTabStatus,
  tabSummary as getTabSummary,
  type InputTabId,
  type SectionRequest,
  type SectionSummaryContext,
} from './sectionsRegistry'
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
import type { LifeTableSex } from '../mortality/mortality'
import { calculatePortfolioBucketTotal, type PortfolioBucket } from '../model/portfolioBuckets'
import { type AssetAllocation } from '../model/stochasticReturns'
import { createPortfolioComponentsFromBuckets } from '../model/portfolioBuckets'
import type { RentenlueckeInput, RetirementIncomeStream } from '../model/types'
import { InflationSourceSection } from './InputPanel/InflationSourceSection'
import { SavingsSection } from './InputPanel/BasicInputSections'
import { RetirementIncomeStreamsSection } from './InputPanel/RetirementIncomeStreamsSection'
import { InflationSourceCard, ReturnSourceCard } from './InputPanel/SourceDetailsCard'
import { PortfolioBucketSection } from './InputPanel/PortfolioBucketSection'
import { EtfProfileCatalog } from './InputPanel/EtfProfileCatalog'
import { findReturnSeriesOption, isHistoricalSource, isSyntheticSource, shortInflationLabel } from './InputPanel/sourceDisplay'

type InputPanelProps = {
  issues?: ScenarioIssue[]
  insuranceCoverageAnswers?: InsuranceCoverageAnswers
  onInsuranceCoverageChange?: (answers: InsuranceCoverageAnswers) => void
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
  onLifeTableSexChange?: (value: LifeTableSex) => void
  onPortfolioBucketChange: (id: string, patch: Partial<Omit<PortfolioBucket, 'id'>>) => void
  onPortfolioBucketAdd: () => void
  onPortfolioBucketRemove: (id: string) => void
  onRetirementIncomeStreamChange: (id: string, patch: Partial<Omit<RetirementIncomeStream, 'id'>>) => void
  onRetirementIncomeStreamAdd: () => void
  onRetirementIncomeStreamRemove: (id: string) => void
  onInflationSourceChange: (sourceId: string) => void
  onReset: () => void
  sectionRequest?: SectionRequest | null
}



export function InputPanel({
  insuranceCoverageAnswers, onInsuranceCoverageChange,
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
  onLifeTableSexChange,
  onRetirementInsuranceChange,
  onPortfolioBucketChange,
  onPortfolioBucketAdd,
  onPortfolioBucketRemove,
  onRetirementIncomeStreamChange,
  onRetirementIncomeStreamAdd,
  onRetirementIncomeStreamRemove,
  onInflationSourceChange,
  onReset,
  sectionRequest = null,
}: InputPanelProps) {
  const [activeTab, setActiveTab] = useState<InputTabId>('plan')
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
  useEffect(() => {
    if (!sectionRequest) return
    const { tab, fieldId } = resolveSectionRequest(sectionRequest)
    if (tab) setActiveTab(tab)
    const fallback = sectionAnchorField(sectionRequest.section)
    focusField(fieldId, fallback)
    if (tab) window.setTimeout(() => focusField(fieldId, fallback), 0)
  }, [sectionRequest])
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

  const summaryContext: SectionSummaryContext = {
    input,
    portfolioBuckets,
    retirementIncomeStreams,
    issues,
    validYearLabel,
  }
  const sections: [FlowSection, string, string][] = (
    ['zeitplan', 'ausgaben', 'einkommen', 'vermoegen', 'versicherung', 'ergebnis'] as FlowSection[]
  ).map((id) => [id, sectionLabel(id), sectionSummary(id, summaryContext)])
  const heading = (section: FlowSection) => {
    const [, label, summary] = sections.find(([id]) => id === section)!
    return <header><h3>{label} <span className="section-status">{sectionStatus(issues, section)}</span></h3><p>{summary.replaceAll('NaN', 'offen')}</p></header>
  }
  const tabStatus = (tabId: InputTabId): string => getTabStatus(tabId, issues)
  const tabSummary = (tabId: InputTabId): string => getTabSummary(tabId, summaryContext)
  const estimatorInsurance = applyCoverage(input.retirementInsurance ?? createDefaultRetirementInsurance(), insuranceCoverageAnswers ?? defaultCoverageAnswers())
  const showCapitalEstimator = needsEstimator({ ...input, retirementInsurance: estimatorInsurance })
  const jumpToEstimatorField = (fieldId: string) => {
    setActiveTab('vermoegen')
    focusField(fieldId, 'estimator-fundAcquisitionCost')
    window.setTimeout(() => focusField(fieldId, 'estimator-fundAcquisitionCost'), 0)
  }
  const jumpToInsuranceBlock = () => {
    setActiveTab('versicherung')
    const modeSelect = typeof document === 'undefined' ? null : document.querySelector<HTMLSelectElement>('select[id^="insurance-"][id$="-capitalMode"]')
    const target = modeSelect?.id ?? 'insurance-block-3-heading'
    focusField(target)
    window.setTimeout(() => focusField(target), 0)
  }
  const handleIssueClick = (event: MouseEvent<HTMLAnchorElement>, issue: ScenarioIssue) => {
    event.preventDefault()
    const tab = tabForSection(issue.section)
    if (tab) setActiveTab(tab)
    const fallback = sectionAnchorField(issue.section)
    focusField(issue.fieldId, fallback)
    if (tab) window.setTimeout(() => focusField(issue.fieldId, fallback), 0)
  }

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

      <div className="input-tabs" role="tablist" aria-label="Eingabebereiche">
        {INPUT_TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`input-tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`input-tabpanel-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="tab-title">{tab.label} <span className="section-status">{tabStatus(tab.id)}</span></span>
            <span className="tab-summary">{tabSummary(tab.id)}</span>
          </button>
        ))}
      </div>
      {issues.length > 0 && <div className="validation-summary" role="status"><p>Bitte ergänze offene Angaben oder prüfe markierte Werte.</p><ul>{issues.map((issue, index) => <li key={`${issue.code}-${index}`} id={`flow-issue-${index}`}><a href={`#${issue.fieldId}`} onClick={event => handleIssueClick(event, issue)}>{issue.kind === 'missing' ? 'Offen' : 'Prüfen'}: {issue.message}</a></li>)}</ul></div>}
      {usesJstSource && <p className="source-warning">JST-Quellen: nur nicht kommerzielle Nutzung.</p>}
      {input.retirementInsurance?.rates && Object.values(input.retirementInsurance.rates).some(v => v !== undefined) && <p className="source-warning">Eigene gesetzliche Satzannahmen sind aktiv. Unter den Rechenannahmen prüfen.</p>}
      <div className="input-grid">
        <div role="tabpanel" id="input-tabpanel-plan" aria-labelledby="input-tab-plan" className="input-tabpanel" hidden={activeTab !== 'plan'}>
          <section id="zeitplan" className="flow-section" tabIndex={-1}>{heading('zeitplan')}
            <TimelineSection input={{ ...input, retirementIncomeStreams }} errors={errors} onChange={onChange} onTransitionChange={onTransitionChange} onLifeTableSexChange={onLifeTableSexChange} />
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
        </div>
        <div role="tabpanel" id="input-tabpanel-vermoegen" aria-labelledby="input-tab-vermoegen" className="input-tabpanel" hidden={activeTab !== 'vermoegen'}>
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
          {showCapitalEstimator && <CapitalEstimatorSetup insurance={estimatorInsurance} onChange={onRetirementInsuranceChange} onJumpToInsurance={jumpToInsuranceBlock} />}

          </section>
        </div>
        <div role="tabpanel" id="input-tabpanel-versicherung" aria-labelledby="input-tab-versicherung" className="input-tabpanel" hidden={activeTab !== 'versicherung'}>
          <section id="versicherung" className="flow-section" tabIndex={-1}>{heading('versicherung')}
            <RetirementInsuranceSection issues={issues} coverage={insuranceCoverageAnswers} onCoverageChange={onInsuranceCoverageChange} input={input} insurance={input.retirementInsurance ?? createDefaultRetirementInsurance()} onChange={onRetirementInsuranceChange} childrenAnswer={childrenAnswer} onChildrenChange={onChildrenChange} onJumpToEstimator={jumpToEstimatorField} />
          </section>
        </div>
        <div role="tabpanel" id="input-tabpanel-annahmen" aria-labelledby="input-tab-annahmen" className="input-tabpanel" hidden={activeTab !== 'annahmen'}>
          <section id="annahmen" className="flow-section" tabIndex={-1}>
            <header><h3>Rechenannahmen <span className="section-status">{sectionStatus(issues, 'annahmen')}</span></h3><p>{validYearLabel}</p></header>
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
            <legend>Quellen und Details</legend>
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
          </section>
        </div>
      </div>
    </section>
  )
}
