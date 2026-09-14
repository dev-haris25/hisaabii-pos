import { z } from 'zod'

export const employeePaymentUpsertBodySchema = z.object({
  employeeId: z.string().cuid(),
  paymentDate: z.string().trim().min(1),
  paymentType: z.enum(['salary', 'advance', 'bonus']),
  payPeriod: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Invalid pay period')
    .optional()
    .nullable(),
  amount: z.string().trim().min(1),
  paymentMethod: z.enum(['cash', 'bank_transfer', 'cheque', 'other']).default('cash'),
  remarks: z.string().trim().max(1000).optional().nullable(),
  overflowResolution: z.enum(['advance', 'bonus', 'force_salary']).optional().nullable(),
})

/**
 * PATCH never re-triggers salary-cap overflow splits — that flow is create-only
 * (delete + recreate for a fresh split). Cap overruns on edit return SALARY_CAP_EXCEEDED.
 */
export const employeePaymentPatchBodySchema = employeePaymentUpsertBodySchema.omit({
  overflowResolution: true,
})
