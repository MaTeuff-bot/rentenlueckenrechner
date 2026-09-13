import { z } from 'zod'
import type { RetirementInsurance } from './retirementInsurance'
export const commonExceptions = {
  'multiple-persons': 'Mehrere Personen',
  'employment-or-self-employment': 'Beschäftigung oder Selbstständigkeit',
  krankengeld: 'Krankengeld',
  'partner-household-assessment': 'Partner- oder Haushaltsbemessung',
  'special-minimum': 'Besondere Mindestbeitragsregeln',
  'child-recognition-unresolved': 'Anerkennung von Kindern ungeklärt',
} as const
export const bridgeExceptions = {
  'pension-applicant': 'Rentenantragstellerregelung',
  'family-insurance': 'Familienversicherung',
  'social-benefit': 'Sozialleistungsregelung',
} as const
export type CommonInsuranceException = keyof typeof commonExceptions
export type BridgeInsuranceException = keyof typeof bridgeExceptions
export type CoverageAnswer<E extends string = string> = { kind: 'missing' } | { kind: 'none' } | { kind: 'unsure' } | { kind: 'exceptions'; selected: E[] }
function answerSchema<E extends string>(ids: E[]) {
  return z.discriminatedUnion('kind', [z.strictObject({ kind: z.literal('missing') }), z.strictObject({ kind: z.literal('none') }), z.strictObject({ kind: z.literal('unsure') }), z.strictObject({ kind: z.literal('exceptions'), selected: z.array(z.enum(ids)).min(1).refine(values => new Set(values).size === values.length) })])
}
export const insuranceCoverageSchema = z.object({
  bridge: z.object({ common: answerSchema(Object.keys(commonExceptions) as CommonInsuranceException[]), bridgeOnly: answerSchema(Object.keys(bridgeExceptions) as BridgeInsuranceException[]) }),
  pension: z.object({ common: answerSchema(Object.keys(commonExceptions) as CommonInsuranceException[]) }),
})
export type InsuranceCoverageAnswers = z.infer<typeof insuranceCoverageSchema>
export function defaultCoverageAnswers(): InsuranceCoverageAnswers {
  return { bridge: { common: { kind: 'missing' }, bridgeOnly: { kind: 'missing' } }, pension: { common: { kind: 'missing' } } }
}
export function toggleCoverage<E extends string>(answer: CoverageAnswer<E>, selection: E | 'none' | 'unsure'): CoverageAnswer<E> {
  if (selection === 'none' || selection === 'unsure') return answer.kind === selection ? { kind: 'missing' } : { kind: selection === 'none' ? 'none' : 'unsure' }
  const selected = answer.kind === 'exceptions' ? [...answer.selected] : []
  const next = selected.includes(selection) ? selected.filter(id => id !== selection) : [...selected, selection]
  return next.length ? { kind: 'exceptions', selected: next } : { kind: 'missing' }
}
export function coverageCircumstances(...answers: CoverageAnswer[]): 'standard' | 'unsupported' | undefined {
  if (answers.some(a => a.kind === 'exceptions' || a.kind === 'unsure')) return 'unsupported'
  return answers.every(a => a.kind === 'none') ? 'standard' : undefined
}
export function applyCoverage(insurance: RetirementInsurance, answers: InsuranceCoverageAnswers): RetirementInsurance {
  return { ...insurance, bridge: { ...insurance.bridge, circumstances: coverageCircumstances(answers.bridge.common, answers.bridge.bridgeOnly) }, pension: { ...insurance.pension, circumstances: coverageCircumstances(answers.pension.common) } }
}
/** Conservative merge; bridge-only answers and all financial assumptions are untouched. */
export function copyCompatibleCoverage(answers: InsuranceCoverageAnswers, source: 'bridge' | 'pension') {
  const target = source === 'bridge' ? 'pension' : 'bridge'
  const from = answers[source].common, to = answers[target].common
  let common = to
  if (from.kind !== 'missing') {
    if (to.kind === 'missing' || to.kind === 'none') common = from
    else if (to.kind === 'exceptions' && from.kind === 'exceptions') common = { kind: 'exceptions', selected: [...new Set([...to.selected, ...from.selected])] }
  }
  let message = 'Keine gemeinsamen Angaben vorhanden; nichts geändert.'
  if (from.kind !== 'missing') {
    if (to.kind === 'unsure') message = 'Unsicherheit in dieser Phase beibehalten. Unterschiede bitte direkt prüfen; eigene KV/PV bleiben erforderlich.'
    else if (to.kind === 'exceptions') message = from.kind === 'exceptions'
      ? 'Ausnahmen beider Phasen zusammengeführt. Eigene KV/PV bleiben erforderlich.'
      : 'Bekannte Ausnahmen in dieser Phase beibehalten. Unterschiede bitte direkt prüfen; eigene KV/PV bleiben erforderlich.'
    else message = from.kind === 'none' ? 'Gemeinsame Antwort „Nichts davon“ übernommen.'
      : from.kind === 'unsure' ? 'Gemeinsame Unsicherheit übernommen. Eigene KV/PV sind erforderlich.'
      : 'Gemeinsame Ausnahmen übernommen. Eigene KV/PV sind erforderlich.'
    if (target === 'bridge') message += ` Brücken-spezifische Angaben bleiben unverändert${answers.bridge.bridgeOnly.kind === 'missing' ? ' und müssen separat beantwortet werden' : '; bitte separat prüfen'}.`
  }
  return { answers: { ...answers, [target]: { ...answers[target], common } }, message }
}
