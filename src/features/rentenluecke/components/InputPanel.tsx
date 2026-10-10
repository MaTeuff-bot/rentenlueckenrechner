import type { InsuranceCoverageAnswers } from '../model/insuranceCoverage'
import { needsDetailedPortfolio } from '../model/capitalIncome/setup'
import type { PortfolioEstimatorReadiness, PortfolioEstimatorSettings } from '../model/capitalIncome/portfolioEstimator'
import { portfolioEstimatorReadiness } from '../model/capitalIncome/portfolioEstimator'
import { CapitalEstimatorSetup } from './InputPanel/CapitalEstimatorSetup'
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import {
  INPUT_TABS,
  issuesForTab,
  resolveSectionRequest,
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
import { installStickyTabsClearance, isActionableTarget, needsCoverageExpansion, requestCoverageExpansion, revealAndFocusTarget, scrollPanelToStart } from './inputNavigation'
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
import { type AssetAllocation, DEFAULT_STOCHASTIC_SETTINGS } from '../model/stochasticReturns'
import { createPortfolioComponentsFromBuckets } from '../model/portfolioBuckets'
import type { RentenlueckeInput, RetirementIncomeStream } from '../model/types'
import { SimulationsAssumptions } from './InputPanel/SimulationsAssumptions'
import { CashPlanningRateAssumptions } from './InputPanel/CashPlanningRateAssumptions'
import { InflationSourceSection } from './InputPanel/InflationSourceSection'
import { SavingsSection } from './InputPanel/BasicInputSections'
import { RetirementIncomeStreamsSection } from './InputPanel/RetirementIncomeStreamsSection'
import { InflationSourceCard, ReturnSourceCard } from './InputPanel/SourceDetailsCard'
import { PortfolioBucketSection } from './InputPanel/PortfolioBucketSection'
import { AllocationAtRetirementSection } from './InputPanel/AllocationAtRetirementSection'
import type { AllocationDraft } from '../model/capitalIncome/allocationEvent'
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
    simulations?: number
    cashMode?: string
    cashPlanningRate?: number
    cashRealRate?: number
    cashPlanningRateConfirmed?: boolean
  }
  historicalValidYears: number[]
  errors: Partial<Record<InputFieldName, string>>
  allocationError: string | null
  portfolioBucketError: string | null
  onRetirementInsuranceChange: (insurance: RetirementInsurance) => void
  portfolioEstimatorSettings?: PortfolioEstimatorSettings
  portfolioEstimatorReadiness?: PortfolioEstimatorReadiness
  onPortfolioEstimatorSettingsChange?: (settings: PortfolioEstimatorSettings | undefined) => void
  allocationAtRetirement?: AllocationDraft
  onPrefillAllocationAtRetirement?: () => void
  onAcceptAllocationAtRetirement?: () => void
  onResetAllocationAtRetirement?: () => void
  onToggleAllocationAtRetirement?: (enabled: boolean) => void
  onAllocationFixedTargetChange?: (bucketId: string, amountToday: number) => void
  onAllocationRemainderWeightChange?: (bucketId: string, weight: number) => void
  onRemoveAllocationTarget?: (bucketId: string) => void
  onMoveAllocationFixedTarget?: (bucketId: string, direction: -1 | 1) => void
  onRemoveAllocationFixedTarget?: (bucketId: string) => void
  onChange: (field: InputFieldName, value: number) => void
  onLifeTableSexChange?: (value: LifeTableSex) => void
  onPortfolioBucketChange: (id: string, patch: Partial<Omit<PortfolioBucket, 'id'>>) => void
  onPortfolioBucketAdd: () => void
  onPortfolioBucketRemove: (id: string) => void
  onRetirementIncomeStreamChange: (id: string, patch: Partial<Omit<RetirementIncomeStream, 'id'>>) => void
  onRetirementIncomeStreamAdd: () => void
  onRetirementIncomeStreamRemove: (id: string) => void
  onInflationSourceChange: (sourceId: string) => void
  onSimulationsChange: (simulations: number) => void
  onCashPlanningRateChange?: (value: number | undefined) => void
  onCashRealRateChange?: (value: number | undefined) => void
  onCashModeChange?: (mode: string) => void
  onCashPlanningRateConfirmedChange?: (confirmed: boolean) => void
  cashPlanningIssue?: string | null
  onReset: () => void
  sectionRequest?: SectionRequest | null
}



