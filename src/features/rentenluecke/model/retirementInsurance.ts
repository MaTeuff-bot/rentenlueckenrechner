import { DEFAULT_PROJECTED_BASIS_RATE, estimatorSetupSchema } from './capitalIncome/schema'
import { capitalMode, needsEstimator, estimatorSetupIssues } from './capitalIncome/setup'
import { z } from 'zod'
import { calculateContributions, type ContributionResult } from './contributions/contributionEngine'
import { indexedContributionThresholds } from './contributions/rules2026'
import type { RentenlueckeInput, RetirementIncomeStream } from './types'

const optionalMoney = z.number().finite().nonnegative().optional()
export const insurancePhaseSchema = z.object({
  status: z.enum(['kvdr', 'voluntary', 'unknown', 'unsupported']).optional(),
  circumstances: z.enum(['standard', 'unsupported']).optional(),
  manual: z.boolean().optional(),
  kvMonthlyToday: optionalMoney,
  pvMonthlyToday: optionalMoney,
  capitalMonthlyToday: optionalMoney,
  capitalMode: z.enum(['automatic', 'manual']).optional(),
  drvSubsidy: z.enum(['confirmed', 'not-received']).optional(),
})
export const retirementInsuranceSchema = z.object({
  capitalEstimator: estimatorSetupSchema.optional(),
  pensionAge: z.number().int().min(0).max(120).optional(),
  referenceYear: z.number().int().min(2026).max(9999),
  insurerAdditionalRate: z.number().finite().min(0).max(0.2).optional(),
  isParent: z.boolean().optional(),
  childrenConfirmed: z.boolean().optional(),
  childBirthYears: z.array(z.number().int().min(1800).max(9999)),
  rates: z.object({
    kvGeneralRate: z.number().min(0).max(0.5).optional(),
    kvReducedRate: z.number().min(0).max(0.5).optional(),
    pvBaseRate: z.number().min(0.01).max(0.5).optional(),
  }).optional(),
  bridge: insurancePhaseSchema,
  pension: insurancePhaseSchema,
})
export type InsurancePhase = z.infer<typeof insurancePhaseSchema>
export type RetirementInsurance = z.infer<typeof retirementInsuranceSchema>
export type InsuranceStatus = 'kvdr' | 'voluntary' | 'unknown'
export function createDefaultRetirementInsurance(pensionAge?: number): RetirementInsurance {
  return { pensionAge, referenceYear: new Date().getFullYear(), childBirthYears: [], bridge: {}, pension: {} }
}
export function earliestPensionAge(streams: readonly RetirementIncomeStream[]): number | undefined {
  const ages = streams.filter(s => s.kind === 'gesetzliche-rente').map(s => s.startAge)
  return ages.length ? Math.min(...ages) : undefined
}
export function activeIncomeStreams(streams: readonly RetirementIncomeStream[], age: number) {
  return streams.filter(s => s.startAge <= age && (s.endAge === null || age < s.endAge))
}
export function phaseManualReasons(insurance: RetirementInsurance, phase: 'bridge' | 'pension', streams: readonly RetirementIncomeStream[]): string[] {
  const p = insurance[phase]
  const reasons: string[] = []
  if (p.manual) reasons.push('Eigene Gesamtannahme gewählt')
  if (p.status === 'unsupported' || (phase === 'bridge' && p.status === 'kvdr')) reasons.push('Versicherungsstatus außerhalb der automatischen Regeln')
  if (p.circumstances === 'unsupported') reasons.push('Besondere Versicherungsumstände')
  for (const s of streams) {
    if (phase === 'bridge' && ['gesetzliche-rente', 'betriebsrente'].includes(s.kind ?? '')) reasons.push(`${s.name}: Rentenbezug in der Brücke`)
    else if (!['gesetzliche-rente', 'betriebsrente', 'rental-income'].includes(s.kind ?? '')) reasons.push(`${s.name}: Einkommensart nicht automatisch geklärt`)
    else if (s.support === 'unsupported') reasons.push(`${s.name}: Sonderfall`)
  }
  return [...new Set(reasons)]
}
// Scope is checked across the entire phase, so a later unsupported receipt replaces
// automatic coverage for that whole phase, including years before that receipt.
export function phaseStreams(streams: readonly RetirementIncomeStream[], insurance: RetirementInsurance, phase: 'bridge' | 'pension', workStop: number, planningAge: number) {
  const start = phase === 'bridge' ? workStop : Math.max(workStop, insurance.pensionAge ?? workStop)
  const end = phase === 'bridge' ? Math.min(planningAge, insurance.pensionAge ?? workStop) : planningAge
  return streams.filter(s => start < end && s.startAge < end && (s.endAge === null || s.endAge > start))
}
export function insuranceSetupIssues(input: RentenlueckeInput): string[] {
  const i = input.retirementInsurance
  if (!i) return ['Bitte KV/PV-Angaben ergänzen.']
  if (!retirementInsuranceSchema.safeParse(i).success) return ['Bitte gültige KV/PV-Werte eingeben (Beträge ab 0, gültige Jahre und Sätze).']
  const issues: string[] = []
  const streams = input.retirementIncomeStreams ?? []
  if (i.pensionAge === undefined) issues.push('Beginn der Rentenphase angeben.')
  const earliest = earliestPensionAge(streams)
  if (earliest !== undefined && i.pensionAge !== earliest) issues.push(`Rentenbeginn muss zum frühesten gesetzlichen Rentenstrom passen (Alter ${earliest}). Beginn oder Einkommensstrom korrigieren.`)
  if (i.referenceYear + input.planningAge - input.currentAge > 9999) issues.push('Basisjahr und Planungshorizont liegen außerhalb des unterstützten Kalenderbereichs.')
  if (new Set(streams.map(s => s.id)).size !== streams.length || streams.some(s => !s.id)) issues.push('Einkommensströme benötigen eindeutige Kennungen.')
  const phases: ('bridge' | 'pension')[] = []
  if (i.pensionAge !== undefined && input.retirementAge < i.pensionAge) phases.push('bridge')
  if (i.pensionAge !== undefined && i.pensionAge < input.planningAge) phases.push('pension')
  let automatic = false
  for (const phase of phases) {
    const p = i[phase], label = phase === 'bridge' ? 'Brücke' : 'Rentenphase'
    const relevant = phaseStreams(streams, i, phase, input.retirementAge, input.planningAge)
    if (phaseManualReasons(i, phase, relevant).length) {
      if (p.kvMonthlyToday === undefined || p.pvMonthlyToday === undefined) issues.push(`${label}: eigene monatliche KV und PV nach allen Zuschüssen für die gesamte Phase eintragen, auch 0 ausdrücklich.`)
      continue
    }
    automatic = true
    if (!p.status) issues.push(`${label}: Versicherungsstatus auswählen.`)
    if (!p.circumstances) issues.push(`${label}: Versicherungsumstände bestätigen.`)
    if (p.status && p.status !== 'kvdr') {
      if (capitalMode(p) === 'manual' && p.capitalMonthlyToday === undefined) issues.push(`${label}: Kapitalertragsbasis schätzen oder 0 eintragen.`)
      if (phase === 'pension' && !p.drvSubsidy) issues.push(`${label}: Erhalt des DRV-Zuschusses angeben.`)
    }
    for (const s of relevant) {
      if (['gesetzliche-rente', 'betriebsrente'].includes(s.kind ?? '') && !s.support) issues.push(`${s.name}: gewöhnlichen inländischen Rentenbezug bestätigen oder Sonderfall auswählen.`)
      if ((s.kind !== 'rental-income' || p.status !== 'kvdr') && s.amountBasis !== 'gross') issues.push(`${s.name}: beitragsrelevantes Einkommen brutto eingeben; keine Rückrechnung aus Netto.`)
      if (s.kind === 'rental-income' && p.status && p.status !== 'kvdr' && s.rentalAssessmentMonthlyToday === undefined) issues.push(`${s.name}: Mietüberschuss vor Steuern nach beitragsrechtlichen Kosten angeben.`)
    }
  }
  if (automatic) {
    if (i.insurerAdditionalRate === undefined) issues.push('Kassenindividuellen Zusatzbeitrag angeben.')
    if (i.isParent === undefined) issues.push('Dauerhafte PV-Elterneigenschaft angeben.')
    if (i.isParent && !i.childrenConfirmed) issues.push('Vollständige Liste der anerkannten Kinder bestätigen (auch keine).')
    if (!i.isParent && i.childBirthYears.length) issues.push('Kinderliste widerspricht fehlender Elterneigenschaft.')
    if (i.childBirthYears.some(y => y > i.referenceYear || y < i.referenceYear - input.currentAge)) issues.push('Kindergeburtsjahre müssen zwischen eigenem Geburtsjahr und Basisjahr liegen.')
  }
  return [...new Set([...issues, ...estimatorSetupIssues(input)])]
}
export type CompleteContribution = Extract<ContributionResult, { status: 'automatic' | 'manual' }>
export function contributionForYear(input: RentenlueckeInput, age: number, inflation: number, cash: number, annualCapitalAssessment?: number): CompleteContribution {
  const i = input.retirementInsurance!
  const phase = age < i.pensionAge! ? 'bridge' : 'pension'
  const p = i[phase]
  const streams = input.retirementIncomeStreams ?? []
  const active = activeIncomeStreams(streams, age)
  const reasons = phaseManualReasons(i, phase, phaseStreams(streams, i, phase, input.retirementAge, input.planningAge))
  const common = { personId: 'person', phaseId: phase, phase, calendarYear: i.referenceYear + age - input.currentAge, cashflowBeforeInsuranceMonthly: cash }
  const result = reasons.length ? calculateContributions({ ...common, mode: 'manual', reason: reasons.join('; '), kvMonthly: p.kvMonthlyToday! * inflation, pvMonthly: p.pvMonthlyToday! * inflation }) : calculateContributions({
    ...common, mode: 'automatic', status: p.status,
    scope: { kind: 'standard-domestic-no-employment' },
    thresholds: indexedContributionThresholds(inflation), insurerAdditionalRate: i.insurerAdditionalRate,
    rateOverrides: i.rates,
    insuredBirthYear: i.referenceYear - input.currentAge,
    family: { isParent: i.isParent, childBirthYears: i.childBirthYears },
    statutoryPensions: active.filter(s => s.kind === 'gesetzliche-rente').map(s => ({ id: s.id, grossMonthly: s.amountMonthlyToday * inflation })),
    occupationalPensions: active.filter(s => s.kind === 'betriebsrente').map(s => ({ id: s.id, grossMonthly: s.amountMonthlyToday * inflation })),
    rentalAssessmentMonthly: active.filter(s => s.kind === 'rental-income').reduce((sum, s) => sum + (s.rentalAssessmentMonthlyToday ?? 0) * inflation, 0),
    capitalAssessmentMonthly: p.status === 'kvdr' ? undefined : (annualCapitalAssessment === undefined ? p.capitalMonthlyToday! * inflation : annualCapitalAssessment / 12),
    drvSubsidy: phase === 'pension' ? p.drvSubsidy : undefined,
  })
  if (result.status !== 'automatic' && result.status !== 'manual') throw new Error(`KV/PV nicht vollständig: ${JSON.stringify(result)}`)
  return result
}

