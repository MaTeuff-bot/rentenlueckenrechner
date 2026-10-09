import { z } from 'zod'
import { SPARERPAUSCHBETRAG_SINGLE } from '../tax/capitalIncomeTax'
import { assessCore } from '../tax/pureCore'
import { marginalTargetsForAdditionalWealth, resolveAllocationTargets } from './allocationEvent'

// Insurance capital-income accounting API. See docs/insurance-capital-estimator.md for scope and ordering.
const money = z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER)
const signed = z.number().finite().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER)
const bucket = z.object({
  id: z.string().min(1),
  value: money,
  // Deliberately unrelated to the market return proxy or bucket name.
  eligibility: z.enum(['accumulating-equity-fund', 'ordinary-bank-deposit']),
})
const stateSchema = z.object({
  buckets: z.array(bucket),
  fundAcquisitionCost: money,
  assessedVorabpauschalen: money,
  pendingVorabpauschale: money,
  simulatedLossCarryforward: money,
}).superRefine((s, ctx) => {
  for (const total of [s.buckets.reduce((sum, b) => sum + b.value, 0),
    s.fundAcquisitionCost + s.assessedVorabpauschalen + s.pendingVorabpauschale]) {
    if (!money.safeParse(total).success)
      ctx.addIssue({ code: 'custom', message: 'Aggregate state monetary balance out of range' })
  }
  if (new Set(s.buckets.map(b => b.id)).size !== s.buckets.length)
    ctx.addIssue({ code: 'custom', message: 'Duplicate bucket IDs' })
  if (!s.buckets.some(b => b.eligibility === 'accumulating-equity-fund') &&
      (s.fundAcquisitionCost || s.assessedVorabpauschalen || s.pendingVorabpauschale))
    ctx.addIssue({ code: 'custom', message: 'Fund balances require fund buckets' })
})
export type EstimatorState = z.infer<typeof stateSchema>
export type EstimatorBucket = z.infer<typeof bucket>

export const estimatorDisclosures = [
  'Opening accumulated Vorabpauschalen are zero. Omitted existing history can distort estimates, including overstating sale income.',
  'Fund acquisition costs and assessed adjustments are pooled; sales are proportional, not FIFO or selective bucket sales.',
  'Annual receipt and insurance funding are planning approximations, not insurer assessment or billing timing.',
  'Kapitalertragsteuer auf Entnahmen im Ruhestand, auf Umschichtungsgewinne der Ansparphase und auf Bankzinsen (Abgeltungsteuer + Solidaritätszuschlag) wird berechnet und aus dem Portfolio finanziert; Bankzinsen ohne Teilfreistellung in derselben Bemessung; Sparerpauschbetrag mit Szenario-Inflation skaliert (Planungsannahme, gesetzlich nominal); Kirchensteuer und Günstigerprüfung sind nicht enthalten.',
] as const

/** Coverage declarations must be explicit; unknown/unsupported assets cannot disappear even at zero value. */
export function createEstimatorState(input: {
  buckets: EstimatorBucket[]
  fundAcquisitionCost: number
  scope: 'single-person-domestic-private-post-2017-no-special-events'
  lossHistory: 'confirmed-none-and-no-external-offsets'
}): EstimatorState {
  z.literal('single-person-domestic-private-post-2017-no-special-events').parse(input.scope)
  z.literal('confirmed-none-and-no-external-offsets').parse(input.lossHistory)
  return stateSchema.parse({ ...input, assessedVorabpauschalen: 0,
    pendingVorabpauschale: 0, simulatedLossCarryforward: 0 })
}

const vorabpauschaleSchema = z.object({ startValue: money, endValue: money, projectedBasisRate: signed,
  acquisitionMonth: z.number().int().min(1).max(12) })
const burdenSchema = z.object({ kv: money, pv: money })

/** §18: prices for the SAME units at calendar-year start/end, not their purchase cost.
 * acquisitionMonth is 1..12; pre-existing units use January/full-year factor.
 */
export function calculateVorabpauschale(input: {
  startValue: number; endValue: number; projectedBasisRate: number; acquisitionMonth: number
}): number {
  const p = vorabpauschaleSchema.parse(input)
  return money.parse(Math.max(0, Math.min(signed.parse(p.startValue * 0.7 * p.projectedBasisRate),
    p.endValue - p.startValue)) * (13 - p.acquisitionMonth) / 12)
}

const assessmentSchema = z.object({ bankInterest: money, receivedVorabpauschale: money,
    adjustedFundSaleGain: signed, openingSimulatedLoss: money,
    expenseAllowance: money.default(51),
    provenDeductibleAnnualExpenses: money.optional() })