function TabOpenPoints({ tabId, issues, onIssueClick, onNext }: {
  tabId: InputTabId
  issues: readonly ScenarioIssue[]
  onIssueClick: (event: MouseEvent<HTMLAnchorElement>, issue: ScenarioIssue) => void
  onNext: (tabId: InputTabId) => void
}) {
  const tabIssues = issuesForTab(tabId, issues)
  const tab = INPUT_TABS.find(entry => entry.id === tabId)
  if (tabIssues.length === 0) {
    return <p className="tab-open-points-empty">Vollständig – keine offenen Punkte in {tab?.label ?? tabId}.</p>
  }
  return (
    <div className="tab-open-points" aria-label={`Offene Punkte – ${tab?.label ?? tabId}`}>
      <ul>
        {tabIssues.map((issue, index) => (
          <li key={`${issue.code}-${tabId}-${index}`} id={`flow-issue-${tabId}-${index}`}>
            <a href={`#${issue.fieldId}`} onClick={event => onIssueClick(event, issue)}>
              {issue.kind === 'missing' ? 'Offen' : 'Prüfen'}: {issue.message}
            </a>
          </li>
        ))}
      </ul>
      <button type="button" className="secondary-button" onClick={() => onNext(tabId)}>
        Nächster offener Punkt
      </button>
    </div>
  )
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
  portfolioEstimatorSettings,
  portfolioEstimatorReadiness: portfolioReadinessProp,
  onPortfolioEstimatorSettingsChange,
  allocationAtRetirement,
  onPrefillAllocationAtRetirement,
  onAcceptAllocationAtRetirement,
  onResetAllocationAtRetirement,
  onToggleAllocationAtRetirement,
  onAllocationFixedTargetChange,
  onAllocationRemainderWeightChange,
  onRemoveAllocationTarget,
  onMoveAllocationFixedTarget,
  onRemoveAllocationFixedTarget,
  onPortfolioBucketChange,
  onPortfolioBucketAdd,
  onPortfolioBucketRemove,
  onRetirementIncomeStreamChange,
  onRetirementIncomeStreamAdd,
  onRetirementIncomeStreamRemove,
  onInflationSourceChange,
  onSimulationsChange,
  onCashPlanningRateChange,
  onCashRealRateChange,
  onCashModeChange,
  onCashPlanningRateConfirmedChange,
  cashPlanningIssue,
  onReset,
  sectionRequest = null,
}: InputPanelProps) {
  const [activeTab, setActiveTab] = useState<InputTabId>('plan')
  const [navStatus, setNavStatus] = useState<string | null>(null)
  const [navRequest, setNavRequest] = useState<{ tab: InputTabId | null; queue: string[]; index: number; token: number } | null>(null)
  const navTokenRef = useRef(0)
  const navRequestRef = useRef<{ tab: InputTabId | null; queue: string[]; index: number; token: number } | null>(null)
  const initialTabRef = useRef(true)
  const retryTimerRef = useRef<number | null>(null)
  const latestSectionNonceRef = useRef<number | null>(null)
  const tabsBarRef = useRef<HTMLDivElement | null>(null)
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
  const applyRevealResult = useCallback((fieldId: string, result: { status: string; fallbackUsed: boolean }) => {
    if (result.status === 'found') {
      setNavStatus(null)
    } else if (result.status === 'unactionable') {
      setNavStatus(`Hinweis: Das Ziel „${fieldId}“ ist derzeit nicht bedienbar (ausgeblendet oder deaktiviert).`)
    } else {
      setNavStatus(`Hinweis: Das Ziel „${fieldId}“ ist derzeit nicht verfügbar.`)
    }
  }, [])
  const clearPendingRetry = useCallback(() => {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
    }
  }, [])
  const requestSingleNavigation = useCallback((tab: InputTabId | null, fieldId: string) => {
    const token = navTokenRef.current + 1
    navTokenRef.current = token
    clearPendingRetry()
    requestCoverageExpansion(fieldId)
    const request = { tab, queue: [fieldId], index: 0, token }
    navRequestRef.current = request
    setNavRequest(request)
    if (tab) setActiveTab(tab)
  }, [clearPendingRetry])
  useEffect(() => {
    if (!navRequest) return
    if (navRequest.token !== navTokenRef.current) return
    if (navRequest.tab && navRequest.tab !== activeTab) return
    const fieldId = navRequest.queue[navRequest.index]
    if (!fieldId) return
    const result = revealAndFocusTarget(fieldId)
    if (result.status === 'found' || result.status === 'unactionable') {
      clearPendingRetry()
      applyRevealResult(fieldId, result)
      return
    }
    if (needsCoverageExpansion(fieldId) && retryTimerRef.current === null) {
      retryTimerRef.current = window.setTimeout(() => {
        retryTimerRef.current = null
        if (navTokenRef.current !== navRequest.token) return
        if (navRequestRef.current?.token !== navRequest.token) return
        const retryResult = revealAndFocusTarget(fieldId)
        applyRevealResult(fieldId, retryResult)
      }, 60)
      return
    }
    clearPendingRetry()
    applyRevealResult(fieldId, result)
  }, [navRequest, activeTab, applyRevealResult, clearPendingRetry])
  useEffect(() => {
    if (initialTabRef.current) {
      initialTabRef.current = false
      return
    }
    const pending = navRequestRef.current
    if (pending && pending.token === navTokenRef.current && pending.tab === activeTab) return
    scrollPanelToStart(activeTab)
  }, [activeTab])
  useEffect(() => {
    if (!sectionRequest) return
    if (latestSectionNonceRef.current === sectionRequest.nonce) return
    latestSectionNonceRef.current = sectionRequest.nonce
    const { tab, fieldId } = resolveSectionRequest(sectionRequest)
    requestSingleNavigation(tab, fieldId)
  }, [sectionRequest, requestSingleNavigation])
  useEffect(() => {
    const bar = tabsBarRef.current ?? document.querySelector('.input-tabs')
    if (!(bar instanceof HTMLElement)) return
    return installStickyTabsClearance(bar)
  }, [])
  useEffect(() => () => {
    if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current)
  }, [])
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
  const needsAutomaticEstimator = needsDetailedPortfolio(input)
  const portfolioReadiness = portfolioReadinessProp ?? portfolioEstimatorReadiness(portfolioEstimatorSettings, portfolioBuckets, calculatePortfolioBucketTotal(portfolioBuckets))
  const chooseNextActionable = useCallback((tabId: InputTabId, tabIssues: readonly ScenarioIssue[]): ScenarioIssue | null => {
    for (const issue of tabIssues) {
      const element = document.getElementById(issue.fieldId)
      if (element) {
        if (isActionableTarget(element)) return issue
        continue
      }
      if (needsCoverageExpansion(issue.fieldId)) return issue
    }
    return null
  }, [])
  const jumpToEstimatorField = useCallback((fieldId: string) => {
    requestSingleNavigation('vermoegen', fieldId)
  }, [requestSingleNavigation])
  const jumpToInsuranceBlock = useCallback(() => {
    requestSingleNavigation('versicherung', 'insurance-block-3-heading')
  }, [requestSingleNavigation])
  const requestFieldCrossTab = useCallback((tab: InputTabId, fieldId: string) => {
    requestSingleNavigation(tab, fieldId)
  }, [requestSingleNavigation])
  const handleIssueClick = useCallback((event: MouseEvent<HTMLAnchorElement>, issue: ScenarioIssue) => {
    event.preventDefault()
    const tab = tabForSection(issue.section)
    requestSingleNavigation(tab, issue.fieldId)
  }, [requestSingleNavigation])
  const handleNextOpenPoint = useCallback((tabId: InputTabId) => {
    const tabIssues = issuesForTab(tabId, issues)
    if (tabIssues.length === 0) return
    const chosen = chooseNextActionable(tabId, tabIssues) ?? tabIssues[0]!
    const tab = tabForSection(chosen.section)
    requestSingleNavigation(tab, chosen.fieldId)
  }, [issues, requestSingleNavigation, chooseNextActionable])
  const selectTab = useCallback((tabId: InputTabId) => {
    navTokenRef.current += 1
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
    }
    navRequestRef.current = null
    setNavRequest(null)
    setNavStatus(null)
    setActiveTab(tabId)
  }, [])
  const handleTabKeyDown = useCallback((event: KeyboardEvent<HTMLButtonElement>, tabId: InputTabId) => {
    const order = INPUT_TABS.map(tab => tab.id)
    const current = order.indexOf(tabId)
    let next: InputTabId | null = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = order[(current + 1) % order.length]!
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = order[(current - 1 + order.length) % order.length]!
    else if (event.key === 'Home') next = order[0]!
    else if (event.key === 'End') next = order[order.length - 1]!
    if (!next) return
    event.preventDefault()
    selectTab(next)
    document.getElementById(`input-tab-${next}`)?.focus()
  }, [selectTab])

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

      <div className="input-tabs" role="tablist" aria-label="Eingabebereiche" ref={tabsBarRef}>
        {INPUT_TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`input-tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`input-tabpanel-${tab.id}`}
            onClick={() => selectTab(tab.id)}
            onKeyDown={event => handleTabKeyDown(event, tab.id)}
          >
            <span className="tab-title">{tab.label} <span className="section-status">{tabStatus(tab.id)}</span></span>
            <span className="tab-summary">{tabSummary(tab.id)}</span>
          </button>
        ))}
      </div>
      {navStatus ? <p className="navigation-status" role="status">{navStatus}</p> : null}
      {issues.length > 0 && <div className="validation-summary" role="status"><p>Bitte ergänze offene Angaben oder prüfe markierte Werte.</p><ul>{issues.map((issue, index) => <li key={`${issue.code}-${index}`} id={`flow-issue-${index}`}><a href={`#${issue.fieldId}`} onClick={event => handleIssueClick(event, issue)}>{issue.kind === 'missing' ? 'Offen' : 'Prüfen'}: {issue.message}</a></li>)}</ul></div>}
      {usesJstSource && <p className="source-warning">JST-Quellen: nur nicht kommerzielle Nutzung.</p>}
      {input.retirementInsurance?.rates && Object.values(input.retirementInsurance.rates).some(v => v !== undefined) && <p className="source-warning">Eigene gesetzliche Satzannahmen sind aktiv. Unter den Rechenannahmen prüfen.</p>}
      <div className="input-grid">
        <div role="tabpanel" id="input-tabpanel-plan" aria-labelledby="input-tab-plan" className="input-tabpanel" hidden={activeTab !== 'plan'}>
          <TabOpenPoints tabId="plan" issues={issues} onIssueClick={handleIssueClick} onNext={handleNextOpenPoint} />
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
          <TabOpenPoints tabId="vermoegen" issues={issues} onIssueClick={handleIssueClick} onNext={handleNextOpenPoint} />
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
          <CapitalEstimatorSetup settings={portfolioEstimatorSettings} readiness={portfolioReadiness} needsAutomatic={needsAutomaticEstimator} onSettingsChange={onPortfolioEstimatorSettingsChange ?? (() => {})} onJumpToInsurance={jumpToInsuranceBlock} />

          <AllocationAtRetirementSection
            buckets={portfolioBuckets}
            draft={allocationAtRetirement}
            onPrefill={onPrefillAllocationAtRetirement ?? (() => {})}
            onAccept={onAcceptAllocationAtRetirement ?? (() => {})}
            onReset={onResetAllocationAtRetirement ?? (() => {})}
            onToggleEnabled={onToggleAllocationAtRetirement ?? (() => {})}
            onFixedChange={onAllocationFixedTargetChange ?? (() => {})}
            onWeightChange={onAllocationRemainderWeightChange ?? (() => {})}
            onRemoveTarget={onRemoveAllocationTarget ?? (() => {})}
            onMoveFixedTarget={onMoveAllocationFixedTarget ?? (() => {})}
            onRemoveFixedTarget={onRemoveAllocationFixedTarget ?? (() => {})}
          />

          </section>
        </div>
        <div role="tabpanel" id="input-tabpanel-versicherung" aria-labelledby="input-tab-versicherung" className="input-tabpanel" hidden={activeTab !== 'versicherung'}>
          <TabOpenPoints tabId="versicherung" issues={issues} onIssueClick={handleIssueClick} onNext={handleNextOpenPoint} />
          <section id="versicherung" className="flow-section" tabIndex={-1}>{heading('versicherung')}
            <RetirementInsuranceSection issues={issues} coverage={insuranceCoverageAnswers} onCoverageChange={onInsuranceCoverageChange} input={input} insurance={input.retirementInsurance ?? createDefaultRetirementInsurance()} onChange={onRetirementInsuranceChange} childrenAnswer={childrenAnswer} onChildrenChange={onChildrenChange} onJumpToEstimator={jumpToEstimatorField} onRequestField={requestFieldCrossTab} onRequestIssue={issue => { const tab = tabForSection(issue.section); requestSingleNavigation(tab, issue.fieldId) }} estimatorReadiness={portfolioReadiness} />
          </section>
        </div>
        <div role="tabpanel" id="input-tabpanel-annahmen" aria-labelledby="input-tab-annahmen" className="input-tabpanel" hidden={activeTab !== 'annahmen'}>
          <TabOpenPoints tabId="annahmen" issues={issues} onIssueClick={handleIssueClick} onNext={handleNextOpenPoint} />
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

          <SimulationsAssumptions simulations={historical.simulations ?? DEFAULT_STOCHASTIC_SETTINGS.simulations} onChange={onSimulationsChange} />

          <CashPlanningRateAssumptions
            cashMode={historical.cashMode}
            cashPlanningRate={historical.cashPlanningRate}
            cashRealRate={historical.cashRealRate}
            cashPlanningRateConfirmed={historical.cashPlanningRateConfirmed}
            issue={cashPlanningIssue ?? null}
            onModeChange={onCashModeChange ?? (() => {})}
            onRateChange={onCashPlanningRateChange ?? (() => {})}
            onRealRateChange={onCashRealRateChange ?? (() => {})}
            onConfirmedChange={onCashPlanningRateConfirmedChange ?? (() => {})}
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
