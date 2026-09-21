import { z } from 'zod'

import { STOCK_UNITS } from '@/lib/stock/units'

export const kitchenStockIssueBodySchema = z.object({
  stockItemId: z.string().trim().min(1),
  quantity: z
    .string()
    .trim()
    .regex(/^\d+(\.\d+)?$/, 'Invalid quantity'),
  unit: z.enum(STOCK_UNITS).optional(),
  /** When an open cycle exists: close it with waste math, then issue a new cycle. */
  markOldConsumed: z.boolean().optional().default(false),
})

export const kitchenStockMarkConsumedBodySchema = z.object({
  allocationId: z.string().trim().min(1),
})