/** Discard only malformed values in controls that are no longer applicable.
 * Valid assumptions survive switching modes; hidden invalid controls cannot block
 * a manual phase or contribution-excluded income with no way to correct them.
 */
export function clearHiddenInvalidInsuranceValues(input: RentenlueckeInput): RentenlueckeInput {
  const insurance = input.retirementInsurance
  if (!insurance) return input
  const i = { ...insurance, bridge: { ...insurance.bridge }, pension: { ...insurance.pension } }
  const streams = input.retirementIncomeStreams ?? []
  const automaticPhases: ('bridge' | 'pension')[] = []
  for (const phase of ['bridge', 'pension'] as const) {
    const active = phase === 'bridge'
      ? i.pensionAge !== undefined && input.retirementAge < i.pensionAge
      : i.pensionAge === undefined || i.pensionAge < input.planningAge
    const manual = phaseManualReasons(i, phase, phaseStreams(streams, i, phase, input.retirementAge, input.planningAge)).length > 0
    if (active && !manual) automaticPhases.push(phase)
    if (!active || !manual) {
      if (!optionalMoney.safeParse(i[phase].kvMonthlyToday).success) i[phase].kvMonthlyToday = undefined
      if (!optionalMoney.safeParse(i[phase].pvMonthlyToday).success) i[phase].pvMonthlyToday = undefined
    }
    if (!active || manual || capitalMode(i[phase]) === 'automatic' || !i[phase].status || i[phase].status === 'kvdr') {
      if (!optionalMoney.safeParse(i[phase].capitalMonthlyToday).success) i[phase].capitalMonthlyToday = undefined
    }
  }
  if (!needsEstimator({ ...input, retirementInsurance: i }) && i.capitalEstimator) {
    const setup = { ...i.capitalEstimator }
    if (!estimatorSetupSchema.shape.fundAcquisitionCost.safeParse(setup.fundAcquisitionCost).success) setup.fundAcquisitionCost = undefined
    if (!estimatorSetupSchema.shape.projectedBasisRate.safeParse(setup.projectedBasisRate).success) setup.projectedBasisRate = DEFAULT_PROJECTED_BASIS_RATE
    i.capitalEstimator = setup
  }
  if (!automaticPhases.length) {
    if (!retirementInsuranceSchema.shape.insurerAdditionalRate.safeParse(i.insurerAdditionalRate).success) i.insurerAdditionalRate = undefined
    if (i.rates) {
      i.rates = { ...i.rates }
      const rateSchemas = retirementInsuranceSchema.shape.rates.unwrap().shape
      for (const key of ['kvGeneralRate', 'kvReducedRate', 'pvBaseRate'] as const) {
        if (!rateSchemas[key].safeParse(i.rates[key]).success) i.rates[key] = undefined
      }
    }
    if (!retirementInsuranceSchema.shape.childBirthYears.safeParse(i.childBirthYears).success) {
      i.childBirthYears = []
      i.childrenConfirmed = undefined
    }
  }
  return { ...input, retirementInsurance: i, retirementIncomeStreams: streams.map(stream => {
    const needsRental = stream.kind === 'rental-income' && automaticPhases.some(phase => i[phase].status && i[phase].status !== 'kvdr'
      && phaseStreams([stream], i, phase, input.retirementAge, input.planningAge).length)
    return !needsRental && !optionalMoney.safeParse(stream.rentalAssessmentMonthlyToday).success
      ? { ...stream, rentalAssessmentMonthlyToday: undefined } : stream
  }) }
}
