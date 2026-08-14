import type { ChangeEvent } from 'react'

type NumberInputProps = {
  id: string
  label: string
  value: number
  error?: string
  min?: number
  max?: number
  step?: number
  suffix?: string
  readOnly?: boolean
  onChange: (value: number) => void
}

function decimalPlaces(value: number): number {
  if (!Number.isFinite(value)) return 0
  const [, decimals = ''] = value.toString().split('.')
  return decimals.length
}

function formatInputValue(value: number, step: number): string {
  if (Number.isNaN(value)) return ''
  if (!Number.isFinite(value)) return String(value)

  const precision = decimalPlaces(step)
  if (precision === 0) return String(Math.round(value))

  return value.toFixed(precision).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')
}

export function NumberInput({
  id,
  label,
  value,
  error,
  min,
  max,
  step = 1,
  suffix,
  readOnly = false,
  onChange,
}: NumberInputProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (readOnly) {
      return
    }

    onChange(event.target.value === '' ? Number.NaN : event.target.valueAsNumber)
  }

  return (
    <label className="field" htmlFor={id}>
      <span className="field-label">{label}</span>
      <span className="field-control">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={formatInputValue(value, step)}
          readOnly={readOnly}
          onChange={handleChange}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        {suffix ? <span className="field-suffix">{suffix}</span> : null}
      </span>
      {error ? (
        <span className="field-error" id={`${id}-error`}>
          {error}
        </span>
      ) : null}
    </label>
  )
}
