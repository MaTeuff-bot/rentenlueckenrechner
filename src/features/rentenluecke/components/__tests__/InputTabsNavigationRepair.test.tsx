// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor, within, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { DEFAULT_INPUT } from '../../model/defaults'
import { DEFAULT_ASSET_ALLOCATION } from '../../model/stochasticReturns'
import { createDefaultPortfolioBuckets } from '../../model/portfolioBuckets'
import { createDefaultRetirementIncomeStreams } from '../../model/retirementIncomeStreams'
import { createDefaultState } from '../../hooks/scenarioState/defaults'
import type { ScenarioIssue } from '../../model/scenarioIssues'
import { InputPanel } from '../InputPanel'
import {
  isActionableTarget,
  needsCoverageExpansion,
  requestCoverageExpansion,
  revealAndFocusTarget,
  stickyClearanceForHeight,
  updateStickyTabsClearance,
  installStickyTabsClearance,
} from '../inputNavigation'

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

function planIssue(fieldId: string, kind: ScenarioIssue['kind'] = 'missing'): ScenarioIssue {
  return { code: `repair.plan.${fieldId}`, fieldPath: 'currentAge', fieldId, section: 'zeitplan', kind, message: `Plan ${fieldId}` }
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
  document.documentElement.style.removeProperty('--input-tabs-clearance')
})

describe('navigation request lifecycle', () => {
  it('same-tab explicit then ordinary switch scrolls the new panel without leftover suppression', async () => {
    renderPanel([planIssue('currentAge'), planIssue('retirementAge')])
    const spy = vi.mocked(Element.prototype.scrollIntoView)
    spy.mockClear()
    fireEvent.click(document.querySelector('.validation-summary a[href="#currentAge"]') as HTMLAnchorElement)
    expect(document.activeElement).toBe(document.getElementById('currentAge'))
    spy.mockClear()
    fireEvent.click(screen.getByRole('tab', { name: /Vermögen/ }))
    expect(document.getElementById('input-tabpanel-vermoegen')).toBeVisible()
    expect(spy).toHaveBeenCalled()
    expect(document.querySelector('.navigation-status')).toBeNull()
    spy.mockClear()
    fireEvent.click(screen.getByRole('tab', { name: /Persönlicher Plan/ }))
    expect(document.getElementById('input-tabpanel-plan')).toBeVisible()
    expect(spy).toHaveBeenCalled()
  })

  it('rapid second explicit cancels the first pending request', async () => {
    renderPanel([planIssue('currentAge'), planIssue('retirementAge')])
    fireEvent.click(document.querySelector('.validation-summary a[href="#currentAge"]') as HTMLAnchorElement)
    expect(document.activeElement).toBe(document.getElementById('currentAge'))
    fireEvent.click(document.querySelector('.validation-summary a[href="#retirementAge"]') as HTMLAnchorElement)
    expect(document.activeElement).toBe(document.getElementById('retirementAge'))
    expect(document.activeElement).not.toBe(document.getElementById('currentAge'))
    expect(document.querySelector('.navigation-status')).toBeNull()
  })

  it('ordinary switch before the expansion retry prevents stale focus', async () => {
    const { insuredInput } = await import('../../model/__tests__/insuranceFixtures')
    const { defaultCoverageAnswers } = await import('../../model/insuranceCoverage')
    const input = insuredInput({ currentAge: 60, retirementAge: 65, planningAge: 90 })
    const state = createDefaultState()
    const buckets = createDefaultPortfolioBuckets(input.currentCapital, DEFAULT_ASSET_ALLOCATION)
    const bridgeIssue: ScenarioIssue = {
      code: 'coverage.bridge.bridgeOnly',
      fieldPath: 'insuranceCoverageAnswers.bridge.bridgeOnly',
      fieldId: 'insurance-bridge-bridgeOnly',
      section: 'versicherung',
      kind: 'missing',
      message: 'Brücke beantworten.',
    }
    render(
      <InputPanel
        input={input}
        issues={[bridgeIssue]}
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
    const spy = vi.mocked(Element.prototype.scrollIntoView)
    fireEvent.click(document.querySelector('.validation-summary a[href="#insurance-bridge-bridgeOnly"]') as HTMLAnchorElement)
    await waitFor(() => {
      expect(document.activeElement?.id).toBe('insurance-bridge-bridgeOnly')
    })
    spy.mockClear()
    fireEvent.click(screen.getByRole('tab', { name: /Persönlicher Plan/ }))
    expect(document.getElementById('input-tabpanel-plan')).toBeVisible()
    expect(spy).toHaveBeenCalled()
    expect(document.querySelector('.navigation-status')).toBeNull()
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 120))
    })
    expect(document.getElementById('input-tabpanel-plan')).toBeVisible()
  })
})

