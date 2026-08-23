import { CurrencyInput } from '../../../../shared/components/CurrencyInput'
import type { PortfolioBucket } from '../../model/portfolioBuckets'
import { getReturnSeriesOptions } from '../../model/historicalReturns'
import { formatDropdownLabel } from './sourceDisplay'
import type { AssetAllocation } from '../../model/stochasticReturns'

type Props = {
  buckets: PortfolioBucket[]
  total: number
  allocation: AssetAllocation
  error: string | null
  onUpdate: (id: string, patch: Partial<Omit<PortfolioBucket, 'id'>>) => void
  onAdd: () => void
  onRemove: (id: string) => void
}

const percent = new Intl.NumberFormat('de-DE', { style: 'percent', maximumFractionDigits: 1 })
const currency = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

export function PortfolioBucketSection({ buckets, total, allocation, error, onUpdate, onAdd, onRemove }: Props) {
  return (
    <fieldset className="wide-fieldset portfolio-section">
      <legend>Anlagen</legend>
      <div className="portfolio-bucket-list">
        {buckets.map((bucket, index) => {
          const fallbackName = `Anlage ${index + 1}`
          const label = bucket.name.trim() || fallbackName
          const sourceOptions = getReturnSeriesOptions()
          return (
            <div className="portfolio-bucket" key={bucket.id}>
              <label className="field">
                <span className="field-label">Name</span>
                <input type="text" aria-label={`Name von ${label}`} value={bucket.name} placeholder={fallbackName} onChange={(event) => onUpdate(bucket.id, { name: event.target.value })} />
              </label>
              <label className="field">
                <span className="field-label">Renditequelle/Proxy</span>
                <select aria-label={`Renditequelle/Proxy von ${label}`} value={bucket.returnSeriesId} onChange={(event) => onUpdate(bucket.id, { returnSeriesId: event.target.value })}>
                  {sourceOptions.map((option) => <option key={option.id} value={option.id}>{formatDropdownLabel(option)}</option>)}
                </select>
              </label>
              <CurrencyInput id={`portfolio-value-${bucket.id}`} label={`Aktueller Wert von ${label}`} value={bucket.value} error={!Number.isFinite(bucket.value) || bucket.value < 0 ? 'Bitte einen nicht negativen Wert eingeben.' : undefined} onChange={(value) => onUpdate(bucket.id, { value })} />
              <button className="secondary-button portfolio-remove" type="button" aria-label={`${label} entfernen`} onClick={() => onRemove(bucket.id)}>Entfernen</button>
            </div>
          )
        })}
      </div>
      <button className="secondary-button portfolio-add" type="button" onClick={onAdd}>+ Anlage hinzufügen</button>
      <div className="portfolio-summary" aria-label="Portfolio-Zusammenfassung">
        <strong>Gesamtwert: {currency.format(Number.isFinite(total) ? total : 0)}</strong>
        <span>Aktien {percent.format(allocation.equity)}</span>
        <span>Anleihen {percent.format(allocation.bonds)}</span>
        <span>Cash {percent.format(allocation.fixed)}</span>
      </div>
      {error ? <p className="field-error">{error}</p> : null}
      <p className="portfolio-note">Die Simulation nutzt die aus diesen Anlagen abgeleitete Zielaufteilung; einzelne Anlagen werden noch nicht separat projiziert.</p>
    </fieldset>
  )
}
