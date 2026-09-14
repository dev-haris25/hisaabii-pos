import { z } from 'zod'

export const payslipCategoryUpsertBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  type: z.enum(['earning', 'deduction']),
  defaultAmount: z.string().trim().default('0'),
})
