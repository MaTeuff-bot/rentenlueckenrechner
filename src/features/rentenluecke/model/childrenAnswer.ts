import type { RetirementInsurance } from './retirementInsurance'

export type ChildrenAnswer = { kind: 'missing' } | { kind: 'none' } | { kind: 'children'; rows: { id: string; year?: number }[] }
export function childrenEngineFields(answer: ChildrenAnswer): Pick<RetirementInsurance, 'isParent' | 'childrenConfirmed' | 'childBirthYears'> {
  if (answer.kind === 'missing' || (answer.kind === 'children' && !answer.rows.length)) return { isParent: undefined, childrenConfirmed: undefined, childBirthYears: [] }
  if (answer.kind === 'none') return { isParent: false, childrenConfirmed: true, childBirthYears: [] }
  return { isParent: true, childrenConfirmed: true, childBirthYears: answer.rows.map(row => row.year ?? NaN) }
}
export function childrenSummary(answer: ChildrenAnswer, referenceYear: number) {
  if (answer.kind === 'missing') return 'Anerkannte Kinder noch nicht angegeben.'
  if (answer.kind === 'none') return 'Keine anerkannten Kinder; keine dauerhafte Elterneigenschaft.'
  const years = answer.rows.map(row => row.year)
  if (years.some(year => year === undefined || !Number.isInteger(year) || year > referenceYear || year < 1800)) return 'Geburtsjahre bitte vervollständigen oder prüfen.'
  const under25 = years.filter(year => referenceYear - year! < 25).length
  return `Dauerhafte Elterneigenschaft; ${years.length} anerkannte Kinder, davon ${under25} unter 25 im Basisjahr ${referenceYear}.`
}