describe('truthful stale targets without fallback focus', () => {
  it('never focuses the unrelated currentAge anchor for a stale link', () => {
    renderPanel([{ code: 'repair.stale', fieldPath: 'currentAge', fieldId: 'does-not-exist-repair', section: 'zeitplan', kind: 'missing', message: 'Veraltet' }])
    const spy = vi.mocked(Element.prototype.scrollIntoView)
    spy.mockClear()
    fireEvent.click(document.querySelector('.validation-summary a[href="#does-not-exist-repair"]') as HTMLAnchorElement)
    expect(document.getElementById('currentAge')).not.toBeNull()
    expect(document.activeElement).not.toBe(document.getElementById('currentAge'))
    expect(document.activeElement?.id).not.toBe('currentAge')
    expect(spy).not.toHaveBeenCalled()
    expect(document.body.textContent).toMatch(/derzeit nicht verfügbar/)
  })

  it('treats CSS-hidden, disabled, and inert targets as unactionable without focus or scroll', () => {
    document.body.innerHTML = [
      '<input id="css-none" value="" style="display: none" />',
      '<input id="css-hidden" value="" style="visibility: hidden" />',
      '<div inert><input id="inert-child" value="" /></div>',
      '<input id="hidden-type" type="hidden" value="" />',
      '<input id="disabled-attr" disabled value="" />',
    ].join('')
    const before = document.activeElement
    const spy = vi.mocked(Element.prototype.scrollIntoView)
    for (const id of ['css-none', 'css-hidden', 'inert-child', 'hidden-type', 'disabled-attr']) {
      spy.mockClear()
      const target = document.getElementById(id)
      expect(isActionableTarget(target)).toBe(false)
      const result = revealAndFocusTarget(id)
      expect(result.status).toBe('unactionable')
      expect(result.fallbackUsed).toBe(false)
      expect(document.activeElement).toBe(before)
      expect(spy).not.toHaveBeenCalled()
    }
  })

  it('requires real focus even for plain elements without tabindex', () => {
    document.body.innerHTML = '<div id="plain-div">x</div>'
    const before = document.activeElement
    const spy = vi.mocked(Element.prototype.scrollIntoView)
    spy.mockClear()
    const result = revealAndFocusTarget('plain-div')
    expect(result.status).toBe('unactionable')
    expect(result.fallbackUsed).toBe(false)
    expect(document.activeElement).toBe(before)
    expect(spy).not.toHaveBeenCalled()
  })

  it('accepts a real focusable section anchor when it can take focus', () => {
    document.body.innerHTML = '<section id="focusable-section" tabindex="-1">Abschnitt</section>'
    const spy = vi.mocked(Element.prototype.scrollIntoView)
    spy.mockClear()
    const target = document.getElementById('focusable-section')
    expect(isActionableTarget(target)).toBe(true)
    const result = revealAndFocusTarget('focusable-section')
    expect(result.status).toBe('found')
    expect(document.activeElement).toBe(target)
    expect(spy).toHaveBeenCalled()
  })
})

describe('next chooses the current actionable issue', () => {
  it('skips a stale first target and focuses the next actionable input', () => {
    renderPanel([
      { code: 'repair.first-stale', fieldPath: 'currentAge', fieldId: 'does-not-exist-first', section: 'zeitplan', kind: 'missing', message: 'Veraltet zuerst' },
      planIssue('currentAge', 'missing'),
    ])
    const planPanel = document.getElementById('input-tabpanel-plan')!
    fireEvent.click(within(planPanel).getByRole('button', { name: /Nächster offener Punkt/ }))
    expect(document.activeElement).toBe(document.getElementById('currentAge'))
    expect(document.activeElement?.id).not.toBe('does-not-exist-first')
    expect(document.querySelector('.navigation-status')).toBeNull()
  })

  it('skips a disabled first target without fallback focus', () => {
    document.body.innerHTML = '<input id="real-second" value="" />'
    renderPanel([
      { code: 'repair.disabled-first', fieldPath: 'currentAge', fieldId: 'css-none-repair', section: 'zeitplan', kind: 'invalid', message: 'Deaktiviert zuerst' },
      planIssue('currentAge', 'missing'),
    ])
    const hidden = document.createElement('input')
    hidden.id = 'css-none-repair'
    hidden.setAttribute('style', 'display: none')
    document.body.appendChild(hidden)
    const planPanel = document.getElementById('input-tabpanel-plan')!
    fireEvent.click(within(planPanel).getByRole('button', { name: /Nächster offener Punkt/ }))
    expect(document.activeElement).toBe(document.getElementById('currentAge'))
  })
})

