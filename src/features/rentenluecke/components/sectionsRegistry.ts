import type { FlowSection, ScenarioIssue } from '../model/scenarioIssues'
import type { PortfolioBucket } from '../model/portfolioBuckets'
import type { RentenlueckeInput, RetirementIncomeStream } from '../model/types'

export type InputTabId = 'plan' | 'vermoegen' | 'versicherung' | 'annahmen'

export type SectionSummaryContext = {
  input: RentenlueckeInput
  portfolioBuckets: PortfolioBucket[]
  retirementIncomeStreams: RetirementIncomeStream[]
  issues: readonly ScenarioIssue[]
  validYearLabel: string
}

export type InputTabDefinition = {
  id: InputTabId
  label: string
  sections: FlowSection[]
}

export const INPUT_TABS: readonly InputTabDefinition[] = [
  { id: 'plan', label: 'Persönlicher Plan', sections: ['zeitplan', 'ausgaben', 'einkommen'] },
  { id: 'vermoegen', label: 'Vermögen', sections: ['vermoegen'] },
  { id: 'versicherung', label: 'Versicherung', sections: ['versicherung'] },
  { id: 'annahmen', label: 'Rechenannahmen', sections: ['annahmen'] },
]

export const SECTION_LABELS: Record<FlowSection, string> = {
  zeitplan: 'Zeitplan',
  ausgaben: 'Ausgaben',
  einkommen: 'Einkommen',
  vermoegen: 'Vermögen & Sparen',
  versicherung: 'Versicherung',
  ergebnis: 'Ergebnis',
  annahmen: 'Rechenannahmen',
}

export const SECTION_ANCHORS: Record<FlowSection, string> = {
  zeitplan: 'currentAge',
  ausgaben: 'monthlyDesiredSpendingToday',
  einkommen: 'einkommen',
  vermoegen: 'portfolio-add',
  versicherung: 'versicherung',
  ergebnis: 'ergebnis',
  annahmen: 'inflation-source',
}

function withOffen(value: string): string {
  return value.replaceAll('NaN', 'offen')
}

export function sectionLabel(section: FlowSection): string {
  return SECTION_LABELS[section]
}

export function sectionAnchorField(section: FlowSection): string {
  return SECTION_ANCHORS[section]
}

export function sectionSummary(section: FlowSection, context: SectionSummaryContext): string {
  const { input, portfolioBuckets, retirementIncomeStreams, issues, validYearLabel } = context
  switch (section) {
    case 'zeitplan':
      return withOffen(`Heute ${input.currentAge}, Arbeitsende ${input.retirementAge}, Planung bis ${input.planningAge}`)
    case 'ausgaben':
      return withOffen(`${input.monthlyDesiredSpendingToday} € monatlich heute`)
    case 'einkommen':
      return withOffen(`${retirementIncomeStreams.length} Einkommensquellen`)
    case 'vermoegen':
      return withOffen(`${portfolioBuckets.length} Anlagen; Sparrate ${input.monthlyContributionToday} € bis Arbeitsende`)
    case 'versicherung':
      return retirementIncomeStreams.some((stream) => stream.kind === 'gesetzliche-rente')
        ? 'KV/PV für anwendbare Phasen bis zum Planungshorizont'
        : 'KV/PV vor und ab Versicherungsübergang'
    case 'ergebnis':
      return issues.length ? 'Eingaben bitte ergänzen oder prüfen' : 'Deine Ruhestandsplanung'
    case 'annahmen':
      return validYearLabel
  }
}

export function tabForSection(section: FlowSection): InputTabId | null {
  for (const tab of INPUT_TABS) {
    if (tab.sections.includes(section)) return tab.id
  }
  return null
}

export function tabStatus(tabId: InputTabId, issues: readonly ScenarioIssue[]): string {
  const tabSections = INPUT_TABS.find((tab) => tab.id === tabId)?.sections ?? []
  const relevant = issues.filter((issue) => tabSections.includes(issue.section))
  if (relevant.some((issue) => issue.kind === 'invalid')) return 'Prüfen'
  if (relevant.length > 0) return 'Offen'
  return 'Vollständig'
}

export function tabSummary(tabId: InputTabId, context: SectionSummaryContext): string {
  const tabSections = INPUT_TABS.find((tab) => tab.id === tabId)?.sections ?? []
  return tabSections.map((section) => sectionSummary(section, context)).join(' · ')
}

export type SectionRequest = {
  section: FlowSection
  fieldId?: string
  nonce: number
}

export function resolveSectionRequest(request: SectionRequest): { tab: InputTabId | null; fieldId: string } {
  const anchor = sectionAnchorField(request.section)
  return { tab: tabForSection(request.section), fieldId: request.fieldId ?? anchor }
}
