// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { DEFAULT_INPUT } from '../../model/defaults'
import { DEFAULT_ASSET_ALLOCATION } from '../../model/stochasticReturns'
import { createDefaultPortfolioBuckets } from '../../model/portfolioBuckets'
import { createDefaultRetirementIncomeStreams } from '../../model/retirementIncomeStreams'
import { createDefaultState } from '../../hooks/scenarioState/defaults'
import type { ScenarioIssue } from '../../model/scenarioIssues'
import { InputPanel } from '../InputPanel'
import { issuesForTab, nextOpenPoint } from '../sectionsRegistry'
import { revealAndFocusTarget, scrollPanelToStart } from '../inputNavigation'

const noop = () => {}

function renderPanel(issues: ScenarioIssue[]) {
  const state = createDefaultState()
  const buckets = createDefaultPortfolioBuckets(DEFAULT_INPUT.currentCapital, DEFAULT_ASSET_ALLOCATION)
  render(
    <InputPanel
      input={DEFAULT_INPUT}
      issues={issues}
      allocation={DEFAULT_ASSET_ALLOCATION}
      portfolioBuckets={buckets}
      retirementIncomeStreams={createDefaultRetirementIncomeStreams(DEFAULT_INPUT)}
      historical={state.historical}
      historicalValidYears={[]}
      errors={{}}
      allocationError={null}
      portfolioBucketError={null}
      onRetirementInsuranceChange={noop}
      onChange={noop}
      onPortfolioBucketChange={noop}
      onPortfolioBucketAdd={noop}
      onPortfolioBucketRemove={noop}
      onRetirementIncomeStreamChange={noop}
      onRetirementIncomeStreamAdd={noop}
      onRetirementIncomeStreamRemove={noop}
      onInflationSourceChange={noop}
      onSimulationsChange={noop}
      onReset={noop}
    />,
  )
}

function planIssue(fieldId = 'currentAge', kind: ScenarioIssue['kind'] = 'missing'): ScenarioIssue {
  return { code: `test.plan.${fieldId}`, fieldPath: 'currentAge', fieldId, section: 'zeitplan', kind, message: `Plan testen ${fieldId}` }
}

function annahmenIssue(fieldId = 'insurance-rates-kvGeneralRate', kind: ScenarioIssue['kind'] = 'invalid'): ScenarioIssue {
  return { code: `test.annahmen.${fieldId}`, fieldPath: 'retirementInsurance.rates', fieldId, section: 'annahmen', kind, message: `Annahmen testen ${fieldId}` }
}

beforeEach(() => {
  if (!Element.prototype.scrollIntoView) {
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true, writable: true })
  }
  vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('per-tab open points', () => {
  it('lists authoritative issues per tab with Offen/Prüfen and preserves hrefs', () => {
    renderPanel([planIssue('currentAge', 'missing'), annahmenIssue('insurance-rates-kvGeneralRate', 'invalid')])
    const planPanel = document.getElementById('input-tabpanel-plan')!
    expect(within(planPanel).getByRole('link', { name: /Offen: Plan testen/ })).toHaveAttribute('href', '#currentAge')
    const annahmenTab = screen.getByRole('tab', { name: /Rechenannahmen/ })
    fireEvent.click(annahmenTab)
    const annahmenPanel = document.getElementById('input-tabpanel-annahmen')!
    expect(within(annahmenPanel).getByRole('link', { name: /Prüfen: Annahmen testen/ })).toHaveAttribute('href', '#insurance-rates-kvGeneralRate')
  })

  it('shows empty text without fake links when a tab has no issues', () => {
    renderPanel([planIssue()])
    fireEvent.click(screen.getByRole('tab', { name: /Vermögen/ }))
    const vermoegenPanel = document.getElementById('input-tabpanel-vermoegen')!
    expect(within(vermoegenPanel).getByText(/Vollständig – keine offenen Punkte/)).toBeInTheDocument()
    const openPoints = vermoegenPanel.querySelector('.tab-open-points')
    expect(openPoints).toBeNull()
    expect(within(vermoegenPanel).queryByRole('link', { name: /Offen:|Prüfen:/ })).not.toBeInTheDocument()
    expect(within(vermoegenPanel).queryByRole('button', { name: /Nächster offener Punkt/ })).not.toBeInTheDocument()
  })

  it('keeps per-tab list ids distinct from the global summary ids', () => {
    renderPanel([planIssue()])
    expect(document.getElementById('flow-issue-0')).not.toBeNull()
    expect(document.getElementById('flow-issue-plan-0')).not.toBeNull()
  })
})

