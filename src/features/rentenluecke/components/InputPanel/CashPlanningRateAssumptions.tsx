import { useState } from 'react'
import { PercentInput } from '../../../../shared/components/PercentInput'
import { CASH_PLANNING_RATE_PROPOSAL } from '../../model/historicalReturns/constants'
import { dismissTagesgeldPlanningRateNotice, readTagesgeldPlanningRateNotice } from '../../hooks/scenarioState/persistence'

type CashPlanningRateAssumptionsProps = {
  cashPlanningRate?: number
  cashPlanningRateConfirmed?: boolean
  issue?: string | null
  onRateChange: (value: number | undefined) => void
  onConfirmedChange: (confirmed: boolean) => void
}

export function CashPlanningRateAssumptions({
  cashPlanningRate,
  cashPlanningRateConfirmed,
  issue,
  onRateChange,
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
  const displayRate = cashPlanningRate ?? CASH_PLANNING_RATE_PROPOSAL
  const rateError =
    cashPlanningRate !== undefined &&
    (!Number.isFinite(cashPlanningRate) || cashPlanningRate < 0)
      ? 'Bitte einen nicht negativen nominalen Planungszins eingeben (0 % zulässig).'
      : undefined

  return (
    <fieldset className="wide-fieldset">
      <legend>Tagesgeld (Planungszins)</legend>
      {showNotice ? (
        <div className="source-warning" role="status" data-testid="tagesgeld-planning-rate-notice">
          <p>
            Änderung: Tagesgeld (gewöhnliche Bankeinlagen) wird jetzt mit einem ausdrücklichen konstanten
            Planungszins unter Rechenannahmen gerechnet. Bisherige Cash-Quellen (Bills-Proxy, synthetische
            Cash-Annahme) gelten für Bankeinlagen nicht mehr; bitte Satz prüfen, ausdrücklich bestätigen und
            Bank-Holdings erneut festlegen.
          </p>
          <button type="button" className="secondary-button" onClick={dismissNotice}>
            Verstanden
          </button>
        </div>
      ) : null}
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
      <label className="field">
        <span>
          <input
            id="cash-planning-rate-confirmed"
            type="checkbox"
            checked={cashPlanningRateConfirmed ?? false}
            onChange={(event) => onConfirmedChange(event.target.checked)}
          />
          Ich übernehme ausdrücklich den obenstehenden konstanten nominalen Planungszins (Vorschlag{' '}
          {(CASH_PLANNING_RATE_PROPOSAL * 100).toLocaleString('de-DE')} %, kein geprüfter Markt-/Langfristwert)
          für alle Jahre, Pfade und Bankeinlagen.
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