/** Expenses do not create a loss pot. No saver allowance, stock-loss pot, external
 * income, cross-person offsets, tax assessment, or broker certification handling.
 */
export function assessCapitalIncome(input: {
  bankInterest: number; receivedVorabpauschale: number; adjustedFundSaleGain: number
  openingSimulatedLoss: number; expenseAllowance?: number; provenDeductibleAnnualExpenses?: number
}) {
  const p = assessmentSchema.parse(input)
  const fundIncomeAfterExemption = signed.parse(p.receivedVorabpauschale + p.adjustedFundSaleGain) * 0.7
  const netCapitalIncome = signed.parse(p.bankInterest + fundIncomeAfterExemption)
  const afterLoss = signed.parse(netCapitalIncome - p.openingSimulatedLoss)
  const expenseAllowance = Math.max(p.expenseAllowance, p.provenDeductibleAnnualExpenses ?? 0)
  return {
    fundIncomeAfterExemption, netCapitalIncome, expenseAllowance,
    annualAssessment: money.parse(Math.max(0, afterLoss - expenseAllowance)),
    closingSimulatedLoss: money.parse(Math.max(0, -afterLoss)),
  }
}

/** One immutable trial sale. Bank withdrawals return principal, including previously
 * credited interest; they do not assess that interest a second time.
 */
export function withdrawProportionally(state: EstimatorState, requested: number) {
  const s = stateSchema.parse(state)
  money.parse(requested)
  const total = money.parse(s.buckets.reduce((sum, b) => sum + b.value, 0))
  const paid = Math.min(total, requested)
  const fraction = total > 0 ? paid / total : 0
  const fundValue = s.buckets.filter(b => b.eligibility === 'accumulating-equity-fund')
    .reduce((sum, b) => sum + b.value, 0)
  const fundFraction = fundValue > 0 ? fraction : 0
  const fundProceeds = fundValue * fundFraction
  const costReleased = s.fundAcquisitionCost * fundFraction
  const adjustmentReleased = s.assessedVorabpauschalen * fundFraction
  const closing = stateSchema.parse({ ...s,
    buckets: s.buckets.map(b => ({ ...b, value: b.value * (1 - fraction) })),
    fundAcquisitionCost: s.fundAcquisitionCost * (1 - fundFraction),
    assessedVorabpauschalen: s.assessedVorabpauschalen * (1 - fundFraction),
    pendingVorabpauschale: s.pendingVorabpauschale * (1 - fundFraction),
  })
  return { state: closing, paid, shortfall: requested - paid, fraction, fundProceeds,
    bankPrincipalWithdrawn: paid - fundProceeds, costReleased, adjustmentReleased,
    adjustedFundSaleGain: signed.parse(fundProceeds - costReleased - adjustmentReleased) }
}

const yearSchema = z.object({
  projectedBasisRate: signed, // Required, even for bank-only paths. No UI assumption.
  buckets: z.array(z.object({ id: z.string().min(1), totalReturnRate: signed.min(-1), grossBankReturnRate: signed.optional(), contribution: money })),
  // Optional one-time allocation at the end of the first retirement year. Absent
  // means disabled: holdings drift with starting-share savings and proportional
  // withdrawals. Fixed targets are today's euros scaled by inflationFactor.
  allocationEvent: z.object({
    fixedTargets: z.array(z.object({ bucketId: z.string().min(1), amountToday: money })),
    remainderWeights: z.record(z.string(), z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER)).optional(),
    inflationFactor: z.number().finite().positive(),
  }).optional(),
  spendingLessOtherIncome: signed,
  expenseAllowance: money.default(51),
  provenDeductibleAnnualExpenses: money.optional(),
  tolerance: z.number().finite().positive().max(1).default(0.000001),
  maxIterations: z.number().int().min(1).max(256).default(100),
  // Kapitalertragsteuer on withdrawal-funded capital income (retirement Entnahmen),
  // on accumulation rebalancing (Umschichtung) gains and on gross bank interest.
  // All feed the same assessCore path: fund-only Teilfreistellung → + unexempted
  // interest → single shared loss offset → scaled allowance → 25% + Soli.
  // Single source for the loss input: the estimator opening state's simulated loss carryforward.
  // Callers pass the inflation-scaled allowance (base 1,000 EUR × factor); the default
  // covers factor 1 only.
  withdrawalTax: z.object({
    openingLossCarryforward: money,
    allowanceAvailable: money.default(SPARERPAUSCHBETRAG_SINGLE),
  }).optional(),
})
export type EstimatorYearInput = z.input<typeof yearSchema>
export type InsuranceBurden = { kv: number; pv: number }
export type WithdrawalTaxForTrial = { capitalIncomeTax: number } | null
export type AdditionalRequirementForTrial = (
  insurance: InsuranceBurden,
  withdrawalTax: WithdrawalTaxForTrial,
) => number
export type EstimatorYearOptions = {
  additionalRequirementForTrial?: AdditionalRequirementForTrial
  fundedExcessBound?: number
}

