import { toggleCoverage, type CoverageAnswer } from '../../model/insuranceCoverage'
import { useEffect, useState } from 'react'
export function InsuranceCoverageChecklist<E extends string>({ id, title, answer, options, onChange }: {
  id: string; title: string; answer: CoverageAnswer<E>; options: Record<E, string>; onChange: (answer: CoverageAnswer<E>) => void
}) {
  const hasExceptions = answer.kind === 'exceptions'
  const [showExceptions, setShowExceptions] = useState(hasExceptions)
  useEffect(() => { setShowExceptions(hasExceptions) }, [hasExceptions])
  const chooseMode = (mode: 'standard' | 'exceptions' | 'unsure') => {
    if (mode === 'standard') { setShowExceptions(false); onChange(answer.kind === 'none' ? answer : { kind: 'none' }) }
    else if (mode === 'unsure') { setShowExceptions(false); onChange(answer.kind === 'unsure' ? answer : { kind: 'unsure' }) }
    else setShowExceptions(true)
  }
  const modeValue: 'standard' | 'exceptions' | 'unsure' | null = answer.kind === 'unsure' ? 'unsure' : answer.kind === 'none' ? 'standard' : hasExceptions ? 'exceptions' : showExceptions ? 'exceptions' : null
  return <fieldset className="coverage-checklist"><legend>{title}</legend>
    <div className="coverage-mode" role="radiogroup" aria-label={`${title} – Antwortart`}>
      <label><input id={id} type="radio" name={`${id}-mode`} checked={modeValue === 'standard'} onChange={() => chooseMode('standard')} />Alle Standardregeln genügen (automatische Berechnung)</label>
      <label><input type="radio" name={`${id}-mode`} checked={modeValue === 'exceptions'} onChange={() => chooseMode('exceptions')} />Es trifft etwas zu</label>
      <label><input type="radio" name={`${id}-mode`} checked={modeValue === 'unsure'} onChange={() => chooseMode('unsure')} />Ich bin unsicher</label>
    </div>
    {showExceptions && <div className="coverage-exceptions" aria-label={`${title} – Ausnahmen`}>
      {(Object.entries(options) as [E, string][]).map(([key, label]) => <label key={key}><input id={`${id}-${key}`} type="checkbox" checked={hasExceptions && answer.selected.includes(key)} onChange={() => onChange(toggleCoverage(answer, key))} />{label}</label>)}
      {!hasExceptions && <p>Noch offen: Mindestens eine Ausnahme ankreuzen, oder die Antwort oben ändern.</p>}
    </div>}
    <p>{answer.kind === 'missing' ? 'Noch offen: Bitte ausdrücklich antworten.' : answer.kind === 'none' ? 'Keine dieser Sonderumstände angegeben.' : 'Eigene KV/PV-Gesamtbeträge für diese Phase erforderlich. Du kannst die Angaben hier korrigieren.'}</p>
    <details><summary>Warum fragen wir danach?</summary><p>Die Automatik unterstützt eine Person ohne diese Sonderumstände. Dies sind Grenzen des Rechenmodells; die App entscheidet nicht über Versicherungsberechtigung. Bei Unsicherheit sind eigene Beiträge nötig oder die Planung bleibt unvollständig.</p></details>
  </fieldset>
}
