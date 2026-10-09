import { z } from 'zod'

// One-time allocation at the end of the first retirement year (Arbeitsende).
// Pure, framework-free target resolver shared by every ledger entrypoint.
// Ledger rows stay the source of truth; this module owns no React, storage or charts.

export const SUPPORTED_ALLOCATION_ELIGIBILITY = [
  'accumulating-equity-fund',
  'ordinary-bank-deposit',
] as const
export type SupportedAllocationEligibility = (typeof SUPPORTED_ALLOCATION_ELIGIBILITY)[number]

export function isSupportedAllocationEligibility(value: unknown): value is SupportedAllocationEligibility {
  return value === 'accumulating-equity-fund' || value === 'ordinary-bank-deposit'
}

const money = z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER)

export const allocationFixedTargetSchema = z.object({
  bucketId: z.string().min(1),
  amountToday: money,
})

/** Accepted one-time targets in today's euros. Remainder weights are shares that
 * are normalized; absent/empty weights split the remainder equally across all
 * declared supported buckets (including zero-balance destinations). The same
 * bucket may receive both a fixed amount and a remainder share. */
export const allocationAtRetirementSchema = z.object({
  enabled: z.boolean(),
  accepted: z.boolean(),
  fixedTargets: z.array(allocationFixedTargetSchema).default([]),
  remainderWeights: z.record(z.string(), z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER)).optional(),
})
export type AllocationAtRetirement = z.infer<typeof allocationAtRetirementSchema>
export type AllocationFixedTarget = z.infer<typeof allocationFixedTargetSchema>

export type AllocationBucketView = {
  id: string
  eligibility: SupportedAllocationEligibility
}

export type AllocationDraft = {
  enabled: boolean
  accepted: boolean
  fixedTargets: { bucketId: string; amountToday: number }[]
  remainderWeights: Record<string, number>
}

/** Draft validation against the declared buckets. Dangling entries (deleted or
 * reclassified-to-unsupported destinations) are preserved for repair, never
 * silently dropped or redistributed. */
export type AllocationFieldIssue = { fieldId: string; bucketId: string; message: string }

export function validateAllocationDraft(
  buckets: readonly { id: string; holding?: string }[],
  draft: AllocationDraft | undefined,
): { clean: boolean; danglingIds: string[]; problems: string[]; fieldIssues: AllocationFieldIssue[] } {
  if (!draft) return { clean: true, danglingIds: [], problems: [], fieldIssues: [] }
  const problems: string[] = []
  const fieldIssues: AllocationFieldIssue[] = []
  const dangling = new Set<string>()
  const byId = new Map(buckets.map(b => [b.id, b]))
  const supported = (id: string) => {
    const bucket = byId.get(id)
    return !!bucket && isSupportedAllocationEligibility(bucket.holding)
  }
  for (const target of draft.fixedTargets) {
    if (!target.bucketId || !byId.has(target.bucketId) || !supported(target.bucketId)) {
      dangling.add(target.bucketId)
      const message = `Festbetragsziel „${target.bucketId}“ verweist auf eine entfernte oder nicht unterstützte Anlage. Ziel entfernen, dann erneut übernehmen — oder zurücksetzen/deaktivieren.`
      problems.push(message)
      fieldIssues.push({ fieldId: `allocation-dangling-${target.bucketId}`, bucketId: target.bucketId, message })
    } else if (!Number.isFinite(target.amountToday) || target.amountToday < 0) {
      const message = `Festbetragsziel „${target.bucketId}“ benötigt einen nicht negativen Eurobetrag in heutiger Kaufkraft.`
      problems.push(message)
      fieldIssues.push({ fieldId: `allocation-fixed-${target.bucketId}`, bucketId: target.bucketId, message })
    }
  }
  for (const [id, weight] of Object.entries(draft.remainderWeights)) {
    if (!byId.has(id) || !supported(id)) {
      dangling.add(id)
      const message = `Restanteil „${id}“ verweist auf eine entfernte oder nicht unterstützte Anlage. Ziel entfernen, dann erneut übernehmen — oder zurücksetzen/deaktivieren.`
      problems.push(message)
      fieldIssues.push({ fieldId: `allocation-dangling-${id}`, bucketId: id, message })
    } else if (!Number.isFinite(weight) || weight < 0) {
      const message = `Restanteil „${id}“ benötigt ein nicht negatives Gewicht.`
      problems.push(message)
      fieldIssues.push({ fieldId: `allocation-weight-${id}`, bucketId: id, message })
    }
  }
  const supportedCount = buckets.filter(b => isSupportedAllocationEligibility(b.holding)).length
  if (supportedCount === 0) problems.push('Keine unterstützte Anlage für die Umschichtung vorhanden.')
  return { clean: problems.length === 0, danglingIds: [...dangling], problems, fieldIssues }
}

