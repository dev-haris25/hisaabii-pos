import { z } from 'zod'

export const salarySlipEmailBodySchema = z.object({
  to: z.string().trim().email(),
  cc: z.string().trim().email().optional().or(z.literal('')).nullable(),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(5000),
  locale: z.enum(['en', 'ar']).optional().default('en'),
})