describe('ordinary tab switching', () => {
  it('scrolls to panel start without focusing an input', () => {
    renderPanel([planIssue(), annahmenIssue()])
    const spy = vi.mocked(Element.prototype.scrollIntoView)
    spy.mockClear()
    fireEvent.click(screen.getByRole('tab', { name: /Rechenannahmen/ }))
    expect(document.getElementById('input-tabpanel-annahmen')).toBeVisible()
    expect(document.activeElement?.tagName).not.toBe('INPUT')
    expect(document.activeElement?.id).not.toBe('insurance-rates-kvGeneralRate')
    expect(spy).toHaveBeenCalled()
    const firstCall = spy.mock.calls[0]?.[0] as ScrollIntoViewOptions | undefined
    expect(firstCall?.block).toBe('start')
  })

  it('supports arrow keys, Home and End without focusing inputs', () => {
    renderPanel([])
    const planTab = screen.getByRole('tab', { name: /Persönlicher Plan/ })
    planTab.focus()
    fireEvent.keyDown(planTab, { key: 'ArrowRight' })
    expect(document.activeElement?.id).toBe('input-tab-vermoegen')
    expect(document.getElementById('input-tabpanel-vermoegen')).toBeVisible()
    expect(document.activeElement?.tagName).not.toBe('INPUT')
    fireEvent.keyDown(document.activeElement!, { key: 'End' })
    expect(document.activeElement?.id).toBe('input-tab-annahmen')
    fireEvent.keyDown(document.activeElement!, { key: 'Home' })
    expect(document.activeElement?.id).toBe('input-tab-plan')
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' })
    expect(document.activeElement?.id).toBe('input-tab-annahmen')
  })
})

describe('explicit issue and next actions', () => {
  it('reveals the correct tab and focuses the real enabled field', () => {
    renderPanel([annahmenIssue()])
    const link = document.querySelector('.validation-summary a[href="#insurance-rates-kvGeneralRate"]') as HTMLAnchorElement
    fireEvent.click(link)
    expect(document.getElementById('input-tabpanel-annahmen')).toBeVisible()
    expect(document.activeElement).toBe(document.getElementById('insurance-rates-kvGeneralRate'))
  })

  it('opens nested estimator disclosures before focusing the inner rate', () => {
    const issue: ScenarioIssue = {
      code: 'test.vermoegen.basis',
      fieldPath: 'retirementInsurance.capitalEstimator',
      fieldId: 'estimator-projectedBasisRate',
      section: 'vermoegen',
      kind: 'missing',
      message: 'Basiszins prüfen',
    }
    renderPanel([issue])
    fireEvent.click(screen.getByRole('tab', { name: /Vermögen/ }))
    const details = document.getElementById('estimator-details') as HTMLDetailsElement | null
    if (details) details.open = false
    const inner = Array.from(document.querySelectorAll('#estimator-details details')) as HTMLDetailsElement[]
    inner.forEach(element => { element.open = false })
    const link = document.querySelector('.validation-summary a[href="#estimator-projectedBasisRate"]') as HTMLAnchorElement
    fireEvent.click(link)
    expect(document.getElementById('input-tabpanel-vermoegen')).toBeVisible()
    expect(document.activeElement).toBe(document.getElementById('estimator-projectedBasisRate'))
  })

  it('next action follows authoritative issue order without reordering missing vs invalid', () => {
    const first: ScenarioIssue = { code: 'test.plan.first', fieldPath: 'retirementAge', fieldId: 'retirementAge', section: 'zeitplan', kind: 'invalid', message: 'Erste ungültige Angabe' }
    const second: ScenarioIssue = { code: 'test.plan.second', fieldPath: 'currentAge', fieldId: 'currentAge', section: 'zeitplan', kind: 'missing', message: 'Zweite offene Angabe' }
    expect(nextOpenPoint('plan', [first, second])).toBe(first)
    expect(issuesForTab('plan', [first, second])).toEqual([first, second])
    renderPanel([first, second])
    const planPanel = document.getElementById('input-tabpanel-plan')!
    fireEvent.click(within(planPanel).getByRole('button', { name: /Nächster offener Punkt/ }))
    expect(document.activeElement).toBe(document.getElementById('retirementAge'))
  })

  it('expands the bridge checklist and focuses the bridgeOnly target after render', async () => {
    const { insuredInput } = await import('../../model/__tests__/insuranceFixtures')
    const { defaultCoverageAnswers } = await import('../../model/insuranceCoverage')
    const input = insuredInput({ currentAge: 60, retirementAge: 65, planningAge: 90 })
    const state = createDefaultState()
    const buckets = createDefaultPortfolioBuckets(input.currentCapital, DEFAULT_ASSET_ALLOCATION)
    const issue: ScenarioIssue = {
      code: 'coverage.bridge.bridgeOnly',
      fieldPath: 'insuranceCoverageAnswers.bridge.bridgeOnly',
      fieldId: 'insurance-bridge-bridgeOnly',
      section: 'versicherung',
      kind: 'missing',
      message: 'Brücke: Zusätzliche Umstände beantworten.',
    }
    render(
      <InputPanel
        input={input}
        issues={[issue]}
        allocation={DEFAULT_ASSET_ALLOCATION}
        portfolioBuckets={buckets}
        retirementIncomeStreams={input.retirementIncomeStreams ?? []}
        historical={state.historical}
        historicalValidYears={[]}
        errors={{}}
        allocationError={null}
        portfolioBucketError={null}
        insuranceCoverageAnswers={defaultCoverageAnswers()}
        onRetirementInsuranceChange={noop}
        onChange={noop}
        onPortfolioBucketChange={noop}
        onPortfolioBucketAdd={noop}
        onPortfolioBucketRemove={noop}
        onRetirementIncomeStreamChange={noop}
        onRetirementIncomeStreamAdd={noop}
        onRetirementIncomeStreamRemove={noop}
        onInflationSourceChange={noop}
        onSimulationsChange={noop}
        onReset={noop}
      />,
    )
    const link = document.querySelector('.validation-summary a[href="#insurance-bridge-bridgeOnly"]') as HTMLAnchorElement
    expect(link).not.toBeNull()
    fireEvent.click(link)
    await waitFor(() => {
      expect(document.getElementById('input-tabpanel-versicherung')).toBeVisible()
      expect(document.getElementById('insurance-bridge-bridgeOnly')).not.toBeNull()
    })
    await waitFor(() => {
      expect(document.activeElement).toBe(document.getElementById('insurance-bridge-bridgeOnly'))
    })
  })
})

