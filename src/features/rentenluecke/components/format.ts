import { roundToNearest } from '../../../shared/utils/rounding'

const currencyFormatter = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

const numberFormatter = new Intl.NumberFormat('de-DE', {
  maximumFractionDigits: 0,
})

const percentFormatter = new Intl.NumberFormat('de-DE', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

export function formatApproxCurrency(value: number, step = 1_000): string {
  return `ca. ${currencyFormatter.format(roundToNearest(value, step))}`
}

export function formatCurrency(value: number, step = 1): string {
  return currencyFormatter.format(roundToNearest(value, step))
}

export function formatNumber(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits }).format(value)
}

export function formatWholeNumber(value: number): string {
  return numberFormatter.format(value)
}

export function formatPercent(value: number): string {
  return percentFormatter.format(value)
}
