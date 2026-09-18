import type { RetirementInsurance } from '../../model/retirementInsurance'
import { BASIS_RATE_SOURCE, DEFAULT_PROJECTED_BASIS_RATE } from '../../model/capitalIncome/schema'
import { OptionalNumber } from './RetirementInsuranceSection'

export function CapitalEstimatorSetup({ insurance, onChange }: {
  insurance: RetirementInsurance; onChange: (value: RetirementInsurance) => void
}) {
  const setup = insurance.capitalEstimator ?? { projectedBasisRate: DEFAULT_PROJECTED_BASIS_RATE }
  const update = (patch: Partial<typeof setup>) => onChange({ ...insurance, capitalEstimator: { ...setup, ...patch } })
  return <fieldset><legend>Automatische Kapitalertragsschätzung</legend>
    <p>Alle tatsächlichen Anlagen oben klassifizieren. Unterstützt sind thesaurierende Aktienfonds und gewöhnliche Bankeinlagen. Andere oder ungeklärte Anlagen entfernen/ersetzen oder je Phase ausdrücklich die manuelle Kapitalertragsschätzung wählen; dabei bleibt das Portfolio erhalten.</p>
    <OptionalNumber id="estimator-fundAcquisitionCost" label="Anschaffungskosten des gesamten Fondspools (€)" value={setup.fundAcquisitionCost} onChange={fundAcquisitionCost => update({ fundAcquisitionCost })} />
    <p>Erforderlich bei Fonds, auch 0 ausdrücklich. Summe der Anschaffungskosten nur der Fonds, ohne Bankguthaben; darf den heutigen Fondsmarktwert übersteigen. Keine Einzelkosten oder FIFO.</p>
    <label className="field"><span><input id="estimator-scopeConfirmed" type="checkbox" checked={setup.scopeConfirmed ?? false} onChange={e => update({ scopeConfirmed: e.target.checked })} />Anlageumfang bestätigt: eine Person, inländisches Privatvermögen, Fondskäufe nach 2017 und vor dem ersten Modelljahr; keine Altbestände, Gemeinschaftsdepots, Sonderereignisse oder wechselnde Fondsklassifikation.</span></label>
    <label className="field"><span><input id="estimator-lossScopeConfirmed" type="checkbox" checked={setup.lossScopeConfirmed ?? false} onChange={e => update({ lossScopeConfirmed: e.target.checked })} />Verlustumfang bestätigt: keine bisherigen Kapitalverluste oder externen Verlusttöpfe; Verrechnung der simulierten Fondsverluste im eigenen zulässigen Kapital-Verrechnungskreis nachweisbar. Andernfalls manuelle Kapitalbasis verwenden.</span></label>
    <p>Frühere angesammelte und anfangs zufließende Vorabpauschalen starten mit 0. Ausgelassene Historie kann die Schätzung verzerren, insbesondere Verkaufsgewinne überschätzen und anfängliche Zuflüsse auslassen. Anschaffungskosten werden nicht auf 0 gesetzt.</p>
    <details><summary>Erweitert – projizierter Basiszins</summary>
      <OptionalNumber id="estimator-projectedBasisRate" label="Konstanter nominaler Basiszins (%)" value={setup.projectedBasisRate * 100} min={-100} max={100} onChange={v => update({ projectedBasisRate: v === undefined ? NaN : v / 100 })} />
      <p>Vorbelegung: 2026, 3,20 % – <a href={BASIS_RATE_SOURCE} target="_blank" rel="noreferrer">BMF-Schreiben vom 13. Januar 2026</a>. Letzten veröffentlichten Satz für die Planung fortschreiben, keine Prognose. Nominal konstant und unabhängig von Inflation; Vorabpauschalen werden jährlich aus den jeweiligen Werten neu berechnet.</p>
    </details>
    <p>Jährliche Näherung: Vorjahres-Vorabpauschale zufließen lassen, Rendite einmal anwenden, Ausgaben und KV/PV proportional aus Fonds und Bankguthaben finanzieren, bestehende feste Allokation durch Verkäufe/Käufe erhalten, danach Sparbeiträge anlegen. Fondsgewinne aus diesen Verkäufen fließen in die Bemessung ein. Bankzinsen sind Teil der Rendite, kein zusätzliches Geld. Negative Brutto-Zinspfade sind nicht automatisch abgedeckt.</p>
    <p>Jede Alterszeile steht für ein volles Kalenderjahr ab dem Basisjahr. Gleichjährige Versicherungsfinanzierung und Monatsdurchschnitte sind Planungsnäherungen, keine exakte Bescheid- oder Abrechnungsterminierung. Kapitalbasis ist kein auszahlbares Einkommen.</p>
    <p>Die Suche nach benötigtem Startkapital übernimmt die projizierten Kosten und Vorabpauschalen je Euro Kapital. Bei aufgebrauchtem Vermögen werden hypothetische Neukäufe zum Anschaffungspreis ohne Historie angesetzt.</p>
    <p><strong>Investmentsteuern werden nicht automatisch berechnet oder finanziert. Ergebnisse sind keine vollständig nach Steuern verfügbare Kaufkraft.</strong> Bestehende sonstige Einkommensabzüge bleiben erhalten.</p>
  </fieldset>
}
