import { getInsuranceBaseError, getInsuranceRateError } from '../../model/inputSchema'
import { CurrencyInput } from '../../../../shared/components/CurrencyInput'
import { PercentInput } from '../../../../shared/components/PercentInput'
import {
  INSURANCE_REFERENCE, type InsuranceRates, type RetirementInsurance,
} from '../../model/retirementInsurance'

const RATE_LABELS: Record<keyof InsuranceRates, string> = {
  pensionKv: 'KV-Eigenanteil gesetzliche Rente',
  generalKv: 'KV-Eigenanteil Betriebsrente / übrige Einkommen',
  passiveKv: 'KV-Eigenanteil private Rente / Miete / manuelle Portfolio-Basis',
  pv: 'PV-Eigenanteil im Ruhestand',
}

export function RetirementInsuranceSection({ insurance, onChange }: {
  insurance: RetirementInsurance
  onChange: (insurance: RetirementInsurance) => void
}) {
  return (
    <fieldset className="wide-fieldset">
      <legend>Kranken- und Pflegeversicherung im Ruhestand</legend>
      <label className="toggle">
        <input type="checkbox" checked={insurance.enabled}
          onChange={(event) => onChange({ ...insurance, enabled: event.target.checked })} />
        Geführte manuelle GKV-/PV-Schätzung aktivieren
      </label>
      <p>Freiwillige Planungshilfe für GKV. Nettoangaben sind vollständig verfügbar. Ohne Aktivierung gelten die bisherigen pauschalen Gesamtabzüge.</p>
      {insurance.enabled && <>
        <label className="field">
          <span className="field-label">Mein angegebener Versicherungsstatus im Ruhestand</span>
          <select value={insurance.status} onChange={(event) => onChange({ ...insurance, status: event.target.value as RetirementInsurance['status'] })}>
            <option value="unknown">Unbekannt / noch zu klären</option>
            <option value="kvdr">KVdR (pflichtversichert)</option>
            <option value="voluntary">Freiwillig gesetzlich versichert</option>
          </select>
        </label>
        <p>Deine Angabe ist eine Annahme. Die Krankenkasse prüft den Status; die App ermittelt keine KVdR-Berechtigung.</p>
        <p>Stand {INSURANCE_REFERENCE.verifiedOn}: Bei KVdR zählen insbesondere gesetzliche Rente, Versorgungsbezüge und nebenher erzieltes selbstständiges Arbeitseinkommen. Bei freiwilliger GKV zählen grundsätzlich auch weitere Einnahmen wie Mieten und Kapitalerträge. Die Kategorien unten sind vereinfachte, änderbare Planungsvorschläge.</p>
        <details>
          <summary>Referenzsätze {INSURANCE_REFERENCE.year} prüfen und ändern</summary>
          <p>Offizielle Quellen geprüft am {INSURANCE_REFERENCE.verifiedOn}. Alle Sätze sind deine eigene Belastung und bleiben über die gesamte Projektion konstant.</p>
          <p>Gesetzliche Rente: (14,6 % + 2,9 % durchschnittlicher Zusatzbeitrag) / 2 = 8,75 %. Der hälftige Anteil einschließlich Zusatzbeitrag des Rentenversicherungsträgers ist bereits berücksichtigt; bei freiwilliger GKV wird der entsprechende Zuschuss als erhalten angenommen. Der kassenindividuelle Zusatzbeitrag kann abweichen.</p>
          <p>Betriebsrente und übrige Einkommen: zunächst 17,5 % ohne fremde Beteiligung. Private Rente, Miete und Portfolio-Basis: zunächst 16,9 % (14 % ermäßigt + 2,9 %) ohne Krankengeldanspruch angenommen. Bei Nebenjobs insbesondere Beschäftigungsart, Arbeitgeberanteil und PV-Eigenanteil selbst prüfen und am Strom überschreiben. Die Rentenbeteiligung wird nur für gesetzliche Renten angenommen.</p>
          <p>PV: Referenz 3,6 % ohne Kinderlosenzuschlag und ohne Kinderabschläge, im Ruhestand selbst getragen. Für Kinderlose mit Zuschlag: 4,2 %. Die Ausgangsannahme sagt nichts über deine Kinder aus; wähle den passenden eigenen Satz. Keine automatische Kinderanpassung oder Ableitung aus dem Alter.</p>
          {Object.entries(RATE_LABELS).map(([key, label]) => <PercentInput step={0.01} key={key} id={`insurance-${key}`} label={label}
            value={insurance.rates[key as keyof InsuranceRates]} error={getInsuranceRateError(insurance.rates[key as keyof InsuranceRates])} min={0} max={100}
            onChange={(value) => onChange({ ...insurance, rates: { ...insurance.rates, [key]: value } })} />)}
          <button type="button" className="secondary-button" onClick={() => onChange({ ...insurance, rates: { ...insurance.rates, pv: INSURANCE_REFERENCE.childlessPv } })}>PV-Annahme: kinderlos mit Zuschlag (4,2 %)</button>
          <p><a href={INSURANCE_REFERENCE.sources.bmgContributions}>BMG: Beiträge und Einkommensarten</a> · <a href={INSURANCE_REFERENCE.sources.bmgCare}>BMG: Pflegebeiträge und Ausnahmen</a> · <a href={INSURANCE_REFERENCE.sources.drv}>DRV: Status, Rentenbeteiligung und Pflegeversicherung</a></p>
        </details>
        <p>Aktuelle PV-Annahme: {(insurance.rates.pv * 100).toLocaleString('de-DE')} % eigener Beitrag. Bitte ausdrücklich prüfen; der Startwert 3,6 % enthält keinen Kinderlosenzuschlag.</p>
        <CurrencyInput id="insurance-portfolio-base" label="Manuelle monatliche Portfolio-Beitragsbasis, heutige Kaufkraft" value={insurance.portfolioBaseMonthlyToday} error={getInsuranceBaseError(insurance.portfolioBaseMonthlyToday)}
          onChange={(portfolioBaseMonthlyToday) => onChange({ ...insurance, portfolioBaseMonthlyToday })} />
        <p>Nur eine selbst geschätzte Beitragsbasis ab Rentenbeginn, kein zusätzliches Einkommen. 0 € bedeutet: keine Portfolio-Beiträge angesetzt. Positive Beträge werden unabhängig vom Status mit den Sätzen für die Portfolio-Basis und PV belastet. Nicht aus Depotwert, Gesamtrendite oder Entnahme abgeleitet. Trage hier keine bereits in Nettobeträgen oder Pauschalen enthaltenen Versicherungskosten ein.</p>
        <p>Grenzen: keine Beitragsbemessungsgrenzen, Mindestbeiträge oder Freibeträge; keine PKV-Formeln, Familien-/Partnerregeln, grenzüberschreitenden Fälle, Steuern oder Anschaffungskosten-/Gewinnverfolgung. PKV kann weiterhin über Nettoangaben oder manuelle Gesamtabzüge abgebildet werden. Keine rechtliche Feststellung oder Sozialversicherungsberatung.</p>
      </>}
    </fieldset>
  )
}
