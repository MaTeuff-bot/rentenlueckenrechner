import { CurrencyInput } from '../../../shared/components/CurrencyInput'
import { NumberInput } from '../../../shared/components/NumberInput'
import { PercentInput } from '../../../shared/components/PercentInput'
import {
  findInflationSeries,
  getReturnSeriesOptionsForRole,
  HISTORICAL_MINIMUM_OBSERVATIONS,
  type ReturnModel,
} from '../model/historicalReturns'
import { inputLabels, type InputFieldName } from '../model/inputSchema'
import {
  ASSET_CLASS_ASSUMPTIONS,
  createPortfolioComponents,
  type AssetAllocation,
  type AssetClassKey,
} from '../model/stochasticReturns'
import type { RentenlueckeInput } from '../model/types'

type InputPanelProps = {
  input: RentenlueckeInput
  allocation: AssetAllocation
  returnModel: ReturnModel
  historical: {
    returnSeriesIds: {
      equity: string
      bond: string
      cash: string
    }
    inflationSeriesId: string
    manualCashRealReturn: number
  }
  historicalValidYears: number[]
  errors: Partial<Record<InputFieldName, string>>
  allocationError: string | null
  onChange: (field: InputFieldName, value: number) => void
  onAllocationChange: (field: AssetClassKey, value: number) => void
  onReturnModelChange: (returnModel: ReturnModel) => void
  onHistoricalReturnSeriesChange: (role: 'equity' | 'bond' | 'cash', seriesId: string) => void
  onManualCashRealReturnChange: (value: number) => void
  onReset: () => void
}

