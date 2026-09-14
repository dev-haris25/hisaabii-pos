import { z } from 'zod'

const requiredSalary = z.preprocess((v) => {
  if (v == null) return ''
  return String(v).trim()
}, z.string().min(1).max(50))

/** Body for POST /api/auth/hr/employees/[id]/promotions — salary-only. */
export const promotionBodySchema = z.object({
  newSalary: requiredSalary,
  effectiveFrom: z
    .string()
    .trim()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Invalid pay period'),
  notes: z.preprocess((v) => {
    if (v == null) return null
    const s = String(v).trim()
    return s === '' ? null : s.slice(0, 2000)
  }, z.union([z.string(), z.null()]).optional().default(null)),
})
