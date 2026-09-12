/** Open every disclosure before focusing the real control, including nested details. */
export function focusField(id: string, fallback?: string) {
  const target = document.getElementById(id) ?? (fallback ? document.getElementById(fallback) : null)
  if (!target) return
  let parent = target.parentElement
  while (parent) {
    if (parent instanceof HTMLDetailsElement) parent.open = true
    parent = parent.parentElement
  }
  target.focus()
  target.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
}
