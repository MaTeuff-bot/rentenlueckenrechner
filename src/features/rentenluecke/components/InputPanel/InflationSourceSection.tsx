import { PercentInput } from '../../../../shared/components/PercentInput'
import { isFixedInflationSource, type InflationSourceOption } from '../../model/historicalReturns'
import { inputLabels, type InputFieldName } from '../../model/inputSchema'
import type { RentenlueckeInput } from '../../model/types'
import { formatInflationDropdownLabel } from './sourceDisplay'

type InflationSourceSectionProps = {
  input: RentenlueckeInput
  errors: Partial<Record<InputFieldName, string>>
  inflationSource: InflationSourceOption | undefined
  inflationOptions: InflationSourceOption[]
  selectedInflationSourceId: string
  onChange: (field: InputFieldName, value: number) => void
  onInflationSourceChange: (sourceId: string) => void
}

export function InflationSourceSection({
  input,
  errors,
  inflationSource,
  inflationOptions,
  selectedInflationSourceId,
  onChange,
  onInflationSourceChange,
}: InflationSourceSectionProps) {
  return (
    <fieldset>
      <legend>Inflation</legend>
      <p className="field-help">
        Die Szenario-Inflation steuert Zahlungsströme in heutiger Kaufkraft und die reale Darstellung des Ledgers. Bei
        historischen Quellen wird der gewählte CPI-Jahrespfad zusätzlich mit den gezogenen Kalenderjahren synchronisiert.
      </p>
      <div className="field">
        <label className="field-label" htmlFor="inflation-source">
          Inflationsquelle
        </label>
        <select
          id="inflation-source"
          value={selectedInflationSourceId}
          onChange={(event) => onInflationSourceChange(event.target.value)}
        >
          {inflationOptions.map((option) => (
            <option key={option.id} value={option.id} title={option.caveats.join(' ')}>
              {formatInflationDropdownLabel(option)}
            </option>
          ))}
        </select>
      </div>
      {inflationSource && isFixedInflationSource(inflationSource) ? (
        <PercentInput
          id="annualInflationRate"
          label={inputLabels.annualInflationRate}
          value={input.annualInflationRate}
          min={-5}
          max={20}
          error={errors.annualInflationRate}
          onChange={(value) => onChange('annualInflationRate', value)}
        />
      ) : null}
    </fieldset>
  )
}
