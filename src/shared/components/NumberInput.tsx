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
          value={Number.isNaN(value) ? '' : value}
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
