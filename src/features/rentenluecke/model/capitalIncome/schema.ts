import { z } from 'zod'
export const BASIS_RATE_SOURCE = 'https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Investmentsteuer/2026-01-13-basiszins-berechnung-vorabpauschale.html'
export const DEFAULT_PROJECTED_BASIS_RATE = 0.032
export const holdingSchema = z.enum(['accumulating-equity-fund', 'ordinary-bank-deposit', 'unsupported'])
export const estimatorSetupSchema = z.object({
  fundAcquisitionCost: z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  projectedBasisRate: z.number().finite().min(-1).max(1).default(DEFAULT_PROJECTED_BASIS_RATE),
  scopeConfirmed: z.boolean().optional(),
  lossScopeConfirmed: z.boolean().optional(),
})
export const estimatorPortfolioSchema = z.array(z.object({
  id: z.string(), name: z.string(), value: z.number().finite().nonnegative(),
  returnSeriesId: z.string(), annualCostRate: z.number().min(0).max(1).optional(),
  holding: holdingSchema.optional(),
}))
