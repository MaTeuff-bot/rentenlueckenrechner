import { childrenSummary, type ChildrenAnswer } from '../../model/childrenAnswer'
import { OptionalNumber } from './RetirementInsuranceSection'
import { focusField } from '../inputNavigation'
let nextChildId = 0
export function ChildrenSection({ answer, referenceYear, currentAge, onChange }: {
  answer: ChildrenAnswer; referenceYear: number; currentAge: number; onChange: (answer: ChildrenAnswer) => void
}) {
  const rows = answer.kind === 'children' ? answer.rows : []
  return <fieldset><legend>Für deine Pflegeversicherung anerkannte Kinder</legend>
    <p>Alle anerkannten Kinder mit Geburtsjahr erfassen, auch ältere Kinder; Zwillinge einzeln. Jährliche Näherung: ab 1. Januar des 25. Geburtstagsjahres zählt ein Kind nicht mehr als unter 25. Die Elterneigenschaft bleibt lebenslang.</p>
    {rows.map((row, index) => <div key={row.id}>
      <OptionalNumber id={`child-${row.id}`} label={`Geburtsjahr Kind ${index + 1}`} value={row.year} min={Math.max(1800, referenceYear - currentAge)} max={referenceYear} step="1" onChange={year => onChange({ kind: 'children', rows: rows.map(child => child.id === row.id ? { ...child, year } : child) })} />
      <button type="button" className="secondary-button" onClick={() => {
        const remaining = rows.filter(child => child.id !== row.id)
        onChange(remaining.length ? { kind: 'children', rows: remaining } : { kind: 'missing' })
        requestAnimationFrame(() => focusField(remaining.length ? `child-${remaining[Math.min(index, remaining.length - 1)].id}` : 'children-add'))
      }}>Kind {index + 1} entfernen</button>
    </div>)}
    <button id="children-add" type="button" className="secondary-button" onClick={() => {
      const id = `child-${Date.now()}-${nextChildId++}`
      onChange({ kind: 'children', rows: [...rows, { id }] })
      requestAnimationFrame(() => focusField(`child-${id}`))
    }}>Anerkanntes Kind hinzufügen</button>
    <button id="children-none" type="button" className="secondary-button" aria-pressed={answer.kind === 'none'} onClick={() => onChange({ kind: 'none' })}>Keine anerkannten Kinder</button>
    <p data-testid="children-summary">{childrenSummary(answer, referenceYear)}</p>
    <p>Anerkennung ungeklärt? <a href="#insurance-pension-manual" onClick={event => { event.preventDefault(); focusField('insurance-pension-manual', 'insurance-bridge-manual') }}>Eigene Gesamtannahme für die betroffenen Versicherungsphasen öffnen</a>. Dort ersetzen ausdrückliche KV/PV-Gesamtbeträge die gesamte Phase. Automatische Phasen benötigen weiterhin eine geklärte Kinderangabe.</p>
  </fieldset>
}
