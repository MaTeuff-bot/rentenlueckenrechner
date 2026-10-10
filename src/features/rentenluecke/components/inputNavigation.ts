export type RevealStatus = 'found' | 'stale' | 'unactionable'

export type RevealResult = {
  status: RevealStatus
  targetId: string | null
  fallbackUsed: boolean
}

export const COVERAGE_EXPAND_EVENT = 'renten:expand-coverage'

export const STICKY_CLEARANCE_VAR = '--input-tabs-clearance'
export const STICKY_CLEARANCE_GAP_PX = 16

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? 'auto' : 'smooth'
}

export function stickyClearanceForHeight(barHeight: number, gap: number = STICKY_CLEARANCE_GAP_PX): string {
  return `${Math.max(0, Math.ceil(barHeight + gap))}px`
}

export function updateStickyTabsClearance(bar: HTMLElement, gap: number = STICKY_CLEARANCE_GAP_PX): string {
  const height = bar.getBoundingClientRect().height
  const value = stickyClearanceForHeight(height, gap)
  const root = document.documentElement
  if (root && root.style) root.style.setProperty(STICKY_CLEARANCE_VAR, value)
  return value
}

export function installStickyTabsClearance(bar: HTMLElement, gap: number = STICKY_CLEARANCE_GAP_PX): () => void {
  updateStickyTabsClearance(bar, gap)
  const rerun = () => updateStickyTabsClearance(bar, gap)
  let observer: ResizeObserver | null = null
  try {
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(rerun)
      observer.observe(bar)
    }
  } catch {
    observer = null
  }
  window.addEventListener('resize', rerun)
  window.addEventListener('orientationchange', rerun)
  return () => {
    try {
      observer?.disconnect()
    } catch {
      return
    }
    window.removeEventListener('resize', rerun)
    window.removeEventListener('orientationchange', rerun)
  }
}

function openContainingDisclosures(target: Element): void {
  let parent = target.parentElement
  while (parent) {
    if (parent instanceof HTMLDetailsElement && !parent.open) parent.open = true
    parent = parent.parentElement
  }
}

function hasHiddenAttributeChain(target: Element): boolean {
  let current: Element | null = target
  while (current) {
    if (current instanceof HTMLElement && current.hidden) return true
    if (current.hasAttribute('hidden')) return true
    current = current.parentElement
  }
  return false
}

function hasInertChain(target: Element): boolean {
  let current: Element | null = target
  while (current) {
    if (current.hasAttribute('inert')) return true
    const inertProp = (current as unknown as { inert?: unknown }).inert
    if (inertProp === true) return true
    current = current.parentElement
  }
  return false
}

function hasConcealingStyle(target: Element): boolean {
  if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') return false
  try {
    let current: Element | null = target
    while (current) {
      if (current instanceof HTMLElement) {
        const style = window.getComputedStyle(current)
        if (style.display === 'none') return true
        if (style.visibility === 'hidden' || style.visibility === 'collapse') return true
      }
      current = current.parentElement
    }
  } catch {
    return false
  }
  return false
}

function isDisabledTarget(target: Element): boolean {
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLButtonElement
  ) {
    if (target.disabled) return true
  }
  if (target instanceof HTMLInputElement && target.type === 'hidden') return true
  if (target.getAttribute('aria-disabled') === 'true') return true
  if (target.closest('fieldset[disabled]')) return true
  return false
}

export function isActionableTarget(target: Element | null): boolean {
  if (!target) return false
  if (typeof document !== 'undefined' && !target.isConnected) return false
  if (hasHiddenAttributeChain(target)) return false
  if (hasInertChain(target)) return false
  if (isDisabledTarget(target)) return false
  if (hasConcealingStyle(target)) return false
  return true
}

export function needsCoverageExpansion(fieldId: string): boolean {
  return (
    fieldId === 'insurance-bridge-circumstances' ||
    fieldId.startsWith('insurance-bridge-circumstances-') ||
    fieldId === 'insurance-bridge-bridgeOnly' ||
    fieldId.startsWith('insurance-bridge-bridgeOnly-') ||
    fieldId === 'insurance-pension-circumstances' ||
    fieldId.startsWith('insurance-pension-circumstances-')
  )
}

export function requestCoverageExpansion(fieldId: string): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  if (!needsCoverageExpansion(fieldId)) return
  window.dispatchEvent(new CustomEvent<string>(COVERAGE_EXPAND_EVENT, { detail: fieldId }))
}

function focusWithoutScroll(target: Element): void {
  if (target instanceof HTMLElement && typeof target.focus === 'function') {
    try {
      target.focus({ preventScroll: true })
    } catch {
      target.focus()
    }
  }
}

export function scrollAnchorForTarget(target: Element): Element {
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement
  ) {
    const field = target.closest('.field')
    if (field) return field
  }
  return target
}

function scrollAnchorIntoView(anchor: Element): void {
  try {
    anchor.scrollIntoView?.({ block: 'start', inline: 'nearest', behavior: scrollBehavior() })
  } catch {
    anchor.scrollIntoView?.()
  }
}

/**
 * Reveal the real control (open containing disclosures) and focus it.
 * Only the current real enabled target counts as success: missing, hidden
 * (including CSS display:none/visibility, inert, hidden inputs), disabled, or
 * unfocusable targets never steal focus or scroll. The legacy fallback
 * parameter is intentionally ignored so stale links cannot masquerade as
 * successful navigation by focusing an unrelated section anchor.
 * Form controls scroll via their labelled `.field` wrapper so the visible
 * label clears the sticky bar together with the control; the real control is
 * focused with preventScroll first (unfocusable targets never scroll) and only
 * then is the contextual anchor scrolled. Block and fieldset targets scroll directly.
 */
export function revealAndFocusTarget(id: string, _fallback?: string): RevealResult {
  void _fallback
  if (typeof document === 'undefined') return { status: 'stale', targetId: null, fallbackUsed: false }
  const primary = document.getElementById(id)
  if (!primary) return { status: 'stale', targetId: null, fallbackUsed: false }
  openContainingDisclosures(primary)
  if (!isActionableTarget(primary)) return { status: 'unactionable', targetId: primary.id || id, fallbackUsed: false }
  focusWithoutScroll(primary)
  if (typeof document !== 'undefined' && document.activeElement !== primary) {
    return { status: 'unactionable', targetId: primary.id || id, fallbackUsed: false }
  }
  scrollAnchorIntoView(scrollAnchorForTarget(primary))
  return { status: 'found', targetId: primary.id || id, fallbackUsed: false }
}

/** Legacy entry point kept for same-tab callers; now truthful and reduced-motion aware. */
export function focusField(id: string, fallback?: string): RevealResult {
  return revealAndFocusTarget(id, fallback)
}

/** Scroll to the start of a tab panel without moving keyboard focus. */
export function scrollPanelToStart(tabId: string): boolean {
  if (typeof document === 'undefined') return false
  const panel = document.getElementById(`input-tabpanel-${tabId}`)
  const anchor = panel ?? document.querySelector(`.input-tabpanel:not([hidden]) .flow-section`)
  if (!(anchor instanceof Element)) return false
  try {
    anchor.scrollIntoView?.({ block: 'start', inline: 'nearest', behavior: scrollBehavior() })
  } catch {
    anchor.scrollIntoView?.()
  }
  return true
}
