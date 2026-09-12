import { earliestPensionAge } from './retirementInsurance'
import type { RetirementIncomeStream } from './types'

/** All statutory dates participate, including zero amounts and unsupported streams.
 * Math.min propagates NaN: an invalid date must never select a later valid date. */
export function timelineBoundary(streams: readonly RetirementIncomeStream[], explicitTransition?: number) {
  return streams.some(stream => stream.kind === 'gesetzliche-rente') ? earliestPensionAge(streams) : explicitTransition
}

export function transitionAfterStreamsChange(previous: readonly RetirementIncomeStream[], next: readonly RetirementIncomeStream[], explicitTransition?: number) {
  return previous.some(s => s.kind === 'gesetzliche-rente') && !next.some(s => s.kind === 'gesetzliche-rente')
    ? undefined : explicitTransition
}
