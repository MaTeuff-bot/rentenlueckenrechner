import { BASIS_RATE_SOURCE, DEFAULT_PROJECTED_BASIS_RATE } from '../../model/capitalIncome/schema'
import type { PortfolioEstimatorReadiness, PortfolioEstimatorSettings } from '../../model/capitalIncome/portfolioEstimator'
import { focusField } from '../inputNavigation'
import { OptionalNumber } from './OptionalNumber'

export function CapitalEstimatorSetup({ settings, readiness, needsAutomatic, onSettingsChange, onJumpToInsurance }: {
  settings: PortfolioEstimatorSettings | undefined
  readiness: PortfolioEstimatorReadiness
  needsAutomatic: boolean
  onSettingsChange: (value: PortfolioEstimatorSettings | undefined) => void
  onJumpToInsurance?: () => void
}) {
  const setup = settings ?? { projectedBasisRate: DEFAULT_PROJECTED_BASIS_RATE }
  const update = (patch: Partial<PortfolioEstimatorSettings>) => onSettingsChange({ ...setup, ...patch } as PortfolioEstimatorSettings)
  const jumpToInsurance = () => {
    if (onJumpToInsurance) onJumpToInsurance()
    else focusField('insurance-block-3-heading')
  }
  void needsAutomatic
  const readinessLabel = readiness.ready
    ? 'Bereit für detaillierte Schätzung.'
    : 'Unvollständig – detaillierte Schätzung blockiert bis zur Ergänzung im Vermögen.'
  return <details id="estimator-details" open={!readiness.ready ? true : undefined}><summary>Anschaffungskosten und Ertragsschätzung</summary>
  <fieldset><legend>Anschaffungskosten und Ertragsschätzung</legend>
    <p id="estimator-readiness" data-testid="estimator-readiness">{readinessLabel}</p>
    <p>Die detaillierte Schätzung ist für jede Prognose erforderlich und läuft in allen Versicherungsmodi mit derselben Methode. <button type="button" className="secondary-button" id="estimator-jump-to-insurance" onClick={jumpToInsurance}>Versicherung im Überblick prüfen</button></p>
    <p>Alle tatsächlichen Anlagen oben klassifizieren. Unterstützt sind thesaurierende Aktienfonds und gewöhnliche Bankeinlagen. Andere oder ungeklärte Anlagen entfernen oder ersetzen.</p>
    <OptionalNumber id="estimator-fundAcquisitionCost" label="Anschaffungskosten des gesamten Fondspools (€)" value={setup.fundAcquisitionCost} onChange={fundAcquisitionCost => update({ fundAcquisitionCost })} />
    <p>Erforderlich bei Fonds, auch 0 ausdrücklich. Summe der Anschaffungskosten nur der Fonds, ohne Bankguthaben; darf den heutigen Fondsmarktwert übersteigen. Keine Einzelkosten oder FIFO.</p>
    <label className="field"><span><input id="estimator-scopeConfirmed" type="checkbox" checked={setup.scopeConfirmed ?? false} onChange={e => update({ scopeConfirmed: e.target.checked })} />Anlageumfang bestätigt: eine Person, inländisches Privatvermögen, Fondskäufe nach 2017 und vor dem ersten Modelljahr; keine Altbestände, Gemeinschaftsdepots, Sonderereignisse oder wechselnde Fondsklassifikation.</span></label>
    <label className="field"><span><input id="estimator-lossScopeConfirmed" type="checkbox" checked={setup.lossScopeConfirmed ?? false} onChange={e => update({ lossScopeConfirmed: e.target.checked })} />Verlustumfang bestätigt: keine bisherigen Kapitalverluste oder externen Verlusttöpfe; Verrechnung der simulierten Fondsverluste im eigenen zulässigen Kapital-Verrechnungskreis nachweisbar. Andernfalls ist keine Prognose möglich.</span></label>
    <p>Frühere angesammelte und anfangs zufließende Vorabpauschalen starten mit 0. Ausgelassene Historie kann die Schätzung verzerren, insbesondere Verkaufsgewinne überschätzen und anfängliche Zuflüsse auslassen. Anschaffungskosten werden nicht auf 0 gesetzt.</p>
    <details><summary>Erweitert – projizierter Basiszins</summary>
      <OptionalNumber id="estimator-projectedBasisRate" label="Konstanter nominaler Basiszins (%)" value={setup.projectedBasisRate * 100} min={-100} max={100} onChange={v => update({ projectedBasisRate: v === undefined ? NaN : v / 100 })} />
      <p>Vorbelegung: 2026, 3,20 % – <a href={BASIS_RATE_SOURCE} target="_blank" rel="noreferrer">BMF-Schreiben vom 13. Januar 2026</a>. Letzten veröffentlichten Satz für die Planung fortschreiben, keine Prognose. Nominal konstant und unabhängig von Inflation; Vorabpauschalen werden jährlich aus den jeweiligen Werten neu berechnet.</p>
    </details>
    <p>Jährliche Näherung: Vorjahres-Vorabpauschale zufließen lassen, Rendite einmal anwenden, Ausgaben und KV/PV proportional aus Fonds und Bankguthaben finanzieren, bestehende feste Allokation durch Verkäufe/Käufe erhalten, danach Sparbeiträge anlegen. Fondsgewinne aus diesen Verkäufen fließen in die Bemessung ein. Bankzinsen sind Teil der Rendite, kein zusätzliches Geld. Negative Brutto-Zinspfade sind nicht automatisch abgedeckt: Enthält die Anlage Bankguthaben, kann ein einziger abgetasteter Negativpfad die gesamte Berechnung blockieren – dann erscheint keine Prognose.</p>
    <p>Jede Alterszeile steht für ein volles Kalenderjahr ab dem Basisjahr. Gleichjährige Versicherungsfinanzierung und Monatsdurchschnitte sind Planungsnäherungen, keine exakte Bescheid- oder Abrechnungsterminierung. Kapitalbasis ist kein auszahlbares Einkommen.</p>
    <p>Die Suche nach benötigtem Startkapital übernimmt die projizierten Kosten und Vorabpauschalen je Euro Kapital. Bei aufgebrauchtem Vermögen werden hypothetische Neukäufe zum Anschaffungspreis ohne Historie angesetzt.</p>
    <p><strong>Kapitalertragsteuer auf Entnahmen, Umschichtungsgewinne und Bankzinsen wird detailliert berechnet und aus dem Portfolio finanziert (Abgeltungsteuer 25 % zuzüglich 5,5 % Solidaritätszuschlag, ohne Kirchensteuer und Günstigerprüfung; Bankzinsen ohne Teilfreistellung in derselben Bemessung).</strong> Ergebnisse bleiben Planungsnäherungen und keine vollständig nach Steuern verfügbare Kaufkraft. Reicht das übrige Einkommen nicht für die GRV-Rentensteuer, deckt die erforderliche Entnahme Bedarf, KV/PV, Kapitalertragsteuer und Rentensteuer gemeinsam im selben Finanzierungs-Fixpunkt (kein Vermögensverbrauch nötig, solange ein Überschuss die Steuer trägt). Ein kleiner rundungsbedingter Mehrbetrag (≤ Szenario-Inflationsfaktor) wird im selben Jahr zu Zielgewichten zurückgekauft.</p>
  </fieldset>
  </details>
}