describe('truthful stale and disabled handling', () => {
  it('reports a stale target without stealing field focus', () => {
    renderPanel([{ code: 'test.stale', fieldPath: 'currentAge', fieldId: 'does-not-exist-anywhere', section: 'zeitplan', kind: 'missing', message: 'Veralteter Punkt' }])
    const link = document.querySelector('.validation-summary a[href="#does-not-exist-anywhere"]') as HTMLAnchorElement
    fireEvent.click(link)
    expect(document.body.textContent).toMatch(/derzeit nicht verfügbar/)
    expect(document.body.textContent).toMatch(/zugeh.+rige Abschnitt|Ziel/)
    expect(document.activeElement?.tagName).not.toBe('A')
  })

  it('does not focus a disabled control and reports it truthfully', () => {
    document.body.innerHTML = '<input id="disabled-field" disabled value="" />'
    const before = document.activeElement
    const result = revealAndFocusTarget('disabled-field')
    expect(result.status).toBe('unactionable')
    expect(document.activeElement).toBe(before)
  })

  it('does not scroll or focus when the target is absent', () => {
    const spy = vi.mocked(Element.prototype.scrollIntoView)
    spy.mockClear()
    const result = revealAndFocusTarget('missing-target-without-fallback')
    expect(result.status).toBe('stale')
    expect(spy).not.toHaveBeenCalled()
  })

  it('scrollPanelToStart keeps focus where it is', () => {
    renderPanel([])
    const tab = screen.getByRole('tab', { name: /Vermögen/ })
    tab.focus()
    scrollPanelToStart('plan')
    expect(document.activeElement).toBe(tab)
  })
})

describe('reduced motion', () => {
  it('uses automatic scrolling when reduced motion is preferred', () => {
    document.body.innerHTML = '<input id="motion-field" value="" />'
    const originalMatchMedia = window.matchMedia
    Object.defineProperty(window, 'matchMedia', {
      value: vi.fn().mockReturnValue({ matches: true, addEventListener: noop, removeEventListener: noop }),
      configurable: true,
    })
    try {
      const spy = vi.mocked(Element.prototype.scrollIntoView)
      spy.mockClear()
      revealAndFocusTarget('motion-field')
      expect(spy).toHaveBeenCalled()
      const options = spy.mock.calls[0]?.[0] as ScrollIntoViewOptions | undefined
      expect(options?.behavior).toBe('auto')
      expect(options?.block).toBe('start')
    } finally {
      Object.defineProperty(window, 'matchMedia', { value: originalMatchMedia, configurable: true })
    }
  })
})
