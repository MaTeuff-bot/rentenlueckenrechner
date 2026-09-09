import { useState } from 'react'
import type { RetirementIncomeStream, YearlyPeriodRow } from '../model/types'
import { formatCurrency } from '../model/format'

export function InsuranceBreakdown({ rows, streams }: { rows: YearlyPeriodRow[]; streams: RetirementIncomeStream[] }) {
  const [selectedAge, setSelectedAge] = useState<number | undefined>()
  const row = rows.find(r => r.ageStart === selectedAge) ?? rows.find(r => r.insurance?.phase === 'pension') ?? rows[0]
  const c = row?.insurance
  if (!c) return null
  const monthly = (v: number) => formatCurrency(v / 12)
  return <section className="panel insurance-breakdown" aria-labelledby="insurance-breakdown-title"><h2 id="insurance-breakdown-title">Monatliche KV/PV-Aufschlüsselung</h2>
    <label className="field"><span className="field-label">Berechnungsjahr auswählen</span><select value={row.ageStart} onChange={e => setSelectedAge(Number(e.target.value))}>{rows.map(r => <option key={r.ageStart} value={r.ageStart}>{r.insurance?.calendarYear} · Alter {r.ageStart} · {r.insurance?.phase === 'bridge' ? 'Brücke' : 'Rentenphase'}</option>)}</select></label>
    <div className="source-chip-list">{(['bridge', 'pension'] as const).map(phase => {
      const first = rows.find(r => r.insurance?.phase === phase)
      return first && <button className="secondary-button" type="button" key={phase} onClick={() => setSelectedAge(first.ageStart)}>{phase === 'bridge' ? 'Erstes Brückenjahr' : 'Erstes Rentenjahr'}</button>
    })}</div>
    <p>Monatsdurchschnitt aus der gemeinsamen Jahresrechnung, nominal im ausgewählten Jahr. {c.status === 'manual' ? 'Manuelle Gesamtannahme.' : c.selectedStatus === 'unknown' ? 'Unbekannter Status: konservative freiwillige GKV, kein garantierter Höchstbeitrag.' : c.effectiveStatus === 'kvdr' ? 'Selbst gewählte KVdR.' : 'Freiwillige GKV.'}</p>
    <dl className="insurance-reconciliation">
      <dt>Einkommen vor sonstigen Abzügen und KV/PV</dt><dd>{monthly(row.retirementIncomeGross)}</dd>
      <dt>Sonstige Abzüge / Steuern</dt><dd>{monthly(row.retirementIncomeOtherDeductions)}</dd>
      <dt>Verfügbar vor KV/PV</dt><dd>{formatCurrency(c.cashflowBeforeInsuranceMonthly)}</dd>
      <dt>Beitragsbasis KV / PV</dt><dd>{c.status === 'automatic' ? `${formatCurrency(c.kvAssessmentMonthly)} / ${formatCurrency(c.pvAssessmentMonthly)}` : 'Nicht automatisch ermittelt'}</dd>
      <dt>KV gesamt vor DRV-Beteiligung / Zuschuss</dt><dd>{c.status === 'automatic' ? formatCurrency(c.totalKvContributionMonthly) : 'In eigener Gesamtannahme enthalten'}</dd>
      <dt>DRV-Beteiligung / Zuschuss (bereits im Eigenbeitrag berücksichtigt)</dt><dd>{c.status === 'automatic' ? formatCurrency(c.drvParticipationMonthly + c.drvSubsidyMonthly) : 'Bereits in manuellen Beträgen enthalten'}</dd>
      <dt>Eigene KV</dt><dd>{monthly(row.healthInsurance)}</dd>
      <dt>Eigene PV</dt><dd>{monthly(row.careInsurance)}</dd>
      <dt>Verfügbares Einkommen nach KV/PV</dt><dd><strong>{monthly(row.retirementIncomeNet)}</strong></dd>
    </dl>
    {row.retirementIncomeNet < 0 && <p>Die Beiträge übersteigen das Einkommen. Der negative Betrag erhöht die nötige Entnahme aus dem Vermögen.</p>}
    {c.status === 'manual' ? <p>Gesamte Phase manuell nach allen Zuschüssen. Automatische Grenzen, Freibeträge und Kinderanpassungen sind ersetzt; Bemessungsdetails liegen nicht vor.</p> : <>
      <p>PV-Satz {(c.pvRate * 100).toLocaleString('de-DE')} %; {c.childrenUnder25} anerkannte Kinder unter 25 nach der 1.-Januar-Näherung.</p>
      <details><summary>Bemessung und Grenzen erklären</summary>
        {c.assessment.map(line => <p key={line.kind}><strong>{({ 'statutory-pension': 'Gesetzliche Renten', 'occupational-pension': 'Betriebsrenten', 'other-income': 'Miete und Kapitalertragsbasis', 'minimum-top-up': 'Mindestbemessung: Auffüllbetrag' })[line.kind]}</strong>{line.sourceIds.some(id => streams.some(s => s.id === id)) ? ` (${line.sourceIds.map(id => streams.find(s => s.id === id)?.name).filter(Boolean).join(', ')})` : ''}: Eingang {formatCurrency(line.inputMonthly)} → KV-Basis {formatCurrency(line.kvAssessmentMonthly)}, PV-Basis {formatCurrency(line.pvAssessmentMonthly)}.</p>)}
        <p>Monatliche Grenzen in diesem Jahr: Obergrenze {formatCurrency(c.thresholds.monthlyCeiling)}, freiwillige Mindestbemessung {formatCurrency(c.thresholds.monthlyVoluntaryMinimum)}, Betriebsrenten-Freigrenze / KV-Freibetrag {formatCurrency(c.thresholds.monthlyOccupationalThreshold)}.</p>
        {c.effectiveStatus === 'voluntary' && <p>Erfasste Mietüberschüsse vor Steuern: {formatCurrency(c.rentalAssessmentMonthly)}; Kapitalertragsbasis: {formatCurrency(c.capitalAssessmentMonthly)}. Die Beitragsbasis kann vom verfügbaren Geld abweichen.</p>}
        <p>Eine gemeinsame Obergrenze, zuerst gesetzliche Renten, dann Betriebsrenten, danach Miete/Kapital. KVdR: ein gemeinsamer Betriebsrenten-KV-Freibetrag vor der Obergrenze; PV auf den vollen Betrag erst oberhalb der Freigrenze. Freiwillige GKV: kein Betriebsrentenfreibetrag, gegebenenfalls Mindestbemessung. Bei KVdR bleiben gewöhnliche Miete/Kapital beitragsfrei.</p>
        <p>Kapitalbasis {monthly(row.portfolioContributionBase)} ist nur eine Bemessungsannahme, kein zusätzliches Einkommen. Beiträge und heutige Kaufkraft stammen aus derselben Jahresrechnung.</p>
      </details>
    </>}
  </section>
}
