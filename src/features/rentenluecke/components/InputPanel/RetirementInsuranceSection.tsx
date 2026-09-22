import type { ScenarioIssue } from '../../model/scenarioIssues'
import { BridgeCoverageChecklist, InsuranceCoverageChecklist } from './InsuranceCoverageChecklist'
import { applyCoverage, commonExceptions, copyCompatibleCoverage, defaultCoverageAnswers, type InsuranceCoverageAnswers } from '../../model/insuranceCoverage'
import { focusField } from '../inputNavigation'
import { ChildrenSection } from './ChildrenSection'
import type { ChildrenAnswer } from '../../model/childrenAnswer'
import { OptionalNumber } from './OptionalNumber'
import { capitalMode, needsEstimator } from '../../model/capitalIncome/setup'
import { useState } from 'react'
import type { RentenlueckeInput } from '../../model/types'
import { controllingPensionStream, insurancePhaseRanges, phaseManualReasons, phaseStreams, type RetirementInsurance, type InsurancePhase } from '../../model/retirementInsurance'

export { OptionalNumber }
export function RetirementInsuranceSection({ insurance, input, onChange, coverage, onCoverageChange, issues = [], childrenAnswer = { kind: 'missing' }, onChildrenChange = () => {}, onJumpToEstimator }: {
  issues?: ScenarioIssue[]
  coverage?: InsuranceCoverageAnswers; onCoverageChange?: (answers: InsuranceCoverageAnswers) => void
  childrenAnswer?: ChildrenAnswer; onChildrenChange?: (answer: ChildrenAnswer) => void
  insurance: RetirementInsurance; input: RentenlueckeInput; onChange: (insurance: RetirementInsurance) => void
  onJumpToEstimator?: (fieldId: string) => void
}) {
  const [localCoverage, setLocalCoverage] = useState(defaultCoverageAnswers)
  const [copyMessage, setCopyMessage] = useState('')
  const answers = coverage ?? localCoverage
  const changeCoverage = (next: InsuranceCoverageAnswers) => {
    if (onCoverageChange) onCoverageChange(next)
    else { setLocalCoverage(next); onChange(applyCoverage(insurance, next)) }
  }
  const i = applyCoverage(insurance, answers)
  const ranges = insurancePhaseRanges(input, i)
  const statutory = input.retirementIncomeStreams?.some(s => s.kind === 'gesetzliche-rente')
  const labelFor = (phase: 'bridge' | 'pension') => phase === 'bridge' ? 'Brücke' : statutory ? 'Rentenphase' : 'Phase ab Versicherungsübergang'
  const reasonsFor = (phase: 'bridge' | 'pension') => phaseManualReasons(i, phase, phaseStreams(input.retirementIncomeStreams ?? [], i, phase, input.retirementAge, input.planningAge))
  const automatic = ranges.some(({ phase }) => !reasonsFor(phase).length)
  const timelineTarget = !Number.isInteger(input.currentAge) || input.currentAge < 0 || input.currentAge > 100 ? 'currentAge' : !Number.isInteger(input.retirementAge) || input.retirementAge < input.currentAge || input.retirementAge > 100 ? 'retirementAge' : !Number.isInteger(input.planningAge) || input.planningAge <= input.retirementAge || input.planningAge > 120 ? 'planningAge' : statutory ? `retirement-income-start-${controllingPensionStream(input.retirementIncomeStreams!)!.id}` : 'insurance-transition'
  const blockStatusFor = (relevant: readonly ScenarioIssue[]) => relevant.some(issue => issue.kind === 'invalid') ? 'Prüfen' : relevant.length ? 'Offen' : 'Vollständig'
  const block1Issues = ranges.flatMap(({ phase }) => issues.filter(issue => issue.fieldPath === `retirementInsurance.${phase}.status` || issue.fieldPath === `retirementInsurance.${phase}.circumstances` || issue.fieldPath.startsWith(`insuranceCoverageAnswers.${phase}.`)))
  const block2Issues = issues.filter(issue => issue.fieldPath === 'retirementInsurance.insurerAdditionalRate' || issue.fieldPath.startsWith('retirementInsurance.childBirthYears'))
  const block3Issues = ranges.flatMap(({ phase }) => issues.filter(issue => issue.fieldPath === `retirementInsurance.${phase}.kvMonthlyToday` || issue.fieldPath === `retirementInsurance.${phase}.pvMonthlyToday` || issue.fieldPath === `retirementInsurance.${phase}.capitalMonthlyToday` || issue.fieldPath === `retirementInsurance.${phase}.drvSubsidy`))
  const block4Issues = issues.filter(issue => issue.fieldPath.startsWith('retirementInsurance.capitalEstimator'))
  const showEstimator = needsEstimator({ ...input, retirementInsurance: i })
  const block1Status = blockStatusFor(block1Issues)
  const block2Status = blockStatusFor(block2Issues)
  const block3Status = blockStatusFor(block3Issues)
  const block4Status = blockStatusFor(block4Issues)
  const block1Summary = !ranges.length ? 'Keine anwendbare Phase – Zeitplan prüfen.' : block1Issues.length ? `${block1Issues.length} offene Punkte in Status und Umständen – Details in den Phasen.` : 'Status und Umstände je Phase geklärt.'
  const block2Summary = block2Issues.length ? `${block2Issues.length} offene Punkte in Zusatzbeitrag und Kindern.` : 'Zusatzbeitrag und Kinder geklärt.'
  const block3Summary = block3Issues.length ? `${block3Issues.length} offene Punkte in Beiträgen je Phase.` : 'Beiträge je Phase geklärt – Details in den Phasen.'
  const block4Summary = block4Issues.length ? `${block4Issues.length} offene Punkte in der Kapitalertrags-Schätzung.` : 'Automatische Schätzung aus dem Portfolio.'
  return <fieldset className="wide-fieldset insurance-flow"><legend>Kranken- und Pflegeversicherung</legend>
    <section className="insurance-block" aria-labelledby="insurance-block-1-heading">
      <h3 id="insurance-block-1-heading">1. Phasen und Status <span className="section-status">{block1Status}</span></h3>
      <p>{block1Summary}</p>
      <p>{statutory ? 'Rentenbeginn' : 'Versicherungsübergang'} laut Zeitplan: {Number.isFinite(i.pensionAge) ? `Alter ${i.pensionAge}` : 'noch offen'}. <button type="button" className="secondary-button" onClick={() => focusField(timelineTarget)}>Zeitplan ergänzen / korrigieren</button></p>
      {!ranges.length && <p>Keine anwendbare Versicherungsphase. Bitte Arbeitsende, Übergang und Planungshorizont im Zeitplan prüfen.</p>}
      {ranges.map(({ phase, start, end }) => {
        const p = i[phase], label = labelFor(phase)
        const update = (patch: Partial<InsurancePhase>) => onChange({ ...i, [phase]: { ...p, ...patch } })
        const reasons = reasonsFor(phase)
        const streams = phaseStreams(input.retirementIncomeStreams ?? [], i, phase, input.retirementAge, input.planningAge)
        const forcedReasons = phaseManualReasons({ ...i, [phase]: { ...p, manual: false, circumstances: undefined } }, phase, streams)
        const offending = streams.filter(stream => phaseManualReasons({ ...i, [phase]: { ...p, manual: false, circumstances: undefined, status: 'voluntary' } }, phase, [stream]).length)
        const other = phase === 'bridge' ? 'pension' : 'bridge'
        const phaseIssues = issues.filter(issue => issue.fieldPath.startsWith(`retirementInsurance.${phase}.`) || issue.fieldPath.startsWith(`insuranceCoverageAnswers.${phase}.`))
        return <fieldset key={phase} className="insurance-phase"><legend>{label} · Alter {start} bis unter {end}</legend>
          <label className="field"><span className="field-label">Versicherungsstatus – {label}</span><select id={`insurance-${phase}-status`} value={p.status ?? ''} onChange={e => update({ status: (e.target.value || undefined) as InsurancePhase['status'] })}>
            <option value="">Bitte auswählen</option>{phase === 'pension' && <option value="kvdr">KVdR</option>}<option value="voluntary">Freiwillige GKV</option><option value="unknown">Unbekannt – freiwillige GKV annehmen</option><option value="unsupported">Anderer Status / PKV / Familienversicherung</option>
          </select></label>{phase === 'pension' && <p className="field-help">KVdR: Deine Angabe – wird angenommen, nicht geprüft.</p>}
          {p.status === 'unknown' && <p>Für diese Planung nehmen wir freiwillige GKV an. Das ist kein garantierter Höchstbeitrag. Die App prüft keine Versicherungsberechtigung.</p>}
          {forcedReasons.length > 0 && <div className="source-warning"><p>{forcedReasons.join('; ')}. Die ganze Phase benötigt eigene Beiträge.</p>
            {offending.map(stream => <p key={stream.id}>{stream.name} ab Alter {stream.startAge}: <button type="button" className="secondary-button" onClick={() => focusField(`retirement-income-kind-${stream.id}`)}>Einkommen bearbeiten</button></p>)}
            <button type="button" className="secondary-button" onClick={() => focusField(`insurance-${phase}-kvMonthlyToday`)}>Eigene Beiträge eingeben</button>
          </div>}
          {phase === 'bridge'
            ? <BridgeCoverageChecklist common={answers.bridge.common} bridgeOnly={answers.bridge.bridgeOnly} onChange={({ common, bridgeOnly }) => changeCoverage({ ...answers, bridge: { ...answers.bridge, common, bridgeOnly } })} manualOption={{ id: `insurance-${phase}-manual`, phaseLabel: label, active: p.manual ?? false, forced: forcedReasons.length > 0, forcedReasons, onManualChange: manual => update({ manual }) }} />
            : <InsuranceCoverageChecklist id={`insurance-${phase}-circumstances`} title={`Besondere Umstände – ${label}`} answer={answers[phase].common} options={commonExceptions} onChange={common => changeCoverage({ ...answers, [phase]: { ...answers[phase], common } })} manualOption={{ id: `insurance-${phase}-manual`, phaseLabel: label, active: p.manual ?? false, forced: forcedReasons.length > 0, forcedReasons, onManualChange: manual => update({ manual }) }} />}
          {!p.manual && !forcedReasons.length && <>
            {ranges.length === 2 && <button type="button" className="secondary-button" disabled={answers[other].common.kind === 'missing'} onClick={() => { const result = copyCompatibleCoverage(answers, other); changeCoverage(result.answers); setCopyMessage(result.message) }}>Angaben aus der anderen Phase übernehmen – {label}</button>}
          </>}
          <p data-testid={`insurance-${phase}-summary`}>{reasons.length ? `Eigene Beiträge · KV ${p.kvMonthlyToday ?? 'offen'} / PV ${p.pvMonthlyToday ?? 'offen'} €/Monat heute` : `${p.status === 'kvdr' ? 'KVdR' : p.status === 'unknown' ? 'Unbekannt · freiwillige GKV angenommen' : p.status === 'voluntary' ? 'Freiwillige GKV' : 'Status offen'} · automatisch`}</p>
          {phaseIssues.length > 0 && <ul>{phaseIssues.map(issue => <li key={issue.code}><a href={`#${issue.fieldId}`} onClick={event => { event.preventDefault(); focusField(issue.fieldId) }}>{issue.message}</a></li>)}</ul>}
        </fieldset>
      })}
      {copyMessage && <p role="status">{copyMessage}</p>}
    </section>
    {automatic && <section className="insurance-block" aria-labelledby="insurance-block-2-heading">
      <h3 id="insurance-block-2-heading">2. Gemeinsame Angaben <span className="section-status">{block2Status}</span></h3>
      <p>{block2Summary}</p>
      <OptionalNumber id="insurance-insurerAdditionalRate" label="Kassenindividueller Zusatzbeitrag (%)" value={i.insurerAdditionalRate === undefined ? undefined : i.insurerAdditionalRate * 100} max={20} onChange={v => onChange({ ...i, insurerAdditionalRate: v === undefined ? undefined : v / 100 })} />
      <p className="field-help">2,9 % ist vorausgefüllt – der durchschnittliche Zusatzbeitrag 2026 laut BMG/Schätzerkreis. Deine Kasse kann abweichen; anpassbar.</p>
      <details><summary>Wo finde ich das?</summary><p>Den kassenindividuellen Zusatzbeitrag findest du auf der Website oder in einer Beitragsmitteilung deiner Krankenkasse.</p></details>
      <ChildrenSection manualPhase={ranges.find(({ phase }) => !reasonsFor(phase).length)?.phase} answer={childrenAnswer} referenceYear={i.referenceYear} currentAge={input.currentAge} onChange={onChildrenChange} />
      {i.rates && Object.values(i.rates).some(value => value !== undefined) && <p className="source-warning">Eigene gesetzliche Satzannahmen sind aktiv. Unter „Erweitert“ prüfen oder auf Standards zurücksetzen.</p>}
    </section>}
    {ranges.length > 0 && <section className="insurance-block" aria-labelledby="insurance-block-3-heading">
      <h3 id="insurance-block-3-heading">3. Beiträge je Phase <span className="section-status">{block3Status}</span></h3>
      <p>{block3Summary}</p>
      {ranges.map(({ phase }) => {
        const p = i[phase], label = labelFor(phase)
        const update = (patch: Partial<InsurancePhase>) => onChange({ ...i, [phase]: { ...p, ...patch } })
        return reasonsFor(phase).length ? <fieldset key={phase}><legend>Eigene Beiträge – {label}</legend>
          <p>Eigene KV und PV für die gesamte Phase, in heutiger Kaufkraft und nach allen Zuschüssen. Die Beträge ersetzen die automatische Berechnung. Es wird kein weiterer Zuschuss abgezogen. Auch 0 bitte ausdrücklich eintragen.</p>
          <OptionalNumber id={`insurance-${phase}-kvMonthlyToday`} label={`Eigene KV nach allen Zuschüssen – ${label} (€/Monat heute)`} value={p.kvMonthlyToday} onChange={kvMonthlyToday => update({ kvMonthlyToday })} />
          <OptionalNumber id={`insurance-${phase}-pvMonthlyToday`} label={`Eigene PV nach allen Zuschüssen – ${label} (€/Monat heute)`} value={p.pvMonthlyToday} onChange={pvMonthlyToday => update({ pvMonthlyToday })} />
        </fieldset> : p.status && p.status !== 'kvdr' ? <fieldset key={phase}><legend>Automatische Beiträge – {label}</legend>
          <label className="field"><span className="field-label">Kapitalbasis – {label}</span><select id={`insurance-${phase}-capitalMode`} value={capitalMode(p)} onChange={e => update({ capitalMode: e.target.value as 'automatic' | 'manual' })}><option value="automatic">Automatisch aus dem Portfolio schätzen</option><option value="manual">Manuelle Kapitalertragsschätzung</option></select></label>
          {capitalMode(p) === 'manual' && <><OptionalNumber id={`insurance-${phase}-capitalMonthlyToday`} label={`Beitragsrelevante Kapitalerträge – ${label} (€/Monat heute)`} value={p.capitalMonthlyToday} onChange={capitalMonthlyToday => update({ capitalMode: 'manual', capitalMonthlyToday })} /><p>Vor Steuern, nach beitragsrechtlichen Kosten. Schätzung oder ausdrücklich 0. Kein Depotwert, keine Gesamtrendite oder Entnahme; kein zusätzliches auszahlbares Einkommen. Bleibt in heutiger Kaufkraft konstant. Die KV/PV werden weiterhin automatisch berechnet.</p></>}
          {phase === 'pension' && <><label className="field"><span className="field-label">Rentenversicherungszuschuss einplanen?</span><select id="insurance-pension-drvSubsidy" value={p.drvSubsidy ?? ''} onChange={e => update({ drvSubsidy: (e.target.value || undefined) as InsurancePhase['drvSubsidy'] })}><option value="">Bitte auswählen</option><option value="confirmed">Ja</option><option value="not-received">Nein, nicht ansetzen</option></select></label><p>Planungsannahme; keine Prüfung eines Anspruchs.</p></>}
        </fieldset> : null
      })}
    </section>}
    {showEstimator && <section className="insurance-block" aria-labelledby="insurance-block-4-heading">
      <h3 id="insurance-block-4-heading">4. Kapitalertrags-Schätzung <span className="section-status">{block4Status}</span></h3>
      <p>{block4Summary}</p>
      <p>{ranges.some(({ phase }) => capitalMode(i[phase]) === 'manual') ? 'Automatische Schätzung aktiv – Phasen mit manueller Kapitalbasis nutzen den jeweiligen Monatswert aus Block 3.' : 'Automatische Schätzung aktiv.'} <button type="button" className="secondary-button" id="insurance-block-4-jump-to-vermoegen" onClick={() => { const target = block4Issues[0]?.fieldId ?? 'estimator-fundAcquisitionCost'; if (onJumpToEstimator) onJumpToEstimator(target); else focusField(target) }}>Anschaffungskosten, Umfang bestätigen und Basiszins im Vermögen ergänzen</button></p>
      {block4Issues.length > 0 && <ul>{block4Issues.map(issue => <li key={issue.code}><a href={`#${issue.fieldId}`} onClick={event => { event.preventDefault(); if (onJumpToEstimator) onJumpToEstimator(issue.fieldId); else focusField(issue.fieldId) }}>{issue.message}</a></li>)}</ul>}
    </section>}
    <details><summary>Jahresmodell und Rechenregeln</summary><p>Jahresmodell: Arbeitsende, Einkommensbeginn/-ende und Versicherungsübergang gelten ab dem jeweiligen Zeilen-Startalter, ohne Teiljahre. Basisjahr {i.referenceYear}; Alter = Kalenderjahr minus Geburtsjahr. PV: Kinder zählen ab 1. Januar ihres 25. Geburtstagsjahres nicht mehr; Kinderlosenzuschlag ab dem Jahr des 23. Geburtstags. Elterneigenschaft bleibt dauerhaft. Näherung ohne Monatsgenauigkeit.</p><p>Grenzen und Geldbeträge steigen mit der Inflation des jeweiligen Simulationspfads; Prozentsätze bleiben konstant. Regeln 2026, keine Bescheid- oder Centgenauigkeit.</p></details>
  </fieldset>
}