describe('targeted coverage expansion', () => {
  it('only exception-related insurance ids request expansion', () => {
    expect(needsCoverageExpansion('insurance-bridge-bridgeOnly')).toBe(true)
    expect(needsCoverageExpansion('insurance-bridge-bridgeOnly-pension-applicant')).toBe(true)
    expect(needsCoverageExpansion('insurance-bridge-circumstances')).toBe(true)
    expect(needsCoverageExpansion('insurance-bridge-circumstances-krankengeld')).toBe(true)
    expect(needsCoverageExpansion('insurance-pension-circumstances')).toBe(true)
    expect(needsCoverageExpansion('insurance-pension-circumstances-krankengeld')).toBe(true)
    expect(needsCoverageExpansion('insurance-bridge-status')).toBe(false)
    expect(needsCoverageExpansion('insurance-bridge-manual')).toBe(false)
    expect(needsCoverageExpansion('insurance-bridge-kvMonthlyToday')).toBe(false)
    expect(needsCoverageExpansion('insurance-pension-status')).toBe(false)
    expect(needsCoverageExpansion('estimator-fundAcquisitionCost')).toBe(false)
    const seen: string[] = []
    const listener = (event: Event) => seen.push((event as CustomEvent<string>).detail)
    window.addEventListener('renten:expand-coverage', listener)
    try {
      requestCoverageExpansion('insurance-bridge-status')
      requestCoverageExpansion('insurance-bridge-manual')
      expect(seen).toEqual([])
      requestCoverageExpansion('insurance-bridge-bridgeOnly')
      expect(seen).toEqual(['insurance-bridge-bridgeOnly'])
    } finally {
      window.removeEventListener('renten:expand-coverage', listener)
    }
  })

  it('bridge status navigation does not open the exceptions disclosure or mutate answers', async () => {
    const { insuredInput } = await import('../../model/__tests__/insuranceFixtures')
    const { defaultCoverageAnswers } = await import('../../model/insuranceCoverage')
    const input = insuredInput({ currentAge: 60, retirementAge: 65, planningAge: 90 })
    const state = createDefaultState()
    const buckets = createDefaultPortfolioBuckets(input.currentCapital, DEFAULT_ASSET_ALLOCATION)
    const onCoverageChange = vi.fn()
    const answers = defaultCoverageAnswers()
    render(
      <InputPanel
        input={input}
        issues={[]}
        allocation={DEFAULT_ASSET_ALLOCATION}
        portfolioBuckets={buckets}
        retirementIncomeStreams={input.retirementIncomeStreams ?? []}
        historical={state.historical}
        historicalValidYears={[]}
        errors={{}}
        allocationError={null}
        portfolioBucketError={null}
        insuranceCoverageAnswers={answers}
        onInsuranceCoverageChange={onCoverageChange}
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
    fireEvent.click(screen.getByRole('tab', { name: /Versicherung/ }))
    expect(document.querySelector('.coverage-exceptions')).toBeNull()
    requestCoverageExpansion('insurance-bridge-status')
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    expect(document.querySelector('.coverage-exceptions')).toBeNull()
    expect(onCoverageChange).not.toHaveBeenCalled()
    requestCoverageExpansion('insurance-bridge-bridgeOnly')
    await waitFor(() => {
      expect(document.querySelector('.coverage-exceptions')).not.toBeNull()
    })
    expect(onCoverageChange).not.toHaveBeenCalled()
    expect(document.querySelectorAll('.insurance-block')).toHaveLength(4)
  })
})

describe('measured sticky clearance', () => {
  it('derives clearance from the real bar height plus gap', () => {
    expect(stickyClearanceForHeight(200, 16)).toBe('216px')
    expect(stickyClearanceForHeight(0, 16)).toBe('16px')
    const bar = document.createElement('div')
    bar.className = 'input-tabs'
    document.body.appendChild(bar)
    vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue({ height: 184, width: 360, top: 0, bottom: 184, left: 0, right: 360, x: 0, y: 0, toJSON: () => ({}) })
    const value = updateStickyTabsClearance(bar, 16)
    expect(value).toBe('200px')
    expect(document.documentElement.style.getPropertyValue('--input-tabs-clearance')).toBe('200px')
  })

  it('installs a cleanup that removes listeners', () => {
    const bar = document.createElement('div')
    document.body.appendChild(bar)
    vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue({ height: 50, width: 100, top: 0, bottom: 50, left: 0, right: 100, x: 0, y: 0, toJSON: () => ({}) })
    const cleanup = installStickyTabsClearance(bar, 16)
    expect(document.documentElement.style.getPropertyValue('--input-tabs-clearance')).toBe('66px')
    expect(typeof cleanup).toBe('function')
    cleanup()
  })
})
