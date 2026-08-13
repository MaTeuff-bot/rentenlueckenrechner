import { z } from 'zod'

export const inputLabels = {
  currentAge: 'Aktuelles Alter',
  retirementAge: 'Renteneintrittsalter',
  planningAge: 'Planung bis Alter',
  currentCapital: 'Aktuelles Altersvorsorgevermögen',
  monthlyContributionToday: 'Monatliche Sparrate bis Rentenbeginn, heutige Kaufkraft',
  monthlyDesiredSpendingToday: 'Gewünschte monatliche Ausgaben im Ruhestand, heutige Kaufkraft',
  monthlyRetirementIncomeToday: 'Erwartetes monatliches Renteneinkommen, heutige Kaufkraft',
  annualInflationRate: 'Inflation pro Jahr',
  annualReturnBeforeRetirement: 'Nominale Rendite vor Rentenbeginn',
  annualReturnInRetirement: 'Nominale Rendite im Ruhestand',
} as const

const money = z.number().finite().min(0, 'Muss mindestens 0 sein.')
const age = z.number().int('Muss eine ganze Zahl sein.').min(0, 'Muss mindestens 0 sein.').max(120, 'Ist zu hoch.')

export const rentenlueckeInputSchema = z
  .object({
    currentAge: age.max(100, 'Darf höchstens 100 sein.'),
    retirementAge: age.max(100, 'Darf höchstens 100 sein.'),
    planningAge: age.max(120, 'Darf höchstens 120 sein.'),
    currentCapital: money,
    monthlyContributionToday: money,
    monthlyDesiredSpendingToday: money,
    monthlyRetirementIncomeToday: money,
    annualInflationRate: z
      .number()
      .finite()
      .min(-0.05, 'Muss mindestens -5 % sein.')
      .max(0.2, 'Darf höchstens 20 % sein.'),
    annualReturnBeforeRetirement: z
      .number()
      .finite()
      .min(-0.5, 'Muss mindestens -50 % sein.')
      .max(0.5, 'Darf höchstens 50 % sein.'),
    annualReturnInRetirement: z
      .number()
      .finite()
      .min(-0.5, 'Muss mindestens -50 % sein.')
      .max(0.5, 'Darf höchstens 50 % sein.'),
  })
  .superRefine((input, ctx) => {
    if (input.retirementAge < input.currentAge) {
      ctx.addIssue({
        code: 'custom',
        path: ['retirementAge'],
        message: 'Muss mindestens dem aktuellen Alter entsprechen.',
      })
    }

    if (input.planningAge <= input.retirementAge) {
      ctx.addIssue({
        code: 'custom',
        path: ['planningAge'],
        message: 'Muss größer als das Renteneintrittsalter sein.',
      })
    }
  })

export type InputFieldName = keyof z.infer<typeof rentenlueckeInputSchema>

export function getFieldErrors(error: z.ZodError): Partial<Record<InputFieldName, string>> {
  const fieldErrors: Partial<Record<InputFieldName, string>> = {}

  for (const issue of error.issues) {
    const field = issue.path[0]
    if (typeof field === 'string' && field in inputLabels && !fieldErrors[field as InputFieldName]) {
      fieldErrors[field as InputFieldName] = issue.message
    }
  }

  return fieldErrors
}
