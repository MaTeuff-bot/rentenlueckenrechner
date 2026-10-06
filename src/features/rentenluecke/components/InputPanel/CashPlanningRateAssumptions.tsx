import { useState } from 'react'
import { PercentInput } from '../../../../shared/components/PercentInput'
import {
  CASH_MODE_CONSTANT,
  CASH_MODE_HISTORICAL,
  CASH_MODE_REAL,
  CASH_PLANNING_RATE_PROPOSAL,
  CASH_REAL_RATE_PROPOSAL,
  DEFAULT_CASH_MODE,
} from '../../model/historicalReturns/constants'
import { dismissTagesgeldPlanningRateNotice, readTagesgeldPlanningRateNotice } from '../../hooks/scenarioState/persistence'

type CashPlanningRateAssumptionsProps = {
  cashMode?: string
  cashPlanningRate?: number
  cashRealRate?: number
  cashPlanningRateConfirmed?: boolean
  issue?: string | null
  onModeChange: (mode: string) => void
  onRateChange: (value: number | undefined) => void
  onRealRateChange: (value: number | undefined) => void
  onConfirmedChange: (confirmed: boolean) => void
}

export function CashPlanningRateAssumptions({
  cashMode,
  cashPlanningRate,
  cashRealRate,
  cashPlanningRateConfirmed,
  issue,
  onModeChange,
  onRateChange,
  onRealRateChange,
  onConfirmedChange,
}: CashPlanningRateAssumptionsProps) {
  const [noticeDismissed, setNoticeDismissed] = useState(
    () => typeof window !== 'undefined' && readTagesgeldPlanningRateNotice() === 'dismissed',
  )
  const noticeState =
    typeof window !== 'undefined' && !noticeDismissed ? readTagesgeldPlanningRateNotice() : 'dismissed'
  const showNotice = noticeState === 'pending'
  const dismissNotice = () => {
    dismissTagesgeldPlanningRateNotice()
    setNoticeDismissed(true)
  }
  const mode = cashMode ?? DEFAULT_CASH_MODE
  const displayRate = cashPlanningRate ?? CASH_PLANNING_RATE_PROPOSAL
  const displayRealRate = cashRealRate ?? CASH_REAL_RATE_PROPOSAL
  const rateError =
    cashPlanningRate !== undefined &&
    (!Number.isFinite(cashPlanningRate) || cashPlanningRate < 0)
      ? 'Bitte einen nicht negativen nominalen Planungszins eingeben (0 % zulässig).'
      : undefined
  const realRateError =
    cashRealRate !== undefined &&
    (!Number.isFinite(cashRealRate) || cashRealRate <= -1)
      ? 'Bitte eine finite Realzins-Annahme über -100 % eingeben (negativ zulässig, -100 % ausgeschlossen).'
      : undefined

  return (
    <fieldset className="wide-fieldset">
      <legend>Tagesgeld (Bankeinlagen)</legend>
      {showNotice ? (
        <div className="source-warning" role="status" data-testid="tagesgeld-planning-rate-notice">
          <p>
            Änderung: Tagesgeld (gewöhnliche Bankeinlagen) wird jetzt mit einer ausdrücklichen gemeinsamen
            Annahme unter Rechenannahmen gerechnet. Bisherige Cash-Quellen (Bills-Proxy, synthetische
            Cash-Annahme) gelten für Bankeinlagen nicht mehr; bitte Annahme prüfen, ausdrücklich bestätigen und
            Bank-Holdings erneut festlegen.
          </p>
          <button type="button" className="secondary-button" onClick={dismissNotice}>
            Verstanden
          </button>
        </div>
      ) : null}
      <div className="field" role="radiogroup" aria-label="Tagesgeld-Annahme">
        <label>
          <input
            id="cash-mode-constant"
            type="radio"
            name="cash-mode"
            value={CASH_MODE_CONSTANT}
            checked={mode === CASH_MODE_CONSTANT}
            onChange={() => onModeChange(CASH_MODE_CONSTANT)}
          />
          Konstanter nominaler Planungszins
        </label>
        <label>
          <input
            id="cash-mode-historical"
            type="radio"
            name="cash-mode"
            value={CASH_MODE_HISTORICAL}
            checked={mode === CASH_MODE_HISTORICAL}
            onChange={() => onModeChange(CASH_MODE_HISTORICAL)}
          />
          Historischer Spar-/Einlagen-Proxy mit 0%-Untergrenze (Kontowechsel-Strategie)
        </label>
        <label>
          <input
            id="cash-mode-real"
            type="radio"
            name="cash-mode"
            value={CASH_MODE_REAL}
            checked={mode === CASH_MODE_REAL}
            onChange={() => onModeChange(CASH_MODE_REAL)}
          />
          Realzins-Annahme mit nominaler 0%-Untergrenze
        </label>
      </div>
      {mode === CASH_MODE_CONSTANT ? (
        <>
          <PercentInput
            id="cash-planning-rate"
            label="Nominaler Tagesgeld-Planungszins p.a."
            value={displayRate}
            min={0}
            max={100}
            error={rateError}
            onChange={(value) => onRateChange(Number.isNaN(value) ? Number.NaN : value)}
          />
          <p>
            Ein gemeinsamer konstanter nominaler Planungszins für alle Jahre, Pfade und Bankeinlagen
            (Referenzpfad, Bootstrap-Pfade und Kapitalsuche rechnen mit demselben Satz; mehrere Bankeinlagen
            teilen sich diesen einen Satz).
          </p>
          <p>
            Brutto nominal ohne Inflationsaufschlag: Die Szenario-Inflation wird nicht auf den Nominalzins
            aufgeschlagen. Separate proportionale Bucket-Kosten bleiben bestehen und können die Nettorendite
            negativ machen; Inflation kann die reale Rendite negativ machen.
          </p>
          <p>
            Ergebnisbänder enthalten keine Tagesgeld-Zinsunsicherheit (konstanter Satz). Der vorbelegte Wert von{' '}
            {(CASH_PLANNING_RATE_PROPOSAL * 100).toLocaleString('de-DE')} % ist ein ausdrücklich zu bestätigender
            Vorschlag, kein geprüfter Markt- oder Langfristwert; variable Zinsmodellierung, Kalibrierung und
            Inflationskopplung sind offene Folgearbeiten.
          </p>
        </>
      ) : null}
      {mode === CASH_MODE_HISTORICAL ? (
        <>
          <p data-testid="cash-historical-disclosure">
            Strategie-Annahme: Die Sparerin bzw. der Sparer wechselt jeweils zu einem geeigneten Konto, das
            negative gutgeschriebene Zinsen vermeidet (angewandter Nominalzins je Stichprobenjahr mit 0 %-Untergrenze: max(0,
            beobachteter Jahreswert)). Ein solches Konto ist nicht für jeden Betrag und Zeitraum garantiert
            verfügbar. Wechselaufwand und -kosten, Angebotsbedingungen, Anspruchsvoraussetzungen,
            Guthabenlimits und die Aufteilung nach Einlagensicherung werden nicht modelliert.
          </p>
          <p>
            Rohwerte der Historie bleiben erhalten (inklusive beobachteter Negativwerte); die 0 %-Untergrenze
            ist Teil der Strategie, kein Abschneiden der Quelle. Das gezogene Markt-/Inflationsjahr bleibt
            gepaart (gemeinsames Kalenderjahr mit Aktien und Inflation). Separate Kontokosten und Inflation
            können weiterhin zu Verlusten führen.
          </p>
          <p>
            Quelle: deutscher Spar-/Tagesgeld-Proxy (SU0022 bis 2002, SUD101 ab 2003) mit Produkt- und
            Methodenbruch 2003, kein bestes Tagesgeld. Januar 1975 ist eine markierte Schätzung (keine
            erfundene Rohbeobachtung); frühe Jahre sind über Quartalsrepräsentanten annualisiert. Keine
            Zusage für die Zukunft.
          </p>
        </>
      ) : null}
      {mode === CASH_MODE_REAL ? (
        <>
          <PercentInput
            id="cash-real-rate"
            label="Realzins-Annahme p.a. (Ziel, vor 0 %-Untergrenze)"
            value={displayRealRate}
            min={-100}
            max={100}
            error={realRateError}
            onChange={(value) => onRealRateChange(Number.isNaN(value) ? Number.NaN : value)}
          />
          <p data-testid="cash-real-disclosure">
            Rechenregel je Stichprobenjahr: Nominalzins = (1 + Realziel) × (1 + Stichproben-Inflation) − 1,
            danach max(0, Nominalzins). Reale Folgen werden aus dem angewandten Nominalzins berechnet. Wo die
            0 %-Untergrenze greift, wird das Realziel nicht erreicht. Bei historischer Inflation gilt das
            jeweils gezogene Jahr; bei fester Inflation gilt der feste Eingabewert.
          </p>
          <p>
            Separate proportionale Bucket-Kosten bleiben bestehen und können die Nettorendite negativ machen.
            Der vorbelegte Wert von {(CASH_REAL_RATE_PROPOSAL * 100).toLocaleString('de-DE')} % ist eine
            ausdrücklich zu bestätigende deskriptive Annahme (keine kalibrierte Prognose).
          </p>
        </>
      ) : null}
      <label className="field">
        <span>
          <input
            id="cash-planning-rate-confirmed"
            type="checkbox"
            checked={cashPlanningRateConfirmed ?? false}
            onChange={(event) => onConfirmedChange(event.target.checked)}
          />
          {mode === CASH_MODE_HISTORICAL
            ? 'Ich übernehme ausdrücklich die historische Tagesgeld-Strategie mit nominaler 0 %-Untergrenze (Kontowechsel-Annahme, kein bestes Tagesgeld, keine Zinsgarantie) für alle Jahre, Pfade und Bankeinlagen.'
            : mode === CASH_MODE_REAL
              ? 'Ich übernehme ausdrücklich die obenstehende Realzins-Annahme mit nominaler 0 %-Untergrenze (Ziel wird bei greifender Untergrenze nicht erreicht) für alle Jahre, Pfade und Bankeinlagen.'
              : `Ich übernehme ausdrücklich den obenstehenden konstanten nominalen Planungszins (Vorschlag ${(CASH_PLANNING_RATE_PROPOSAL * 100).toLocaleString('de-DE')} %, kein geprüfter Markt-/Langfristwert) für alle Jahre, Pfade und Bankeinlagen.`}
        </span>
      </label>
      {issue ? (
        <p className="field-error" role="alert">
          {issue}
        </p>
      ) : null}
    </fieldset>
  )
}
