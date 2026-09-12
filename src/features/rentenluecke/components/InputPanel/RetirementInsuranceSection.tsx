import { CapitalEstimatorSetup } from './CapitalEstimatorSetup'
import { capitalMode, needsEstimator } from '../../model/capitalIncome/setup'
import { useId } from 'react'
import type { RentenlueckeInput } from '../../model/types'
import { phaseManualReasons, phaseStreams, type RetirementInsurance, type InsurancePhase } from '../../model/retirementInsurance'

export function OptionalNumber({ label, value, onChange, max, min = 0, step = 'any' }: {
  label: string; value?: number; onChange: (value: number | undefined) => void; max?: number; min?: number; step?: string
}) {
  const id = useId()
  const invalid = value !== undefined && (!Number.isFinite(value) || value < min || (max !== undefined && value > max) || (step === '1' && !Number.isInteger(value)))
  return <label className="field" htmlFor={id}><span className="field-label" id={`${id}-label`}>{label}</span><input aria-labelledby={`${id}-label`} id={id} type="number" inputMode={step === '1' ? 'numeric' : 'decimal'} min={min} max={max} step={step} value={Number.isNaN(value) ? '' : value ?? ''} aria-invalid={invalid} aria-describedby={invalid ? `${id}-error` : undefined} onChange={e => onChange(e.target.value === '' ? undefined : e.target.valueAsNumber)} />{invalid && <span className="field-error" id={`${id}-error`}>Bitte {step === '1' ? 'eine ganze Zahl' : 'einen Wert'} ab {min}{max !== undefined ? ` bis ${max}` : ''} eingeben.</span>}</label>
}
export function RetirementInsuranceSection({ insurance: i, input, onChange }: {
  insurance: RetirementInsurance; input: RentenlueckeInput; onChange: (insurance: RetirementInsurance) => void
}) {
  const phases = (['bridge', 'pension'] as const).filter(phase => phase === 'bridge' ? i.pensionAge !== undefined && input.retirementAge < i.pensionAge : i.pensionAge === undefined || i.pensionAge < input.planningAge)
  const reasonsFor = (phase: 'bridge' | 'pension') => phaseManualReasons(i, phase, phaseStreams(input.retirementIncomeStreams ?? [], i, phase, input.retirementAge, input.planningAge))
  const automatic = phases.some(phase => !reasonsFor(phase).length)
  return <fieldset className="wide-fieldset"><legend>Kranken- und Pflegeversicherung</legend>
    <OptionalNumber label="Beginn der gesetzlichen Rentenphase (Alter)" value={i.pensionAge} max={120} step="1" onChange={pensionAge => onChange({ ...i, pensionAge })} />
    <p>Vom Arbeitsende unabhängig. Aus der frühesten gesetzlichen Rente vorbelegt, separat änderbar. Bei Abweichung bitte Beginn oder Einkommensstrom korrigieren.</p>
    {phases.map(phase => {
      const p = i[phase], label = phase === 'bridge' ? 'Brücke' : 'Rentenphase'
      const update = (patch: Partial<InsurancePhase>) => onChange({ ...i, [phase]: { ...p, ...patch } })
      const reasons = reasonsFor(phase)
      return <fieldset key={phase}><legend>{label}</legend>
        <label className="field"><span className="field-label">Versicherungsstatus – {label}</span><select value={p.status ?? ''} onChange={e => update({ status: (e.target.value || undefined) as InsurancePhase['status'] })}>
          <option value="">Bitte auswählen</option><option value="kvdr">KVdR (selbst gewählt)</option><option value="voluntary">Freiwillige GKV</option><option value="unknown">Unbekannt – freiwillige GKV annehmen</option><option value="unsupported">Anderer Status / PKV / Familienversicherung</option>
        </select></label>
        {p.status === 'unknown' && <p>Konservative Annahme: freiwillige GKV. Kein garantierter Höchstbeitrag. Die App prüft keine KVdR-Berechtigung.</p>}
        {!p.manual && p.status !== 'unsupported' && !(phase === 'bridge' && p.status === 'kvdr') && <label className="field"><span className="field-label">Versicherungsumstände – {label}</span><select value={p.circumstances ?? ''} onChange={e => update({ circumstances: (e.target.value || undefined) as InsurancePhase['circumstances'] })}>
          <option value="">Bitte auswählen</option><option value="standard">Gewöhnliche inländische GKV, keine Sonderumstände</option><option value="unsupported">Sonderumstände / noch ungeklärt</option>
        </select></label>}
        <details><summary>Welche Umstände sind unterstützt?</summary><p>Automatisch unterstützt: eine Person ohne Beschäftigung, Selbstständigkeit, Krankengeld, Partner-/Haushaltsbemessung oder besondere Mindestbeitragsregeln. In der Brücke außerdem keine Rentenantragsteller-, Familien- oder Sozialleistungsregelung. Ungeklärte Kinderanerkennung zählt als Sonderumstand.</p></details>
        <details><summary>Erweitert – eigene Gesamtannahme</summary><label><input type="checkbox" checked={p.manual ?? false} onChange={e => update({ manual: e.target.checked })} />Gesamte {label} manuell berechnen</label></details>
        {reasons.length ? <>
          <p className="source-warning">{reasons.join('; ')}. Für die gesamte {label} ersetzen eigene KV/PV-Gesamtbeträge die Automatik. Keine automatische Bemessung oder zusätzlichen Zuschüsse.</p>
          <OptionalNumber label={`Eigene KV nach allen Zuschüssen – ${label} (€/Monat heute)`} value={p.kvMonthlyToday} onChange={kvMonthlyToday => update({ kvMonthlyToday })} />
          <OptionalNumber label={`Eigene PV nach allen Zuschüssen – ${label} (€/Monat heute)`} value={p.pvMonthlyToday} onChange={pvMonthlyToday => update({ pvMonthlyToday })} />
          <p>Beträge für die ganze Phase, einschließlich aller Einkommen. Auch 0 ausdrücklich eintragen. Einkommen vor diesen Versicherungsabzügen erfassen.</p>
        </> : p.status && p.status !== 'kvdr' && <>
          <label className="field"><span className="field-label">Kapitalbasis – {label}</span><select value={capitalMode(p)} onChange={e => update({ capitalMode: e.target.value as 'automatic' | 'manual' })}><option value="automatic">Automatisch aus dem Portfolio schätzen</option><option value="manual">Manuelle Kapitalertragsschätzung</option></select></label>
          {capitalMode(p) === 'manual' && <><OptionalNumber label={`Beitragsrelevante Kapitalerträge – ${label} (€/Monat heute)`} value={p.capitalMonthlyToday} onChange={capitalMonthlyToday => update({ capitalMode: 'manual', capitalMonthlyToday })} />
          <p>Vor Steuern, nach beitragsrechtlichen Kosten. Schätzung oder ausdrücklich 0. Kein Depotwert, keine Gesamtrendite oder Entnahme; kein zusätzliches auszahlbares Einkommen. Bleibt in heutiger Kaufkraft konstant.</p></>}
          {phase === 'pension' && <label className="field"><span className="field-label">DRV-Zuschuss – Rentenphase</span><select value={p.drvSubsidy ?? ''} onChange={e => update({ drvSubsidy: (e.target.value || undefined) as InsurancePhase['drvSubsidy'] })}><option value="">Bitte auswählen</option><option value="confirmed">Erhalt bestätigt</option><option value="not-received">Nicht erhalten / nicht angesetzt</option></select></label>}
        </>}
      </fieldset>
    })}
    {needsEstimator(input) && <CapitalEstimatorSetup insurance={i} onChange={onChange} />}
    {automatic && <>
      <OptionalNumber label="Kassenindividueller Zusatzbeitrag (%)" value={i.insurerAdditionalRate === undefined ? undefined : i.insurerAdditionalRate * 100} max={20} onChange={v => onChange({ ...i, insurerAdditionalRate: v === undefined ? undefined : v / 100 })} />
      <label className="field"><span className="field-label">Dauerhafte anerkannte PV-Elterneigenschaft</span><select value={i.isParent === undefined ? '' : String(i.isParent)} onChange={e => onChange({ ...i, isParent: e.target.value === '' ? undefined : e.target.value === 'true', childBirthYears: [], childrenConfirmed: undefined })}><option value="">Bitte auswählen</option><option value="true">Ja, dauerhaft anerkannt</option><option value="false">Nein, kinderlos</option></select></label>
      {i.isParent && <>
        <p>Alle anerkannten Kinder einzeln erfassen, Zwillinge zweimal; ältere Kinder dürfen in der Liste bleiben. Keine zukünftigen Geburten. Bei ungeklärter Anerkennung Sonderumstände wählen.</p>
        {i.childBirthYears.map((year, index) => <div key={index}>
          <OptionalNumber label={`Geburtsjahr Kind ${index + 1}`} value={year || undefined} min={1800} max={i.referenceYear} step="1" onChange={value => onChange({ ...i, childrenConfirmed: false, childBirthYears: i.childBirthYears.map((y, n) => n === index ? value ?? 0 : y) })} />
          <button type="button" className="secondary-button" onClick={() => onChange({ ...i, childrenConfirmed: false, childBirthYears: i.childBirthYears.filter((_, n) => n !== index) })}>Kind {index + 1} entfernen</button>
        </div>)}
        <button type="button" className="secondary-button" onClick={() => onChange({ ...i, childrenConfirmed: false, childBirthYears: [...i.childBirthYears, 0] })}>Anerkanntes Kind hinzufügen</button>
        <label className="field"><span><input type="checkbox" checked={i.childrenConfirmed ?? false} onChange={e => onChange({ ...i, childrenConfirmed: e.target.checked })} />Kinderliste vollständig bestätigt (auch ohne Kinder unter 25)</span></label>
      </>}
      {i.rates && Object.values(i.rates).some(value => value !== undefined) && <p className="source-warning">Eigene gesetzliche Satzannahmen sind aktiv. Unter „Erweitert“ prüfen oder auf Standards zurücksetzen.</p>}
      <details><summary>Erweitert – gesetzliche Satzannahmen ändern</summary>
        <p>Gesamtsätze vor Zusatzbeitrag und DRV-Beteiligung. Ein gemeinsamer Satz je Beitragsart; PV-Kinderregeln bleiben aktiv. Keine separaten Eigenanteils-Sätze.</p>
        {([['kvGeneralRate', 'Allgemeiner KV-Satz', 14.6], ['kvReducedRate', 'Ermäßigter KV-Satz', 14], ['pvBaseRate', 'PV-Basissatz', 3.6]] as const).map(([key, label, standard]) => <OptionalNumber key={key} label={`${label} (%; Standard ${standard})`} value={i.rates?.[key] === undefined ? undefined : i.rates[key]! * 100} min={key === 'pvBaseRate' ? 1 : 0} max={50} onChange={value => onChange({ ...i, rates: { ...i.rates, [key]: value === undefined ? undefined : value / 100 } })} />)}
        <button type="button" className="secondary-button" onClick={() => onChange({ ...i, rates: undefined })}>Gesetzliche Standards verwenden</button>
      </details>
    </>}
    <details><summary>Jahresmodell und Rechenregeln</summary><p>Jahresmodell: Arbeitsende, Einkommensbeginn/-ende und Rentenphase gelten ab dem jeweiligen Zeilen-Startalter, ohne Teiljahre. Basisjahr {i.referenceYear}; Alter = Kalenderjahr minus Geburtsjahr. PV: Kinder zählen ab 1. Januar ihres 25. Geburtstagsjahres nicht mehr; Kinderlosenzuschlag ab dem Jahr des 23. Geburtstags. Elterneigenschaft bleibt dauerhaft. Näherung ohne Monatsgenauigkeit.</p>
    <p>Grenzen und Geldbeträge steigen mit der Inflation des jeweiligen Simulationspfads; Prozentsätze bleiben konstant. Regeln 2026, keine Bescheid- oder Centgenauigkeit.</p></details>
  </fieldset>
}
