import { OptionalNumber } from './RetirementInsuranceSection'
import type { RetirementInsurance } from '../../model/retirementInsurance'
export function InsuranceRateAssumptions({ insurance, onChange }: { insurance: RetirementInsurance; onChange: (insurance: RetirementInsurance) => void }) {
  return (
          <fieldset><legend>Gesetzliche Satzannahmen</legend>
            <p>Gesamtsätze vor Zusatzbeitrag und DRV-Beteiligung; die jährlichen Kinderregeln bleiben aktiv.</p>
            {([['kvGeneralRate', 'Allgemeiner KV-Satz', 14.6], ['kvReducedRate', 'Ermäßigter KV-Satz', 14], ['pvBaseRate', 'PV-Basissatz', 3.6]] as const).map(([key, label, standard]) => <OptionalNumber key={key} id={`insurance-rates-${key}`} label={`${label} (%; Standard ${standard})`} value={insurance?.rates?.[key] === undefined ? undefined : insurance.rates[key]! * 100} min={key === 'pvBaseRate' ? 1 : 0} max={50} onChange={value => onChange({ ...insurance, rates: { ...insurance?.rates, [key]: value === undefined ? undefined : value / 100 } })} />)}
            <button type="button" className="secondary-button" onClick={() => onChange({ ...insurance, rates: undefined })}>Gesetzliche Standards verwenden</button>
          </fieldset>
  )
}
