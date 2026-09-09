import { z } from 'zod'
import { contributionRules2026 as rules } from './rules2026'

const money = z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER)
const year = z.number().int().min(1800).max(9999)
const stream = z.strictObject({ id: z.string().min(1), grossMonthly: money })
const common = {
  personId: z.string().min(1),
  phaseId: z.string().min(1),
  calendarYear: year.min(2026),
  phase: z.enum(['bridge', 'pension']),
  // Already includes all cash sources and other deductions, but NO KV/PV or DRV subsidy.
  // Assessment-only capital below must never be added to this amount by this engine.
  cashflowBeforeInsuranceMonthly: z.number().finite().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
}
const unsupportedScopeSchema = z.strictObject({
  kind: z.literal('unsupported'),
  reasons: z.array(z.string().trim().min(1)).min(1),
})
// Only the declaration is needed to route to whole-phase manual entry.
const unsupportedDeclarationSchema = z.object({
  mode: z.literal('automatic'),
  scope: unsupportedScopeSchema,
})
const automaticSchema = z.strictObject({
  ...common,
  mode: z.literal('automatic'),
  status: z.enum(['kvdr', 'voluntary', 'unknown']),
  scope: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('standard-domestic-no-employment') }),
    unsupportedScopeSchema,
  ]),
  thresholds: z.strictObject({
    monthlyCeiling: money.positive(),
    monthlyVoluntaryMinimum: money.positive(),
    monthlyOccupationalThreshold: money.positive(),
  }),
  insurerAdditionalRate: z.number().finite().min(0).max(0.2),
  rateOverrides: z.strictObject({
    kvGeneralRate: z.number().min(0).max(0.5).optional(),
    kvReducedRate: z.number().min(0).max(0.5).optional(),
    pvBaseRate: z.number().min(0.01).max(0.5).optional(),
  }).optional(),
  insuredBirthYear: year,
  family: z.strictObject({
    // Confirmed legal PV parenthood; permanent even after all children age out/die.
    isParent: z.boolean(),
    // Complete list of recognised children; twins remain separate entries.
    childBirthYears: z.array(year),
  }),
  statutoryPensions: z.array(stream),
  occupationalPensions: z.array(stream),
  // For voluntary/unknown these must be supplied, including explicit zero.
  // Pre-tax contribution-relevant amounts after allowable expenses, NOT net cash.
  rentalAssessmentMonthly: money.optional(),
  capitalAssessmentMonthly: money.optional(),
  // Required for voluntary/unknown pension phases; never infer application/receipt.
  drvSubsidy: z.enum(['confirmed', 'not-received']).optional(),
})
const manualSchema = z.strictObject({
  ...common,
  mode: z.literal('manual'),
  reason: z.string().trim().min(1),
  // Entire phase's own monthly burdens AFTER any participation/subsidy.
  kvMonthly: money,
  pvMonthly: money,
})
const contributionSchema = z.discriminatedUnion('mode', [automaticSchema, manualSchema])

export type AutomaticContributionInput = z.infer<typeof automaticSchema>
export type ManualContributionInput = z.infer<typeof manualSchema>
export type ContributionInput = AutomaticContributionInput | ManualContributionInput
export interface ContributionIssue { field: string; message: string }
export interface AssessmentLine {
  kind: 'statutory-pension' | 'occupational-pension' | 'other-income' | 'minimum-top-up'
  sourceIds: string[]
  inputMonthly: number
  kvBeforeCeilingMonthly: number
  pvBeforeCeilingMonthly: number
  kvAssessmentMonthly: number
  pvAssessmentMonthly: number
  kvRate: number
  pvRate: number
  kvContributionMonthly: number
  pvContributionMonthly: number
  explanation: string
}
interface CashResult {
  personId: string
  phaseId: string
  calendarYear: number
  phase: 'bridge' | 'pension'
  cashflowBeforeInsuranceMonthly: number
  ownKvMonthly: number
  ownPvMonthly: number
  availableIncomeMonthly: number
  explanations: string[]
}
export type ContributionResult =
  | { status: 'incomplete' | 'invalid'; issues: ContributionIssue[] }
  | { status: 'manual-required'; reasons: string[] }
  | (CashResult & { status: 'manual'; assessment: null; automaticCoverage: false })
  | (CashResult & {
    status: 'automatic'
    ruleSnapshotId: string
    thresholds: AutomaticContributionInput['thresholds']
    rentalAssessmentMonthly: number
    capitalAssessmentMonthly: number
    selectedStatus: AutomaticContributionInput['status']
    effectiveStatus: 'kvdr' | 'voluntary'
    assessment: AssessmentLine[]
    kvAssessmentMonthly: number
    pvAssessmentMonthly: number
    totalKvContributionMonthly: number
    totalPvContributionMonthly: number
    drvParticipationMonthly: number
    drvSubsidyMonthly: number
    pvSubsidyMonthly: 0
    pvRate: number
    childrenUnder25: number
  })