/** Prefill a draft from current starting balances: no fixed amounts, remainder
 * weights equal to starting shares (zero-balance supported buckets get zero).
 * Never enables or accepts implicitly; the user edits then explicitly accepts. */
export function prefillAllocationDraft(
  buckets: readonly { id: string; value: number; holding?: string }[],
): AllocationDraft {
  const supported = buckets.filter(b => isSupportedAllocationEligibility(b.holding))
  const total = supported.reduce((sum, b) => sum + (Number.isFinite(b.value) && b.value > 0 ? b.value : 0), 0)
  const remainderWeights: Record<string, number> = {}
  for (const bucket of supported) {
    const value = Number.isFinite(bucket.value) && bucket.value > 0 ? bucket.value : 0
    remainderWeights[bucket.id] = total > 0 ? value / total : 0
  }
  return { enabled: false, accepted: false, fixedTargets: [], remainderWeights }
}

export type AllocationTargetsInput = {
  /** Net wealth after funding sales and any trial deposit (>= 0). */
  netWealth: number
  /** Event-year inflation factor scaling today's-euro fixed amounts. */
  inflationFactor: number
  buckets: readonly AllocationBucketView[]
  fixedTargets: readonly { bucketId: string; amountToday: number }[]
  remainderWeights?: Record<string, number>
}

/** Resolve absolute per-bucket targets T(B). Fixed today's-euro amounts fill
 * sequentially in priority order against remaining wealth; the leftover remainder
 * is split by accepted nonnegative weights (same bucket may receive both).
 * Undefined or all-zero weights split the remainder equally across ALL declared
 * supported buckets, including zero-balance destinations. Supported zero-balance
 * destinations may receive purchases. A zero base resolves zero targets (it must
 * not throw just because wealth is depleted); only a genuinely negative base or
 * an invalid declaration throws. Each bucket target is nondecreasing in B. */
