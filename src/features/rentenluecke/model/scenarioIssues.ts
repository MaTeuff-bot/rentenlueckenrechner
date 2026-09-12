import type { ZodError } from 'zod'
import type { RentenlueckeInput } from './types'
import type { PortfolioBucket } from './portfolioBuckets'
import { getReturnSeriesCategory } from './historicalReturns'
import type { ChildrenAnswer } from './childrenAnswer'
export type FlowSection = 'zeitplan' | 'ausgaben' | 'einkommen' | 'vermoegen' | 'versicherung' | 'ergebnis' | 'annahmen'
export type ScenarioIssue = { code: string; fieldPath: string; fieldId: string; section: FlowSection; kind: 'missing' | 'invalid'; message: string }
const numericMissing = (v: unknown) => v === undefined || (typeof v === 'number' && Number.isNaN(v))
export function sectionStatus(issues: readonly ScenarioIssue[], section: FlowSection) {
  const relevant = issues.filter(issue => issue.section === section)
  return relevant.some(issue => issue.kind === 'invalid') ? 'Prüfen' : relevant.length ? 'Offen' : 'Vollständig'
}
function route(path: (string | number)[], input: RentenlueckeInput, children: ChildrenAnswer, buckets: PortfolioBucket[]): [string, FlowSection] {
  const [root, key, field] = path
  if (root === 'retirementIncomeStreams') {
    const stream = input.retirementIncomeStreams?.[Number(key)]
    const names: Record<string, string> = { amountMonthlyToday: 'amount', startAge: 'start', endAge: 'end', effectiveDeductionRate: 'deduction', id: 'name', deductionMode: 'amountBasis' }
    return [`retirement-income-${names[String(field)] ?? field}-${stream?.id}`, field === 'startAge' && stream?.kind === 'gesetzliche-rente' ? 'zeitplan' : 'einkommen']
  }
  if (root === 'estimatorPortfolio') {
    const names: Record<string, string> = { annualCostRate: 'cost', returnSeriesId: 'source', id: 'name' }
    return [`portfolio-${names[String(field)] ?? field}-${buckets[Number(key)]?.id}`, 'vermoegen']
  }
  if (root === 'retirementInsurance') {
    if (key === 'pensionAge') return [input.retirementIncomeStreams?.some(s => s.kind === 'gesetzliche-rente') ? `retirement-income-start-${input.retirementIncomeStreams.find(s => s.kind === 'gesetzliche-rente')!.id}` : 'insurance-transition', 'zeitplan']
    if (key === 'childBirthYears') return [children.kind === 'children' && children.rows[Number(field)] ? `child-${children.rows[Number(field)].id}` : 'children-add', 'versicherung']
    if (key === 'rates') return [`insurance-rates-${field}`, 'annahmen']
    if (key === 'capitalEstimator') return [`estimator-${field}`, 'versicherung']
    if (key === 'bridge' || key === 'pension') return [`insurance-${key}-${field}`, 'versicherung']
    return [`insurance-${key}`, 'versicherung']
  }
  if (['currentAge', 'retirementAge', 'planningAge'].includes(String(root))) return [String(root), 'zeitplan']
  if (root === 'monthlyDesiredSpendingToday') return [String(root), 'ausgaben']
  if (root === 'annualInflationRate') return [String(root), 'annahmen']
  return [root === 'currentCapital' ? `portfolio-value-${buckets[0]?.id}` : String(root), 'vermoegen']
}
/** UI routing adapter around existing validators. Every engine issue is retained. */
export function scenarioIssues(input: RentenlueckeInput, children: ChildrenAnswer, buckets: PortfolioBucket[], schemaError: ZodError | undefined, insuranceMessages: string[], portfolioError: string | null, allocationError: string | null): ScenarioIssue[] {
  const issues: ScenarioIssue[] = []
  const add = (path: (string | number)[], message: string, kind: ScenarioIssue['kind'], code: string) => {
    const [fieldId, section] = route(path, input, children, buckets)
    issues.push({ code, fieldPath: path.join('.'), fieldId, section, kind, message })
  }
  for (const issue of schemaError?.issues ?? []) {
    const path = issue.path.map(part => typeof part === 'number' ? part : String(part))
    const value = path.reduce<unknown>((obj, key) => obj && typeof obj === 'object' ? (obj as Record<string, unknown>)[key] : undefined, input)
    add(path, numericMissing(value) ? 'Bitte diese Angabe ergänzen.' : issue.message, numericMissing(value) ? 'missing' : 'invalid', `schema.${path.join('.')}`)
  }
  const i = input.retirementInsurance
  for (const message of insuranceMessages) {
    // Schema failures already have precise nested paths.
    if (message.startsWith('Bitte gültige KV/PV-Werte') && schemaError) continue
    let path: (string | number)[] = ['retirementInsurance', 'pension', 'status']
    let kind: ScenarioIssue['kind'] = 'missing'
    const phase = message.startsWith('Brücke:') ? 'bridge' : 'pension'
    const streamIndex = input.retirementIncomeStreams?.findIndex(s => message.startsWith(`${s.name}:`)) ?? -1
    if (streamIndex >= 0) {
      const field = message.includes('brutto') ? 'amountBasis' : message.includes('Mietüberschuss') ? 'rentalAssessmentMonthlyToday' : 'support'
      path = ['retirementIncomeStreams', streamIndex, field]
      if (field === 'amountBasis') kind = 'invalid'
    } else if (message.includes('Rentenphase angeben') || message.includes('frühesten')) path = ['retirementInsurance', 'pensionAge']
    else if (message.includes('Kalenderbereich')) { path = ['planningAge']; kind = 'invalid' }
    else if (message.includes('Kennungen')) { path = ['retirementIncomeStreams', 0, 'id']; kind = 'invalid' }
    else if (message.includes('eigene monatliche')) path = ['retirementInsurance', phase, i?.[phase].kvMonthlyToday === undefined ? 'kvMonthlyToday' : 'pvMonthlyToday']
    else if (message.includes('Versicherungsumstände')) path = ['retirementInsurance', phase, 'circumstances']
    else if (message.includes('Versicherungsstatus')) path = ['retirementInsurance', phase, 'status']
    else if (message.includes('Kapitalertragsbasis')) path = ['retirementInsurance', phase, 'capitalMonthlyToday']
    else if (message.includes('DRV-Zuschuss')) path = ['retirementInsurance', phase, 'drvSubsidy']
    else if (message.includes('Zusatzbeitrag')) path = ['retirementInsurance', 'insurerAdditionalRate']
    else if (/Elterneigenschaft|Kinder|Kindergeburtsjahre/.test(message)) {
      const invalidIndex = i?.childBirthYears.findIndex(y => y > i.referenceYear || y < i.referenceYear - input.currentAge) ?? -1
      path = ['retirementInsurance', 'childBirthYears', Math.max(0, invalidIndex)]
      if (invalidIndex >= 0 || message.includes('widerspricht')) kind = 'invalid'
    } else if (message.includes('Anschaffungskosten')) path = ['retirementInsurance', 'capitalEstimator', 'fundAcquisitionCost']
    else if (message.includes('Anlageumfang')) path = ['retirementInsurance', 'capitalEstimator', 'scopeConfirmed']
    else if (message.includes('Kapitalverluste')) path = ['retirementInsurance', 'capitalEstimator', 'lossScopeConfirmed']
    else if (message.includes('klassifizieren')) {
      const index = Math.max(0, buckets.findIndex(b => !b.holding || b.holding === 'unsupported'))
      path = ['estimatorPortfolio', index, 'holding']; kind = buckets[index]?.holding ? 'invalid' : 'missing'
    } else if (message.includes('Bankeinlagen')) { path = ['estimatorPortfolio', Math.max(0, buckets.findIndex(b => b.holding === 'ordinary-bank-deposit' && getReturnSeriesCategory(b.returnSeriesId) !== 'cash')), 'returnSeriesId']; kind = 'invalid' }
    else if (/Ausgangsallokation|Portfoliowerte/.test(message)) { path = ['estimatorPortfolio', 0, 'value']; kind = 'invalid' }
    add(path, /PV-Elterneigenschaft/.test(message) ? 'Anerkannte Kinder ergänzen oder ausdrücklich „Keine anerkannten Kinder“ wählen.' : message, kind, `setup.${path.join('.')}`)
  }
  if (portfolioError || allocationError) {
    const index = Math.max(0, buckets.findIndex(b => !Number.isFinite(b.value) || b.value < 0 || !Number.isFinite(b.annualCostRate ?? 0) || (b.annualCostRate ?? 0) < 0 || (b.annualCostRate ?? 0) > 1 || !getReturnSeriesCategory(b.returnSeriesId)))
    const field = portfolioError?.includes('Kosten') ? 'annualCostRate' : portfolioError?.includes('Renditequelle') ? 'returnSeriesId' : 'value'
    add(['estimatorPortfolio', index, field], portfolioError ?? allocationError!, numericMissing(buckets[index]?.value) ? 'missing' : 'invalid', 'portfolio.validation')
  }
  return issues
}