/** Callback returns TOTAL annual own KV/PV (net of subsidy), including other income.
 * Pure/deterministic callback required; annual assessment is assessment-only EUR.
 * Repeated trials always start at the same state. No trial consumes loss/VP balances.
 */
export function simulateEstimatorYear(
  state: EstimatorState,
  input: EstimatorYearInput,
  insuranceForAnnualAssessment: (annualAssessment: number) => InsuranceBurden,
  options?: EstimatorYearOptions,
) {
  const opening = stateSchema.parse(state)
  const p = yearSchema.parse(input)
  const additionalRequirementForTrial = options?.additionalRequirementForTrial
  const fundedExcessBound = options?.fundedExcessBound ?? 0
  if (!Number.isFinite(fundedExcessBound) || fundedExcessBound < 0 || fundedExcessBound > Number.MAX_SAFE_INTEGER)
    throw new Error('Funded excess bound must be finite non-negative')
  if (p.buckets.length !== opening.buckets.length || new Set(p.buckets.map(b => b.id)).size !== p.buckets.length ||
      p.buckets.some(b => !opening.buckets.some(o => o.id === b.id))) throw new Error('Year must cover every bucket exactly once')
  const receivedVorabpauschale = opening.pendingVorabpauschale
  let bankInterest = 0
  let investmentReturn = 0
  let contribution = 0
  let fundContribution = 0
  let contributionVorabpauschale = 0
  const oldHoldingVp = new Map<string, number>()
  const returnedBuckets = opening.buckets.map(b => {
    const movement = p.buckets.find(m => m.id === b.id)!
    const r = movement.totalReturnRate
    // Negative deposit proxies may represent fees/losses, not negative assessable interest.
    if (b.eligibility === 'ordinary-bank-deposit' && (movement.grossBankReturnRate ?? r) < 0) throw new Error('Negative bank return: negativer Brutto-Bankzinspfad nicht abgedeckt; Quelle prüfen.')
    const gain = signed.parse(b.value * r)
    investmentReturn += gain
    contribution += movement.contribution
    const value = money.parse(b.value + gain)
    if (b.eligibility === 'ordinary-bank-deposit') {
      const gross = movement.grossBankReturnRate ?? r
      if (gross < r) throw new Error('Gross bank interest cannot be below net return')
      bankInterest += money.parse(b.value * gross)
    }
    else {
      fundContribution += movement.contribution
      oldHoldingVp.set(b.id, calculateVorabpauschale({ startValue: b.value, endValue: value,
        projectedBasisRate: p.projectedBasisRate, acquisitionMonth: 1 }))
      // End-year purchases at December NAV. Infer January NAV for those units.
      // A zero NAV cannot price a new purchase; do not silently invent units.
      if (r === -1 && movement.contribution > 0) throw new Error('Cannot purchase a fund at zero NAV')
      if (movement.contribution > 0) contributionVorabpauschale += calculateVorabpauschale({
        startValue: movement.contribution / (1 + r), endValue: movement.contribution,
        projectedBasisRate: p.projectedBasisRate, acquisitionMonth: 12,
      })
    }
    return { ...b, value }
  })
  const beforeSale = stateSchema.parse({ ...opening, buckets: returnedBuckets,
    assessedVorabpauschalen: opening.assessedVorabpauschalen + receivedVorabpauschale,
    pendingVorabpauschale: 0 })
  const available = money.parse(returnedBuckets.reduce((sum, b) => sum + b.value, 0))
  // Validate the no-withdrawal envelope and full-sale assessment before invoking
  // user code. All supported trial balances lie within these monetary bounds.
  signed.parse(investmentReturn)
  money.parse(bankInterest)
  money.parse(contribution)
  const fullPending = money.parse([...oldHoldingVp.values()].reduce((sum, v) => sum + v, 0) + contributionVorabpauschale)
  stateSchema.parse({ ...beforeSale,
    buckets: returnedBuckets.map(b => ({ ...b,
      value: b.value + p.buckets.find(m => m.id === b.id)!.contribution })),
    fundAcquisitionCost: beforeSale.fundAcquisitionCost + fundContribution,
    pendingVorabpauschale: fullPending,
  })
  // One-time allocation event (or none). The event resolver needs declared
  // supported destinations only; the estimator bucket schema already restricts
  // eligibility to accumulating equity funds and ordinary bank deposits, so an
  // unknown destination id is the only remaining declaration error here.
  const event = p.allocationEvent ?? null
  if (event) {
    for (const fixed of event.fixedTargets) {
      if (!opening.buckets.some(b => b.id === fixed.bucketId))
        throw new Error(`Festbetragsziel „${fixed.bucketId}“ verweist auf eine unbekannte Anlage.`)
    }
    for (const id of Object.keys(event.remainderWeights ?? {})) {
      if (!opening.buckets.some(b => b.id === id))
        throw new Error(`Restanteil „${id}“ verweist auf eine unbekannte Anlage.`)
    }
  }
  const allocationViews = opening.buckets.map(b => ({ id: b.id, eligibility: b.eligibility }))
  // Post-funding settlement shared by every trial. Drift (no event) keeps
  // post-sale holdings and places a trial deposit proportionally to current
  // holdings (equally when that total is zero). The event allocates the net
  // base B = post-sale holdings + trial deposit via the fixed-priority /
  // remainder resolver T(B). Release pooled cost/assessed VP for actual fund
  // sales only; purchases add euro cost plus December pending VP (receipt next
  // year, no current-year return on new money).
  const maintainAllocation = (sale: ReturnType<typeof withdrawProportionally>, trialDeposit: number) => {
    const postSaleTotal = sale.state.buckets.reduce((s, b) => s + b.value, 0)
    const base = money.parse(postSaleTotal + trialDeposit)
    const resolved = event
      ? resolveAllocationTargets({ netWealth: base, inflationFactor: event.inflationFactor,
          buckets: allocationViews, fixedTargets: event.fixedTargets, remainderWeights: event.remainderWeights })
      : sale.state.buckets.map(b => ({ id: b.id,
          target: b.value + (postSaleTotal > 0 ? trialDeposit * b.value / postSaleTotal : trialDeposit / sale.state.buckets.length) }))
    const targetsById = new Map(resolved.map(r => [r.id, r.target]))
    const fundValue = sale.state.buckets.filter(b => b.eligibility === 'accumulating-equity-fund').reduce((s, b) => s + b.value, 0)
    let fundSales = 0, fundPurchases = 0, pending = 0
    const buckets = sale.state.buckets.map(b => {
      const m = p.buckets.find(m => m.id === b.id)!
      const target = money.parse(targetsById.get(b.id) ?? 0)
      if (b.eligibility === 'accumulating-equity-fund') {
        fundSales += Math.max(0, b.value - target)
        const purchase = Math.max(0, target - b.value)
        if (purchase > 0 && m.totalReturnRate === -1) throw new Error('Cannot purchase a fund at zero NAV (Allokationskauf nach vollständigem Fondsverlust nicht abgedeckt).')
        fundPurchases += purchase
        pending += (oldHoldingVp.get(b.id) ?? 0) * (1 - sale.fraction) * (b.value > 0 ? Math.min(1, target / b.value) : 0)
        if (purchase > 0) pending += calculateVorabpauschale({ startValue: purchase / (1 + m.totalReturnRate), endValue: purchase, projectedBasisRate: p.projectedBasisRate, acquisitionMonth: 12 })
      }
      return { ...b, value: target }
    })
    const fraction = fundValue > 0 ? fundSales / fundValue : 0
    const costReleased = sale.state.fundAcquisitionCost * fraction
    const adjustmentReleased = sale.state.assessedVorabpauschalen * fraction
    return { fundSales, fundPurchases, costReleased, adjustmentReleased,
      adjustedFundSaleGain: fundSales - costReleased - adjustmentReleased,
      state: stateSchema.parse({ ...sale.state, buckets,
        fundAcquisitionCost: sale.state.fundAcquisitionCost - costReleased + fundPurchases,
        assessedVorabpauschalen: sale.state.assessedVorabpauschalen - adjustmentReleased,
        pendingVorabpauschale: pending }),
    }
  }
  const isZeroNavAllocationError = (error: unknown): boolean =>
    error instanceof Error && error.message.includes('zero NAV')
  const assessmentForSale = (sale: ReturnType<typeof withdrawProportionally>, movement = maintainAllocation(sale, 0)) =>
    assessCapitalIncome({ bankInterest, receivedVorabpauschale,
      adjustedFundSaleGain: sale.adjustedFundSaleGain + movement.adjustedFundSaleGain, openingSimulatedLoss: opening.simulatedLossCarryforward,
      expenseAllowance: p.expenseAllowance,
      provenDeductibleAnnualExpenses: p.provenDeductibleAnnualExpenses })
  // Discarded envelope trades validate monetary bounds only when feasible. A
  // zero-NAV allocation purchase here is a discarded hypothetical, not an actual
  // settled purchase: skip it without inventing units, cost or VP so a valid
  // exhausted no-purchase root or genuine shortfall stays reachable. Only the
  // committed settlement below rejects an actual impossible purchase.
  const safeEnvelope = (requested: number): void => {
    try {
      assessmentForSale(withdrawProportionally(beforeSale, requested))
    } catch (error) {
      if (!isZeroNavAllocationError(error)) throw error
    }
  }
  safeEnvelope(0)
  safeEnvelope(available)
  // Signed annual cashflow trial. H is post-return wealth; paid = min(H, max(0, y))
  // is the actual proportional sale (never negative) and S = max(0, -y) the
  // incoming surplus deposit supplied from annual income only. Allocation targets
  // resolve against the net base T(H - paid + S), combining the funding sale and
  // the event trades in one assessment: received VP and bank interest once,
  // opening loss/allowances once, one shared capital-tax/KV/PV/pension callback.
  const trial = (y: number) => {
    const paid = Math.min(available, Math.max(0, y))
    const deposit = Math.max(0, -y)
    const sale = withdrawProportionally(beforeSale, paid)
    const movement = maintainAllocation(sale, deposit)
    const assessment = assessmentForSale(sale, movement)
    const insurance = burdenSchema.parse(insuranceForAnnualAssessment(assessment.annualAssessment))
    // Abgeltungsteuer joins the same funding fixed point as insurance: the sale that
    // funds the gap also funds its own tax, so required covers spending + insurance + tax
    // plus the optional additional requirement (pension tax via ledger hook).
    // Pure per trial (no balance consumed).
    // YearSchema already validated the loss/allowance numbers; the positional pure
    // core keeps trials allocation-light (no per-trial object parsing).
    // bankInterest is the year's already-credited gross interest (computed once above
    // from the gross bank yield, never re-credited per trial): fund-only exemption
    // first, then interest, then the single shared loss offset and allowance.
    const tax = p.withdrawalTax ? assessCore(
      sale.adjustedFundSaleGain + movement.adjustedFundSaleGain,
      receivedVorabpauschale,
      p.withdrawalTax.openingLossCarryforward,
      p.withdrawalTax.allowanceAvailable,
      true,
      bankInterest) : null
    const extra = additionalRequirementForTrial ? money.parse(additionalRequirementForTrial(insurance, tax)) : 0
    // Genuine signed need N (may be negative when income covers spending and all
    // modeled charges). The funded requirement stays max(0, N) for display and
    // for the ordinary year-end surplus lineage. The event-year trial solves the
    // signed residual y - N so the genuine surplus S = max(0, -y) enters the
    // allocation base T(H - paid + S) inside the shared assessment — never as a
    // post-hoc purchase that would first route through T(H) and overtax the surplus.
    const genuineNeed = p.spendingLessOtherIncome + money.parse(insurance.kv + insurance.pv) + (tax ? tax.capitalIncomeTax : 0) + extra
    const required = money.parse(Math.max(0, genuineNeed))
    return { sale, movement, assessment, insurance, tax, required, genuineNeed, paid, deposit, residual: event ? y - genuineNeed : y - required }
  }
  // Bracketed solver: no contractivity assumption. Report discontinuous or otherwise
  // unsolved callbacks instead of silently accepting an arbitrary final iteration.
  // A small positive high-side residual within fundedExcessBound is a fully funded
  // rounding candidate (statutory floors can prevent exact equality): commit that
  // high-side trial once and conserve the excess via same-year repurchase below.
  // Shortfall keeps a valid closing state; nonconverged keeps closingState null.
  // Bracketed solver over the signed cashflow: low admits an income-funded
  // deposit trial, high is post-return wealth H (full sale, minimal allocation
  // base). No global monotonicity is proven — in particular a negative high-side
  // residual in the event year does NOT prove that no smaller root exists (fewer
  // funding sales can mean fewer event-trade taxes, so a smaller y may validate).
  // The search only commits a directly validated residual or a bounded
  // pension-rounding candidate; otherwise it reports demonstrable shortfall vs
  // numerical nonconvergence honestly. A finite kink scan is an attempt, never a
  // global proof.
  // No -H clamp on low: an income surplus may exceed current holdings, and
  // clamping would corrupt the event-year bracket for surplus > H.
  // Discarded hypothetical allocation trades at zero NAV are infeasible trials,
  // not actual settled purchases: record the first diagnostic without inventing
  // units, cost or VP, and keep searching for a valid settled no-purchase root
  // or genuine shortfall. Only a committed settlement requiring a positive fund
  // purchase at zero NAV still rejects below.
  let firstZeroNavError: unknown = null
  const tryTrial = (y: number): { feasible: true; outcome: ReturnType<typeof trial> } | { feasible: false; error: unknown } => {
    try {
      return { feasible: true, outcome: trial(y) }
    } catch (error) {
      if (isZeroNavAllocationError(error)) {
        if (firstZeroNavError === null) firstZeroNavError = error
        return { feasible: false, error }
      }
      throw error
    }
  }
  const isEventYear = event !== null
  let low = Math.min(0, p.spendingLessOtherIncome)
  let high = available
  const lowAttempt = tryTrial(low)
  let result!: ReturnType<typeof trial>
  let lowResidual: number | null = lowAttempt.feasible ? lowAttempt.outcome.residual : null
  if (lowAttempt.feasible) result = lowAttempt.outcome
  let highResult!: ReturnType<typeof trial>
  let highResidual!: number
  let iterations = 1
  let status: 'converged' | 'shortfall' | 'nonconverged' = 'nonconverged'
  const runBracketSearch = (): void => {
    if (lowResidual === null) return
    for (; iterations <= p.maxIterations; iterations += 1) {
      // Bounded interpolation accelerates ordinary piecewise-linear contribution
      // callbacks. Periodic bisection retains bracket progress at kinks.
      const interpolated = low - lowResidual * (high - low) / (highResidual - lowResidual)
      const middle = iterations % 4 === 1 || !Number.isFinite(interpolated) || interpolated <= low || interpolated >= high
        ? low + (high - low) / 2 : interpolated
      const attempt = tryTrial(middle)
      if (!attempt.feasible) continue
      result = attempt.outcome
      if (Math.abs(result.residual) <= p.tolerance) { status = 'converged'; break }
      if (result.residual < 0) { low = middle; lowResidual = result.residual }
      else { high = middle; highResidual = result.residual; highResult = result }
    }
    iterations = Math.min(iterations, p.maxIterations)
    if (status === 'nonconverged' && highResidual >= 0 && highResidual <= fundedExcessBound + p.tolerance) {
      result = highResult
      status = 'converged'
    }
  }
  const buildFixedKinkLevels = (): number[] => {
    if (!isEventYear) return []
    const levels: number[] = []
    let cumulative = 0
    for (const fixed of event!.fixedTargets) {
      cumulative += fixed.amountToday * event!.inflationFactor
      const candidate = available - cumulative
      if (Number.isFinite(candidate) && candidate > low && candidate < high) levels.push(candidate)
    }
    levels.sort((a, b) => a - b)
    return levels
  }
  if (lowAttempt.feasible && Math.abs(lowAttempt.outcome.residual) <= p.tolerance) status = 'converged'
  else {
    const highAttempt = tryTrial(high)
    if (!highAttempt.feasible) throw highAttempt.error
    result = highAttempt.outcome
    highResult = result
    highResidual = result.residual
    if (Math.abs(result.residual) <= p.tolerance) status = 'converged'
    else if (!isEventYear && result.residual < -p.tolerance) status = 'shortfall'
    else if (isEventYear && result.residual < -p.tolerance) {
      // Event year with a negative high-side residual: scan the fixed-target
      // kink levels B = cumulative nominal fixed amounts (y = H - B) for a
      // directly validated root before judging fundability. A finite kink scan
      // is an attempt, never a global proof. Infeasible kink trials are skipped
      // without inventing units, cost or VP.
      const kinkLevels = buildFixedKinkLevels()
      let recoveredLowY: number | null = null
      let recoveredLowResidual: number | null = null
      let recoveredLowOutcome: ReturnType<typeof trial> | null = null
      let tightHighY: number | null = null
      let tightHighResidual: number | null = null
      let tightHighOutcome: ReturnType<typeof trial> | null = null
      for (const candidate of kinkLevels) {
        iterations += 1
        const kinkAttempt = tryTrial(candidate)
        if (!kinkAttempt.feasible) continue
        const kinkTrial = kinkAttempt.outcome
        if (Math.abs(kinkTrial.residual) <= p.tolerance) { result = kinkTrial; status = 'converged'; break }
        if (kinkTrial.residual < -p.tolerance && (recoveredLowY === null || candidate > recoveredLowY)) {
          recoveredLowY = candidate; recoveredLowResidual = kinkTrial.residual; recoveredLowOutcome = kinkTrial
        } else if (kinkTrial.residual > p.tolerance && (tightHighY === null || candidate < tightHighY)) {
          tightHighY = candidate; tightHighResidual = kinkTrial.residual; tightHighOutcome = kinkTrial
        }
      }
      if (status === 'nonconverged') {
        // Demonstrable shortfall only: even with zero charges the unavoidable
        // spending/income gap already exceeds holdings. Anything else is a
        // numerical nonconvergence diagnostic, not a manufactured insolvency.
        if (p.spendingLessOtherIncome > available + p.tolerance) status = 'shortfall'
        else if (lowResidual !== null) runBracketSearch()
        else if (recoveredLowY !== null) {
          low = recoveredLowY; lowResidual = recoveredLowResidual!
          if (recoveredLowOutcome !== null) result = recoveredLowOutcome
          if (tightHighY !== null && tightHighY < high && tightHighY > low) {
            high = tightHighY; highResidual = tightHighResidual!; highResult = tightHighOutcome!; result = tightHighOutcome!
          }
          runBracketSearch()
        }
        // Low still null and high negative: honest nonconvergence (no throw on
        // discarded trials; no global proof claimed).
      }
    }
    else {
      if (lowResidual !== null) runBracketSearch()
      else if (!isEventYear) {
        if (highResidual >= 0 && highResidual <= fundedExcessBound + p.tolerance) {
          result = highResult
          status = 'converged'
        } else if (highResidual > p.tolerance && firstZeroNavError !== null) throw firstZeroNavError
      } else {
        // Event year with a positive high-side residual and an infeasible low
        // discarded hypothetical: do not infer the actual target is impossible
        // from the failed low alone. The feasible interval for a bank-first
        // fixed priority is B <= 80 (fund remainder only above); evaluate the
        // fixed kinks for a directly validated boundary root or a reachable
        // feasible lower bracket, then continue the shared solver. Infeasible
        // mids stay skipped without inventing state, cost, VP or units; only a
        // directly validated residual or bounded rounding converges, otherwise
        // honest nonconvergence. No monotonicity, no global proof, no parallel
        // engine, no path drop, no clipping. Budgets (tolerance, maxIterations)
        // are unchanged.
        const kinkLevels = buildFixedKinkLevels()
        let recoveredLowY: number | null = null
        let recoveredLowResidual: number | null = null
        let tightHighY: number | null = null
        let tightHighResidual: number | null = null
        let tightHighOutcome: ReturnType<typeof trial> | null = null
        for (const candidate of kinkLevels) {
          iterations += 1
          const kinkAttempt = tryTrial(candidate)
          if (!kinkAttempt.feasible) continue
          const kinkTrial = kinkAttempt.outcome
          if (Math.abs(kinkTrial.residual) <= p.tolerance) { result = kinkTrial; status = 'converged'; break }
          if (kinkTrial.residual < -p.tolerance && (recoveredLowY === null || candidate > recoveredLowY)) {
            recoveredLowY = candidate; recoveredLowResidual = kinkTrial.residual
          } else if (kinkTrial.residual > p.tolerance && (tightHighY === null || candidate < tightHighY)) {
            tightHighY = candidate; tightHighResidual = kinkTrial.residual; tightHighOutcome = kinkTrial
          }
        }
        if (status === 'nonconverged' && recoveredLowY !== null) {
          low = recoveredLowY; lowResidual = recoveredLowResidual!
          if (tightHighY !== null && tightHighY < high) {
            high = tightHighY; highResidual = tightHighResidual!; highResult = tightHighOutcome!; result = tightHighOutcome!
          }
          runBracketSearch()
        } else if (status === 'nonconverged') {
          if (tightHighY !== null && tightHighY < high) {
            high = tightHighY; highResidual = tightHighResidual!; highResult = tightHighOutcome!; result = tightHighOutcome!
          }
          if (highResidual >= 0 && highResidual <= fundedExcessBound + p.tolerance) {
            result = highResult
            status = 'converged'
          } else if (highResidual > p.tolerance && firstZeroNavError !== null) throw firstZeroNavError
        }
      }
    }
  }
  // Commit: B = H - paid + S is the settled allocation base. In the event year
  // the signed solve converges at y ≈ N, so a genuine surplus arrives as the
  // trial deposit S = max(0, -y) inside the shared assessment — allocated once
  // via T(B) with one combined funding/event tax, VP, KV/PV and pension funding
  // sale. No post-hoc surplus purchase exists (routing the surplus through T(H)
  // first would sell fund holdings the signed base T(H + S) never sells, and
  // would overtax the surplus). Ordinary years converge at y ≈ max(0, N) with a
  // zero trial deposit and keep the established year-end surplus lineage outside
  // this settlement. The only extra above the base is the bounded rounding
  // excess E = max(0, y - N) (event) or max(0, y - max(0, N)) (ordinary),
  // confined to the individually justified pension-rounding bound and conserved
  // as marginal purchases T(B + E) - T(B) (event resolver, including partially
  // funded fixed priorities) or proportionally to current holdings (drift) —
  // purchases only, actual fund cost plus one December VP each, true zero-NAV guard.
  const base = status === 'converged' ? money.parse(available - result.sale.paid + result.deposit) : 0
  const eventSurplus = status === 'converged' && event ? money.parse(result.deposit) : 0
  const roundingExcess = status === 'converged' ? Math.max(0, result.residual) : 0
  if (status === 'converged' && roundingExcess > p.tolerance && roundingExcess > fundedExcessBound + p.tolerance)
    throw new Error('Finanzierungsüberschuss außerhalb der belegten Rundungsgrenze')
  const additional = status === 'converged' ? money.parse(roundingExcess) : 0
  let marginalFundCost = 0
  let marginalPending = 0
  let marginalBuckets: typeof result.movement.state.buckets | null = null
  if (status === 'converged' && additional > p.tolerance) {
    const marginals = event
      ? marginalTargetsForAdditionalWealth({ netWealth: base, baseWealth: base, additionalWealth: additional,
          inflationFactor: event.inflationFactor, buckets: allocationViews,
          fixedTargets: event.fixedTargets, remainderWeights: event.remainderWeights })
        .map(m => ({ id: m.id, additional: m.additional }))
      : (() => {
        const total = result.movement.state.buckets.reduce((s, b) => s + b.value, 0)
        return result.movement.state.buckets.map(b => ({ id: b.id,
          additional: total > 0 ? additional * b.value / total : additional / result.movement.state.buckets.length }))
      })()
    // Exact conservation: marginal targets sum to the additional amount;
    // sub-epsilon float dust settles on the largest share.
    const dust = additional - marginals.reduce((s, m) => s + m.additional, 0)
    if (Math.abs(dust) > 1e-6) throw new Error('Umschichtungsaufteilung erhält den Zusatzbetrag nicht.')
    if (dust !== 0) {
      let largest = 0
      for (let i = 1; i < marginals.length; i++) {
        if (marginals[i].additional > marginals[largest].additional) largest = i
      }
      marginals[largest].additional += dust
      if (marginals[largest].additional < 0) throw new Error('Umschichtungsaufteilung erhält den Zusatzbetrag nicht.')
    }
    marginalBuckets = result.movement.state.buckets.map(b => {
      const share = marginals.find(m => m.id === b.id)?.additional ?? 0
      if (b.eligibility === 'accumulating-equity-fund' && share > 0) {
        marginalFundCost += share
        const r = p.buckets.find(m => m.id === b.id)!.totalReturnRate
        if (r === -1) throw new Error('Cannot purchase a fund at zero NAV')
        marginalPending += calculateVorabpauschale({
          startValue: share / (1 + r), endValue: share,
          projectedBasisRate: p.projectedBasisRate, acquisitionMonth: 12,
        })
      }
      return { ...b, value: b.value + share }
    })
  }
  const movementBuckets = marginalBuckets ?? result.movement.state.buckets
  const movementFundCost = result.movement.state.fundAcquisitionCost + marginalFundCost
  const movementPending = result.movement.state.pendingVorabpauschale + marginalPending
  const pendingVorabpauschale = money.parse(movementPending + contributionVorabpauschale)
  const closing = stateSchema.parse({ ...result.movement.state,
    buckets: movementBuckets.map(b => ({ ...b,
      value: b.value + p.buckets.find(m => m.id === b.id)!.contribution })),
    fundAcquisitionCost: money.parse(movementFundCost + fundContribution),
    assessedVorabpauschalen: result.movement.state.assessedVorabpauschalen,
    pendingVorabpauschale, simulatedLossCarryforward: result.assessment.closingSimulatedLoss,
  })
  return {
    status, iterations, residual: result.residual,
    // Nonconverged trial is diagnostic only: no committable next state.
    closingState: status === 'nonconverged' ? null : closing,
    openingCapital: opening.buckets.reduce((sum, b) => sum + b.value, 0),
    investmentReturn: signed.parse(investmentReturn), contribution: money.parse(contribution),
    bankInterest, receivedVorabpauschale, pendingVorabpauschale,
    movement: result.movement, sale: result.sale, assessment: result.assessment, insurance: result.insurance,
    withdrawalTax: result.tax,
    requiredWithdrawal: result.required, paidWithdrawal: result.sale.paid,
    unfundedWithdrawal: Math.max(0, result.required - result.sale.paid),
    closingCapital: closing.buckets.reduce((sum, b) => sum + b.value, 0),
    excessRepurchase: status === 'converged' && roundingExcess > p.tolerance ? roundingExcess : 0,
    // Signed funding lineage: genuine need N, trial deposit S (carries the
    // event-year genuine surplus inside the signed trial; zero at every
    // converged ordinary trial), and the bounded rounding excess conserved as
    // marginal purchases above.
    genuineNeed: result.genuineNeed, trialDeposit: result.deposit,
    eventSurplusDeposit: eventSurplus, roundingExcess,
  }
}
