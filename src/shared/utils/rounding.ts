export function roundToNearest(value: number, step: number): number {
  return Math.round(value / step) * step
}
