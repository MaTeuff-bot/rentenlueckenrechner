import { z } from 'zod'

// Inactive PR1 API. See docs/insurance-capital-estimator.md for scope and ordering.
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
  'Investment taxes are not calculated or funded; results are not fully after-tax spending power.',
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

/** §18: prices for the SAME units at calendar-year start/end, not their purchase cost.
 * acquisitionMonth is 1..12; pre-existing units use January/full-year factor.
 */
export function calculateVorabpauschale(input: {
  startValue: number; endValue: number; projectedBasisRate: number; acquisitionMonth: number
}): number {
  const p = z.object({ startValue: money, endValue: money, projectedBasisRate: signed,
    acquisitionMonth: z.number().int().min(1).max(12) }).parse(input)
  return money.parse(Math.max(0, Math.min(signed.parse(p.startValue * 0.7 * p.projectedBasisRate),
    p.endValue - p.startValue)) * (13 - p.acquisitionMonth) / 12)
}

/** Expenses do not create a loss pot. No saver allowance, stock-loss pot, external
 * income, cross-person offsets, tax assessment, or broker certification handling.
 */
export function assessCapitalIncome(input: {
  bankInterest: number; receivedVorabpauschale: number; adjustedFundSaleGain: number
  openingSimulatedLoss: number; expenseAllowance?: number; provenDeductibleAnnualExpenses?: number
}) {
  const p = z.object({ bankInterest: money, receivedVorabpauschale: money,
    adjustedFundSaleGain: signed, openingSimulatedLoss: money,
    expenseAllowance: money.default(51),
    provenDeductibleAnnualExpenses: money.optional() }).parse(input)
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
  buckets: z.array(z.object({ id: z.string().min(1), totalReturnRate: signed.min(-1), contribution: money })),
  spendingLessOtherIncome: signed,
  expenseAllowance: money.default(51),
  provenDeductibleAnnualExpenses: money.optional(),
  tolerance: z.number().finite().positive().max(1).default(0.000001),
  maxIterations: z.number().int().min(1).max(256).default(100),
})
export type EstimatorYearInput = z.input<typeof yearSchema>
export type InsuranceBurden = { kv: number; pv: number }

/** Callback returns TOTAL annual own KV/PV (net of subsidy), including other income.
 * Pure/deterministic callback required; annual assessment is assessment-only EUR.
 * Repeated trials always start at the same state. No trial consumes loss/VP balances.
 */
export function simulateEstimatorYear(
  state: EstimatorState,
  input: EstimatorYearInput,
  insuranceForAnnualAssessment: (annualAssessment: number) => InsuranceBurden,
) {
  const opening = stateSchema.parse(state)
  const p = yearSchema.parse(input)
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
    if (b.eligibility === 'ordinary-bank-deposit' && r < 0) throw new Error('Negative bank return needs explicit unsupported/manual treatment')
    const gain = signed.parse(b.value * r)
    investmentReturn += gain
    contribution += movement.contribution
    const value = money.parse(b.value + gain)
    if (b.eligibility === 'ordinary-bank-deposit') bankInterest += gain
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
  const assessmentForSale = (sale: ReturnType<typeof withdrawProportionally>) =>
    assessCapitalIncome({ bankInterest, receivedVorabpauschale,
      adjustedFundSaleGain: sale.adjustedFundSaleGain, openingSimulatedLoss: opening.simulatedLossCarryforward,
      expenseAllowance: p.expenseAllowance,
      provenDeductibleAnnualExpenses: p.provenDeductibleAnnualExpenses })
  assessmentForSale(withdrawProportionally(beforeSale, 0))
  assessmentForSale(withdrawProportionally(beforeSale, available))
  const trial = (withdrawal: number) => {
    const sale = withdrawProportionally(beforeSale, withdrawal)
    const assessment = assessmentForSale(sale)
    const insurance = z.object({ kv: money, pv: money }).parse(insuranceForAnnualAssessment(assessment.annualAssessment))
    const required = money.parse(Math.max(0, p.spendingLessOtherIncome + money.parse(insurance.kv + insurance.pv)))
    return { sale, assessment, insurance, required, residual: withdrawal - required }
  }
  // Bracketed solver: no contractivity assumption. Report discontinuous or otherwise
  // unsolved callbacks instead of silently accepting an arbitrary final iteration.
  let low = 0
  let high = available
  let result = trial(low)
  let iterations = 1
  let status: 'converged' | 'shortfall' | 'nonconverged' = 'nonconverged'
  if (Math.abs(result.residual) <= p.tolerance) status = 'converged'
  else {
    result = trial(high)
    if (result.residual < -p.tolerance) status = 'shortfall'
    else if (Math.abs(result.residual) <= p.tolerance) status = 'converged'
    else {
      for (iterations = 1; iterations <= p.maxIterations; iterations += 1) {
        const middle = low + (high - low) / 2
        result = trial(middle)
        if (Math.abs(result.residual) <= p.tolerance) { status = 'converged'; break }
        if (result.residual < 0) low = middle
        else high = middle
      }
      iterations = Math.min(iterations, p.maxIterations)
    }
  }
  const pendingVorabpauschale = [...oldHoldingVp.values()].reduce((sum, v) => sum + v, 0) *
    (1 - result.sale.fraction) + contributionVorabpauschale
  const closing = stateSchema.parse({ ...result.sale.state,
    buckets: result.sale.state.buckets.map(b => ({ ...b,
      value: b.value + p.buckets.find(m => m.id === b.id)!.contribution })),
    fundAcquisitionCost: result.sale.state.fundAcquisitionCost + fundContribution,
    pendingVorabpauschale, simulatedLossCarryforward: result.assessment.closingSimulatedLoss,
  })
  return {
    status, iterations, residual: result.residual,
    // Nonconverged trial is diagnostic only: no committable next state.
    closingState: status === 'nonconverged' ? null : closing,
    openingCapital: opening.buckets.reduce((sum, b) => sum + b.value, 0),
    investmentReturn: signed.parse(investmentReturn), contribution: money.parse(contribution),
    bankInterest, receivedVorabpauschale, pendingVorabpauschale,
    sale: result.sale, assessment: result.assessment, insurance: result.insurance,
    requiredWithdrawal: result.required, paidWithdrawal: result.sale.paid,
    unfundedWithdrawal: Math.max(0, result.required - result.sale.paid),
    closingCapital: closing.buckets.reduce((sum, b) => sum + b.value, 0),
  }
}
