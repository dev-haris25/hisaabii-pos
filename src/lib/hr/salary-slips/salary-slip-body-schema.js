import { z } from 'zod'

/** Payslip category ids may be Prisma cuids or deterministic system ids (e.g. Advance). */
const payslipCategoryIdSchema = z.preprocess((v) => {
  if (v == null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}, z.union([z.string().min(1).max(191), z.null()]).optional().default(null))

const salarySlipLineSchema = z.object({
  payslipCategoryId: payslipCategoryIdSchema,
  categoryType: z.enum(['earning', 'deduction']),
  description: z.string().trim().max(500).default(''),
  unit: z.string().trim().default('1'),
  unitRate: z.string().trim().default('0'),
  sortOrder: z.number().int().default(0),
})

/** Body for POST / PATCH /api/auth/hr/salary-slips */
export const salarySlipUpsertBodySchema = z.object({
  slipDate: z.string().trim().min(1),
  employeeId: z.string().cuid(),
  referenceNumber: z.string().trim().max(100).optional().default(''),
  description: z.string().trim().max(2000).optional().default(''),
  basicPay: z.string().trim().default('0'),
  lines: z.array(salarySlipLineSchema).default([]),
})