export function resolveAllocationTargets(input: AllocationTargetsInput): { id: string; target: number }[] {
  const { netWealth: wealth, inflationFactor, buckets, fixedTargets, remainderWeights } = input
  if (!Number.isFinite(wealth) || wealth < 0) throw new Error('Umschichtungsbasis muss nicht negativ und endlich sein.')
  if (!Number.isFinite(inflationFactor) || inflationFactor <= 0) throw new Error('Inflationsfaktor der Umschichtung muss positiv und endlich sein.')
  if (!buckets.length) throw new Error('Umschichtung benötigt mindestens eine unterstützte Anlage.')
  const seen = new Set<string>()
  for (const bucket of buckets) {
    if (!bucket.id || seen.has(bucket.id)) throw new Error('Umschichtung benötigt eindeutige Anlagekennungen.')
    seen.add(bucket.id)
    if (!isSupportedAllocationEligibility(bucket.eligibility))
      throw new Error(`Umschichtung unterstützt nur thesaurierende Aktienfonds und gewöhnliche Bankeinlagen (Anlage „${bucket.id}“).`)
  }
  const base = money.parse(wealth)
  const targets = new Map<string, number>(buckets.map(b => [b.id, 0]))
  // The pure operation validates the full declared spec itself — callers must
  // not be trusted to pre-filter. Unknown remainder ids, non-finite/negative
  // weights and duplicate fixed entries throw here instead of being silently
  // ignored or redistributed. Undefined or all-zero weights are the only
  // fallback to an equal split across ALL declared supported buckets.
  if (remainderWeights !== undefined) {
    for (const [id, weight] of Object.entries(remainderWeights)) {
      if (!targets.has(id)) throw new Error(`Restanteil „${id}“ verweist auf eine unbekannte Anlage.`)
      if (!Number.isFinite(weight) || weight < 0)
        throw new Error(`Restanteil „${id}“ benötigt ein nicht negatives, endliches Gewicht.`)
    }
  }
  let remaining = base
  const seenFixed = new Set<string>()
  for (const fixed of fixedTargets) {
    if (!targets.has(fixed.bucketId)) throw new Error(`Festbetragsziel „${fixed.bucketId}“ verweist auf eine unbekannte Anlage.`)
    if (seenFixed.has(fixed.bucketId)) throw new Error(`Festbetragsziel „${fixed.bucketId}“ ist doppelt vergeben; Beträge je Anlage bitte zusammenfassen.`)
    seenFixed.add(fixed.bucketId)
    if (!Number.isFinite(fixed.amountToday) || fixed.amountToday < 0)
      throw new Error(`Festbetragsziel „${fixed.bucketId}“ benötigt einen nicht negativen Eurobetrag.`)
    const nominal = money.parse(fixed.amountToday * inflationFactor)
    const allocated = Math.min(remaining, nominal)
    targets.set(fixed.bucketId, targets.get(fixed.bucketId)! + allocated)
    remaining = money.parse(remaining - allocated)
  }
  const remainder = money.parse(remaining)
  const entries = buckets.map(b => ({
    id: b.id,
    weight: remainderWeights?.[b.id] ?? NaN,
  }))
  const defined = remainderWeights !== undefined
  const weightSum = defined
    ? entries.reduce((sum, e) => sum + (Number.isFinite(e.weight) && e.weight > 0 ? e.weight : 0), 0)
    : 0
  const useEqual = !defined || weightSum <= 0
  for (const entry of entries) {
    if (remainder <= 0) break
    const share = useEqual
      ? remainder / entries.length
      : remainder * (Number.isFinite(entry.weight) && entry.weight > 0 ? entry.weight : 0) / weightSum
    targets.set(entry.id, money.parse(targets.get(entry.id)! + share))
  }
  return buckets.map(b => ({ id: b.id, target: targets.get(b.id)! }))
}

/** Marginal purchases T(B + additional) − T(B) for conserving the bounded
 * pension-rounding excess across partially funded fixed priorities. Every marginal target is
 * nonnegative because each bucket target is nondecreasing in wealth; the
 * marginal targets sum to the additional amount. Purchases only, never sales. */
export function marginalTargetsForAdditionalWealth(
  input: AllocationTargetsInput & { baseWealth: number; additionalWealth: number },
): { id: string; additional: number }[] {
  const { baseWealth, additionalWealth, ...rest } = input
  if (!Number.isFinite(baseWealth) || baseWealth < 0) throw new Error('Umschichtungsbasis muss nicht negativ und endlich sein.')
  if (!Number.isFinite(additionalWealth) || additionalWealth < 0)
    throw new Error('Zusatzbetrag der Umschichtung muss nicht negativ und endlich sein.')
  const base = resolveAllocationTargets({ ...rest, netWealth: baseWealth })
  const grown = resolveAllocationTargets({ ...rest, netWealth: money.parse(baseWealth + additionalWealth) })
  return grown.map(g => {
    const marginal = g.target - base.find(b => b.id === g.id)!.target
    if (marginal < -1e-9) throw new Error('Umschichtungsziele müssen mit dem Vermögen monoton wachsen.')
    return { id: g.id, additional: Math.max(0, marginal) }
  })
}
