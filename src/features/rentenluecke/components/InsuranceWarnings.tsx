import { getInsuranceWarnings, type RetirementInsurance } from '../model/retirementInsurance'
import type { RetirementIncomeStream } from '../model/types'

export function InsuranceWarnings({ insurance, streams }: { insurance: RetirementInsurance; streams: RetirementIncomeStream[] }) {
  const warnings = getInsuranceWarnings(streams, insurance)
  if (!warnings.length) return null
  return <section className="panel source-warning" role="alert" aria-label="KV/PV-Schätzung unvollständig">
    <strong>KV/PV-Schätzung unvollständig – auch Ergebnisse und Kapitalbedarf sind vorläufig.</strong>
    <ul>{warnings.map((warning) => <li key={`${warning.code}-${warning.streamId ?? ''}`}>
      {warning.streamId && `${streams.find((stream) => stream.id === warning.streamId)?.name || 'Einkommen'}: `}
      {warning.code === 'unknown-status' ? 'Versicherungsstatus unbekannt. Bitte selbst klären.'
        : warning.code === 'review-stream' ? 'Zuordnung „Prüfen“: keine zusätzliche Versicherung eingerechnet.'
        : 'Gesamtabzug noch nicht ersetzt: bisherige Pauschale gilt, zusätzliche KV/PV bleibt gesperrt.'}
    </li>)}</ul>
  </section>
}
