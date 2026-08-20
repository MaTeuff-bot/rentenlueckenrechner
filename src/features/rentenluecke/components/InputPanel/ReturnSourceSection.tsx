import { PercentInput } from '../../../../shared/components/PercentInput'
import { getReturnSeriesOptionsForRole } from '../../model/historicalReturns'
import type { PortfolioComponent } from '../../model/stochasticReturns'
import { formatDropdownLabel } from './sourceDisplay'

type ReturnSourceSectionProps = {
  portfolioComponents: PortfolioComponent[]
  manualCashRealReturn: number
  onHistoricalReturnSeriesChange: (role: 'equity' | 'bond' | 'cash', seriesId: string) => void
  onManualCashRealReturnChange: (value: number) => void
}

export function ReturnSourceSection({
  portfolioComponents,
  manualCashRealReturn,
  onHistoricalReturnSeriesChange,
  onManualCashRealReturnChange,
}: ReturnSourceSectionProps) {
  return (
    <fieldset>
      <legend>Renditequellen je Anlageklasse</legend>
      {portfolioComponents.map((component) => {
        const role = component.role === 'bond' ? 'bond' : component.role === 'cash' ? 'cash' : 'equity'
        const options = getReturnSeriesOptionsForRole(component.role, manualCashRealReturn)

        return (
          <div className="field" key={component.id}>
            <label className="field-label" htmlFor={`historical-series-${role}`}>
              {component.label}
            </label>
            <select
              id={`historical-series-${role}`}
              value={component.returnSeriesId}
              onChange={(event) => onHistoricalReturnSeriesChange(role, event.target.value)}
            >
              {options.map((option) => (
                <option key={option.id} value={option.id} title={option.caveats.join(' ')}>
                  {formatDropdownLabel(option)}
                </option>
              ))}
            </select>
          </div>
        )
      })}
      {portfolioComponents.some((component) => component.role === 'cash' && component.returnSeriesId === 'manual-fixed-real') ? (
        <PercentInput
          id="manualCashRealReturn"
          label="Cash: manueller fester Realzins"
          value={manualCashRealReturn}
          min={-50}
          max={50}
          onChange={onManualCashRealReturnChange}
        />
      ) : null}
    </fieldset>
  )
}