function valueAt(input: unknown, path: PropertyKey[]): unknown {
  return path.reduce<unknown>((value, key) => value && typeof value === 'object'
    ? (value as Record<PropertyKey, unknown>)[key] : undefined, input)
}

function validationFailure(input: unknown, error: z.ZodError): ContributionResult {
  const missingOnly = error.issues.every(issue => valueAt(input, issue.path) === undefined)
  return {
    status: missingOnly ? 'incomplete' : 'invalid',
    issues: error.issues.map(issue => ({ field: issue.path.join('.'), message: issue.message })),
  }
}

/** Pure monthly projection for one person in one explicitly selected phase/year.
 * Accepts unknown so unanswered/invalid external inputs cannot become silent zeroes.
 * No cent rounding: the authoritative ledger retains precision; presentation rounds.
 */
export function calculateContributions(input: unknown): ContributionResult {
  if (valueAt(input, ['mode']) === 'automatic' && valueAt(input, ['scope', 'kind']) === 'unsupported') {
    const declaration = unsupportedDeclarationSchema.safeParse(input)
    if (!declaration.success) return validationFailure(input, declaration.error)
    return { status: 'manual-required', reasons: declaration.data.scope.reasons }
  }
  const parsed = contributionSchema.safeParse(input)
  if (!parsed.success) return validationFailure(input, parsed.error)
  const p = parsed.data
  const commonResult = {
    personId: p.personId, phaseId: p.phaseId, calendarYear: p.calendarYear, phase: p.phase,
    cashflowBeforeInsuranceMonthly: p.cashflowBeforeInsuranceMonthly,
  }
  if (p.mode === 'manual') return {
    ...commonResult, status: 'manual', assessment: null, automaticCoverage: false,
    ownKvMonthly: p.kvMonthly, ownPvMonthly: p.pvMonthly,
    availableIncomeMonthly: p.cashflowBeforeInsuranceMonthly - p.kvMonthly - p.pvMonthly,
    explanations: [`Whole-phase manual replacement: ${p.reason}. Totals include any subsidy; no automatic assessment or subsidy is added.`],
  }
  if (p.phase === 'bridge' && (p.status === 'kvdr' || p.statutoryPensions.length > 0 || p.occupationalPensions.length > 0)) {
    return { status: 'manual-required', reasons: ['Automatic bridge supports voluntary/unknown cover without pension receipts only; pension-applicant and other bridge arrangements require whole-phase totals.'] }
  }
  const voluntary = p.status !== 'kvdr'
  const missing: ContributionIssue[] = []
  if (voluntary) {
    for (const field of ['rentalAssessmentMonthly', 'capitalAssessmentMonthly'] as const) {
      if (p[field] === undefined) missing.push({ field, message: 'Enter an assessment estimate or confirm zero.' })
    }
    if (p.phase === 'pension' && p.drvSubsidy === undefined) missing.push({ field: 'drvSubsidy', message: 'Confirm subsidy receipt or explicitly select not received.' })
  }
  if (missing.length) return { status: 'incomplete', issues: missing }
  const invalid: ContributionIssue[] = []
  const ids = [...p.statutoryPensions, ...p.occupationalPensions].map(s => s.id)
  if (new Set(ids).size !== ids.length) invalid.push({ field: 'pensions', message: 'Stream IDs must be unique.' })
  if (p.insuredBirthYear > p.calendarYear) invalid.push({ field: 'insuredBirthYear', message: 'Insured person must already be born.' })
  if (!p.family.isParent && p.family.childBirthYears.length) invalid.push({ field: 'family', message: 'Recognised children contradict childless status.' })
  if (p.family.childBirthYears.some(y => y > p.calendarYear || y < p.insuredBirthYear)) invalid.push({ field: 'family.childBirthYears', message: 'Child birth years must lie between insured birth year and calculation year.' })
  if (p.thresholds.monthlyVoluntaryMinimum > p.thresholds.monthlyCeiling || p.thresholds.monthlyOccupationalThreshold > p.thresholds.monthlyCeiling) invalid.push({ field: 'thresholds', message: 'Minimum and occupational threshold cannot exceed ceiling.' })
  if (p.phase === 'bridge' && p.drvSubsidy === 'confirmed') invalid.push({ field: 'drvSubsidy', message: 'Bridge without pension cannot receive a pension subsidy.' })
  if (invalid.length) return { status: 'invalid', issues: invalid }

  const childrenUnder25 = p.family.childBirthYears.filter(y => p.calendarYear - y < 25).length
  const surcharge = !p.family.isParent && p.insuredBirthYear >= 1940 && p.calendarYear - p.insuredBirthYear >= 23
  const discount = p.family.isParent ? Math.max(0, Math.min(5, childrenUnder25) - 1) * rules.pvDiscountPerChild : 0
  const pvRate = (p.rateOverrides?.pvBaseRate ?? rules.pvBaseRate) + (surcharge ? rules.pvChildlessSurcharge : 0) - discount
  const general = (p.rateOverrides?.kvGeneralRate ?? rules.kvGeneralRate) + p.insurerAdditionalRate
  const reduced = (p.rateOverrides?.kvReducedRate ?? rules.kvReducedRate) + p.insurerAdditionalRate
  const pension = p.statutoryPensions.reduce((sum, s) => sum + s.grossMonthly, 0)
  const occupational = p.occupationalPensions.reduce((sum, s) => sum + s.grossMonthly, 0)
  const threshold = p.thresholds.monthlyOccupationalThreshold
  const occupationalPv = voluntary || occupational > threshold ? occupational : 0
  const occupationalKv = voluntary ? occupational : Math.max(0, occupational - threshold)
  const rental = p.rentalAssessmentMonthly ?? 0
  const capital = p.capitalAssessmentMonthly ?? 0
  const other = voluntary ? rental + capital : 0
  const minimum = voluntary ? Math.max(0, p.thresholds.monthlyVoluntaryMinimum - pension - occupational - other) : 0
  let remainingKv = p.thresholds.monthlyCeiling
  let remainingPv = p.thresholds.monthlyCeiling
  const assessment: AssessmentLine[] = []
  function add(kind: AssessmentLine['kind'], sourceIds: string[], amount: number, kv: number, pv: number, rate: number, explanation: string) {
    const kvBasis = Math.min(kv, remainingKv)
    const pvBasis = Math.min(pv, remainingPv)
    remainingKv -= kvBasis
    remainingPv -= pvBasis
    assessment.push({ kind, sourceIds, inputMonthly: amount, kvBeforeCeilingMonthly: kv, pvBeforeCeilingMonthly: pv,
      kvAssessmentMonthly: kvBasis, pvAssessmentMonthly: pvBasis, kvRate: rate, pvRate,
      kvContributionMonthly: kvBasis * rate, pvContributionMonthly: pvBasis * pvRate, explanation })
  }
  add('statutory-pension', p.statutoryPensions.map(s => s.id), pension, pension, pension, general, 'Domestic statutory gross pensions first in the shared ceiling; half KV participation/subsidy shown separately.')
  add('occupational-pension', p.occupationalPensions.map(s => s.id), occupational, occupationalKv, occupationalPv, general,
    voluntary ? 'Voluntary: no occupational allowance or threshold.' : 'Aggregate standard Betriebsrenten: one KV allowance before ceiling; PV full amount only when aggregate exceeds threshold. No DRV participation.')
  // Rental and capital are equally ranked and use the same rate: group them instead of inventing legal priority.
  add('other-income', ['rental-assessment', 'capital-assessment'], rental + capital, other, other, reduced,
    voluntary ? `After pensions: rental basis ${rental}, capital basis ${capital}; assessment only, no added cashflow.` : 'Ordinary rental/capital income is outside KVdR assessment; capital input is unnecessary.')
  add('minimum-top-up', [], minimum, minimum, minimum, reduced, 'Voluntary minimum shortfall at reduced KV rate; assessment only, no cashflow.')
  const sum = (field: 'kvAssessmentMonthly' | 'pvAssessmentMonthly' | 'kvContributionMonthly' | 'pvContributionMonthly') => assessment.reduce((total, row) => total + row[field], 0)
  const totalKv = sum('kvContributionMonthly')
  const totalPv = sum('pvContributionMonthly')
  const pensionHalf = assessment[0].kvContributionMonthly / 2
  const participation = voluntary ? 0 : pensionHalf
  const subsidy = voluntary && p.phase === 'pension' && p.drvSubsidy === 'confirmed' ? pensionHalf : 0
  const ownKv = totalKv - participation - subsidy
  return {
    ...commonResult, status: 'automatic', ruleSnapshotId: rules.id,
    thresholds: p.thresholds, rentalAssessmentMonthly: rental, capitalAssessmentMonthly: capital,
    selectedStatus: p.status, effectiveStatus: voluntary ? 'voluntary' : 'kvdr', assessment,
    kvAssessmentMonthly: sum('kvAssessmentMonthly'), pvAssessmentMonthly: sum('pvAssessmentMonthly'),
    totalKvContributionMonthly: totalKv, totalPvContributionMonthly: totalPv,
    drvParticipationMonthly: participation, drvSubsidyMonthly: subsidy, pvSubsidyMonthly: 0,
    ownKvMonthly: ownKv, ownPvMonthly: totalPv, pvRate, childrenUnder25,
    availableIncomeMonthly: p.cashflowBeforeInsuranceMonthly - ownKv - totalPv,
    explanations: [
      'Monthly EUR, unrounded projection; cashflow before insurance minus own KV and PV. Capital assessment is not spendable income.',
      'Annual birth-year approximation: age is calendarYear minus birthYear for the entire year; child ages out at start of turning-25 year, childless surcharge starts in turning-23 year. Parenthood remains permanent.',
      '2026 statutory percentages held fixed; caller supplies inflation-indexed monetary thresholds. No eligibility determination.',
      ...(p.status === 'unknown' ? ['Unknown status uses a conservative voluntary-GKV assumption, not a guaranteed worst case or legal upper bound.'] : []),
    ],
  }
}
