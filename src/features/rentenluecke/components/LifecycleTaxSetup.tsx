import { CurrencyInput } from '../../../shared/components/CurrencyInput'
import { PercentInput } from '../../../shared/components/PercentInput'
import type { PortfolioBucket } from '../model/portfolioBuckets'
import type { LifecycleClassification, LifecycleTaxSettings } from '../hooks/scenarioState/types'

type Props = {
  buckets: PortfolioBucket[]
  classification: Record<string, LifecycleClassification | undefined>
  acquisitionCost: Record<string, number | undefined>
  taxCashId: string | undefined
  taxSettings: LifecycleTaxSettings
  onClassification: (id: string, kind: LifecycleClassification | undefined) => void
  onAcquisitionCost: (id: string, cost: number | undefined) => void
  onTaxCashId: (id: string | undefined) => void
  onTaxSettings: (patch: Partial<LifecycleTaxSettings>) => void
}

const currency = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

export function LifecycleTaxSetup(props: Props) {
  const { buckets, classification, acquisitionCost, taxCashId, taxSettings, onClassification, onAcquisitionCost, onTaxCashId, onTaxSettings } = props
  const total = buckets.reduce((n, b) => n + (Number.isFinite(b.value) ? Math.max(0, b.value) : 0), 0)
  const depositBuckets = buckets.filter((b) => classification[b.id] === 'deposit')
  return (
    <fieldset className="wide-fieldset">
      <legend>Lebenszyklus-Steuersetup (Pro Anlage)</legend>
      <p className="portfolio-note">Steuerklasse je Anlage ausdrücklich wählen, nie aus dem Rendite-Proxy ableiten. Anschaffungskosten je Fonds ausdrücklich angeben, auch 0. Eröffnung ohne Vorabpauschalen- oder Verlusthistorie.</p>
      <div className="portfolio-bucket-list">
        {buckets.map((bucket) => {
          const label = bucket.name.trim() || bucket.id
          const kind = classification[bucket.id]
          const cost = acquisitionCost[bucket.id]
          const isFund = kind === 'equityFund' || kind === 'bondFund'
          return (
            <div className="portfolio-bucket" key={bucket.id}>
              <strong>{label} · {currency.format(Number.isFinite(bucket.value) ? bucket.value : 0)}</strong>
              <label className="field">
                <span className="field-label">Steuerklasse</span>
                <select
                  id={`lifecycle-kind-${bucket.id}`}
                  aria-label={`Steuerklasse von ${label}`}
                  value={kind ?? ''}
                  onChange={(e) => {
                    const v = e.target.value
                    onClassification(bucket.id, v === 'equityFund' || v === 'bondFund' || v === 'deposit' ? v : undefined)
                  }}
                >
                  <option value="">Bitte wählen</option>
                  <option value="equityFund">Aktienfonds</option>
                  <option value="bondFund">Rentenfonds</option>
                  <option value="deposit">Einlage (Cash)</option>
                </select>
              </label>
              {isFund ? (
                <CurrencyInput
                  id={`lifecycle-basis-${bucket.id}`}
                  label={`Anschaffungskosten Fonds ${label}`}
                  value={cost ?? NaN}
                  error={cost === undefined || !Number.isFinite(cost) || cost < 0 ? 'Anschaffungskosten ausdrücklich angeben (auch 0).' : undefined}
                  onChange={(value) => onAcquisitionCost(bucket.id, Number.isNaN(value) ? NaN : value)}
                />
              ) : null}
            </div>
          )
        })}
      </div>
      <label className="field">
        <span className="field-label">Steuer-Cash-Konto (Einlage für Steuern, Entnahmen, KV/PV)</span>
        <select
          id="lifecycle-taxcash"
          value={taxCashId ?? ''}
          onChange={(e) => onTaxCashId(e.target.value || undefined)}
        >
          <option value="">Bitte wählen</option>
          {buckets.map((b) => (
            <option key={b.id} value={b.id} disabled={classification[b.id] !== 'deposit'}>
              {b.name.trim() || b.id}{classification[b.id] !== 'deposit' ? ' (keine Einlage)' : ''}
            </option>
          ))}
        </select>
      </label>
      {depositBuckets.length === 0 ? <p className="field-error">Mindestens eine Einlage als Cash-Konto erforderlich.</p> : null}
      <CurrencyInput
        id="lifecycle-allowance"
        label="Sparer-Pauschbetrag heute p.a. (wird mit Inflation indexiert)"
        value={taxSettings.allowanceAnnualToday ?? NaN}
        error={taxSettings.allowanceAnnualToday === undefined || !Number.isFinite(taxSettings.allowanceAnnualToday) || taxSettings.allowanceAnnualToday < 0 ? 'Pauschbetrag angeben (auch 0 ausdrücklich).' : undefined}
        onChange={(value) => onTaxSettings({ allowanceAnnualToday: value })}
      />
      <label className="field">
        <span className="field-label">Kirchensteuersatz</span>
        <select
          id="lifecycle-church"
          value={taxSettings.churchRate === undefined || Number.isNaN(taxSettings.churchRate) ? '' : String(taxSettings.churchRate)}
          onChange={(e) => {
            const v = e.target.value
            onTaxSettings({ churchRate: v === '' ? undefined : Number(v) as 0 | 0.08 | 0.09 })
          }}
        >
          <option value="">Bitte wählen</option>
          <option value="0">0 %</option>
          <option value="0.08">8 %</option>
          <option value="0.09">9 %</option>
        </select>
      </label>
      <details>
        <summary>Erweitert – Basiszins und Werbungskosten</summary>
        <PercentInput
          id="lifecycle-basisrate"
          label="Konstanter nominaler Basiszins"
          value={taxSettings.basisRate ?? NaN}
          error={taxSettings.basisRate === undefined || !Number.isFinite(taxSettings.basisRate) ? 'Basiszins prüfen und bestätigen.' : undefined}
          onChange={(v) => onTaxSettings({ basisRate: v })}
        />
        <CurrencyInput
          id="lifecycle-expense"
          label="Werbungskosten-Pauschale heute p.a. (leer = automatisch 51 € indexiert)"
          value={taxSettings.expenseAllowanceAnnualToday ?? NaN}
          onChange={(value) => onTaxSettings({ expenseAllowanceAnnualToday: Number.isNaN(value) ? undefined : value })}
        />
        <p className="portfolio-note">Geld-Beträge werden mit Inflation indexiert, Sätze bleiben konstant. Fondskosten je Quelle nur einmal (netOfFundCosts-Quellen ohne Zusatzabzug).</p>
      </details>
      <p className="portfolio-note">Gesamt heute: {currency.format(total)}. Kosten einmal je Quelle, kein Doppelabzug.</p>
    </fieldset>
  )
}
