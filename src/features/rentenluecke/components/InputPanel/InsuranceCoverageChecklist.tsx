import { toggleCoverage, type CoverageAnswer } from '../../model/insuranceCoverage'
export function InsuranceCoverageChecklist<E extends string>({ id, title, answer, options, onChange }: {
  id: string; title: string; answer: CoverageAnswer<E>; options: Record<E, string>; onChange: (answer: CoverageAnswer<E>) => void
}) {
  return <fieldset className="coverage-checklist"><legend>{title}</legend>
    {(Object.entries(options) as [E, string][]).map(([key, label], index) => <label key={key}><input id={index === 0 ? id : `${id}-${key}`} type="checkbox" checked={answer.kind === 'exceptions' && answer.selected.includes(key)} onChange={() => onChange(toggleCoverage(answer, key))} />{label}</label>)}
    {(['none', 'unsure'] as const).map(kind => <label key={kind}><input type="checkbox" checked={answer.kind === kind} onChange={() => onChange(toggleCoverage(answer, kind))} />{kind === 'none' ? 'Nichts davon' : 'Ich bin unsicher'}</label>)}
    <p>{answer.kind === 'missing' ? 'Noch offen: Bitte ausdrücklich antworten.' : answer.kind === 'none' ? 'Keine dieser Sonderumstände angegeben.' : 'Eigene KV/PV-Gesamtbeträge für diese Phase erforderlich. Du kannst die Angaben hier korrigieren.'}</p>
    <details><summary>Warum fragen wir danach?</summary><p>Die Automatik unterstützt eine Person ohne diese Sonderumstände. Dies sind Grenzen des Rechenmodells; die App entscheidet nicht über Versicherungsberechtigung. Bei Unsicherheit sind eigene Beiträge nötig oder die Planung bleibt unvollständig.</p></details>
  </fieldset>
}