export function InputPanel({
  input,
  allocation,
  returnModel,
  historical,
  historicalValidYears,
  errors,
  allocationError,
  onChange,
  onAllocationChange,
  onReturnModelChange,
  onHistoricalReturnSeriesChange,
  onManualCashRealReturnChange,
  onReset,
}: InputPanelProps) {
  const portfolioComponents = createPortfolioComponents(allocation, historical.returnSeriesIds)
  const inflationSeries = findInflationSeries(historical.inflationSeriesId)
  const validYearLabel =
    historicalValidYears.length === 0
      ? 'Keine nutzbaren historischen Jahre'
      : `${historicalValidYears[0]}-${historicalValidYears.at(-1)}, ${historicalValidYears.length} Beobachtungen`

  return (
    <section className="panel input-panel" aria-labelledby="inputs-title">
      <div className="panel-heading">
        <div>
          <h2 id="inputs-title">Eingaben</h2>
          <p>Deine Eingaben werden nur lokal in diesem Browser gespeichert.</p>
        </div>
        <button className="secondary-button" type="button" onClick={onReset}>
          Eingaben zurücksetzen
        </button>
      </div>

      <div className="input-grid">
        <fieldset className="wide-fieldset">
          <legend>Renditemodell</legend>
          <div className="segmented-control" role="radiogroup" aria-label="Renditemodell">
            <label>
              <input
                type="radio"
                name="returnModel"
                value="synthetic"
                checked={returnModel === 'synthetic'}
                onChange={() => onReturnModelChange('synthetic')}
              />
              Synthetische Annahmen
            </label>
            <label>
              <input
                type="radio"
                name="returnModel"
                value="historicalAnnualBootstrap"
                checked={returnModel === 'historicalAnnualBootstrap'}
                onChange={() => onReturnModelChange('historicalAnnualBootstrap')}
              />
              Historischer Jahres-Bootstrap
            </label>
          </div>
          {returnModel === 'historicalAnnualBootstrap' ? (
            <div className="historical-mode-note">
              <strong>Phase-1-Provisorium:</strong> Die gebündelten Reihen sind kleine Fixture-Daten, keine
              recherchierten historischen Marktdaten. Nutzbare historische Jahre: {validYearLabel}.
              {historicalValidYears.length < HISTORICAL_MINIMUM_OBSERVATIONS ? (
                <span>
                  {' '}
                  Warnung: Unter {HISTORICAL_MINIMUM_OBSERVATIONS} Beobachtungen können Bootstrap-Ergebnisse instabil
                  sein.
                </span>
              ) : null}
            </div>
          ) : null}
        </fieldset>

        <fieldset>
          <legend>Persönliche Daten</legend>
          <NumberInput
            id="currentAge"
            label={inputLabels.currentAge}
            value={input.currentAge}
            min={0}
            max={100}
            error={errors.currentAge}
            onChange={(value) => onChange('currentAge', value)}
          />
          <NumberInput
            id="retirementAge"
            label={inputLabels.retirementAge}
            value={input.retirementAge}
            min={0}
            max={100}
            error={errors.retirementAge}
            onChange={(value) => onChange('retirementAge', value)}
          />
          <NumberInput
            id="planningAge"
            label={inputLabels.planningAge}
            value={input.planningAge}
            min={0}
            max={120}
            error={errors.planningAge}
            onChange={(value) => onChange('planningAge', value)}
          />
        </fieldset>

        <fieldset>
          <legend>Vermögen und Sparrate</legend>
          <CurrencyInput
            id="currentCapital"
            label={inputLabels.currentCapital}
            value={input.currentCapital}
            error={errors.currentCapital}
            onChange={(value) => onChange('currentCapital', value)}
          />
          <CurrencyInput
            id="monthlyContributionToday"
            label={inputLabels.monthlyContributionToday}
            value={input.monthlyContributionToday}
            error={errors.monthlyContributionToday}
            onChange={(value) => onChange('monthlyContributionToday', value)}
          />
        </fieldset>

        <fieldset>
          <legend>Ausgaben und Einkommen im Ruhestand</legend>
          <CurrencyInput
            id="monthlyDesiredSpendingToday"
            label={inputLabels.monthlyDesiredSpendingToday}
            value={input.monthlyDesiredSpendingToday}
            error={errors.monthlyDesiredSpendingToday}
            onChange={(value) => onChange('monthlyDesiredSpendingToday', value)}
          />
          <CurrencyInput
            id="monthlyRetirementIncomeToday"
            label={inputLabels.monthlyRetirementIncomeToday}
            value={input.monthlyRetirementIncomeToday}
            error={errors.monthlyRetirementIncomeToday}
            onChange={(value) => onChange('monthlyRetirementIncomeToday', value)}
          />
        </fieldset>

        <fieldset>
          <legend>Aufteilung</legend>
          {ASSET_CLASS_ASSUMPTIONS.map((assumption) => (
            <PercentInput
              key={assumption.key}
              id={`allocation-${assumption.key}`}
              label={assumption.label}
              value={allocation[assumption.key]}
              min={0}
              max={100}
              error={allocationError && assumption.key === 'fixed' ? allocationError : undefined}
              onChange={(value) => onAllocationChange(assumption.key, value)}
            />
          ))}
        </fieldset>

        {returnModel === 'historicalAnnualBootstrap' ? (
          <fieldset>
            <legend>Historische Datensätze</legend>
            {portfolioComponents.map((component) => {
              const role = component.role === 'bond' ? 'bond' : component.role === 'cash' ? 'cash' : 'equity'
              const options = getReturnSeriesOptionsForRole(component.role, historical.manualCashRealReturn)

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
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              )
            })}
            {historical.returnSeriesIds.cash === 'manual-fixed-real' ? (
              <PercentInput
                id="manualCashRealReturn"
                label="Cash: manueller fester Realzins"
                value={historical.manualCashRealReturn}
                min={-50}
                max={50}
                onChange={onManualCashRealReturnChange}
              />
            ) : null}
            <div className="field">
              <label className="field-label" htmlFor="historical-inflation-series">
                Inflationsdatensatz
              </label>
              <input
                id="historical-inflation-series"
                value={inflationSeries?.label ?? historical.inflationSeriesId}
                readOnly
                title={inflationSeries?.caveats.join(' ')}
              />
            </div>
          </fieldset>
        ) : null}

        <fieldset>
          <legend>Annahmen</legend>
          <PercentInput
            id="annualInflationRate"
            label={inputLabels.annualInflationRate}
            value={input.annualInflationRate}
            min={-5}
            max={20}
            error={errors.annualInflationRate}
            onChange={(value) => onChange('annualInflationRate', value)}
          />
          <PercentInput
            id="annualReturnBeforeRetirement"
            label={inputLabels.annualReturnBeforeRetirement}
            value={input.annualReturnBeforeRetirement}
            min={-50}
            max={50}
            error={errors.annualReturnBeforeRetirement}
            readOnly
            onChange={(value) => onChange('annualReturnBeforeRetirement', value)}
          />
          <PercentInput
            id="annualReturnInRetirement"
            label={inputLabels.annualReturnInRetirement}
            value={input.annualReturnInRetirement}
            min={-50}
            max={50}
            error={errors.annualReturnInRetirement}
            readOnly
            onChange={(value) => onChange('annualReturnInRetirement', value)}
          />
        </fieldset>
      </div>
    </section>
  )
}
