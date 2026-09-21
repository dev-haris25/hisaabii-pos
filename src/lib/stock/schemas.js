import { z } from 'zod'

import { normalizeQtyString, parseQty } from '@/lib/stock/units'

const stockUnitSchema = z.enum(['piece', 'g', 'kg', 'ml', 'l'])

const qtyStringSchema = z
  .string()
  .trim()
  .regex(/^-?\d+(\.\d+)?$/, 'Invalid quantity')
  .refine((v) => parseQty(v) != null, 'Invalid quantity')

const optionalQtySchema = z
  .union([z.literal(''), z.null(), qtyStringSchema])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined
    if (v == null || v === '') return null
    return normalizeQtyString(v)
  })

const optionalCostSchema = z
  .union([
    z.literal(''),
    z.null(),
    z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,4})?$/, 'Invalid cost')
      .refine((v) => {
        const n = Number(v)
        return Number.isFinite(n) && n >= 0
      }, 'Cost must be ≥ 0'),
  ])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined
    if (v == null || v === '') return null
    return v
  })

export const stockItemBodySchema = z
  .object({
    nameAr: z.string().trim().min(1).max(120),
    nameEn: z.string().trim().max(120).nullable().optional(),
    unit: stockUnitSchema,
    quantityOnHand: qtyStringSchema.optional().default('0'),
    lowStockThreshold: optionalQtySchema,
    unitCost: optionalCostSchema,
    isBulk: z.boolean().optional().default(false),
    active: z.boolean().optional().default(true),
    notes: z.string().trim().max(500).nullable().optional(),
  })
  .strict()

export const stockItemPatchSchema = z
  .object({
    nameAr: z.string().trim().min(1).max(120).optional(),
    nameEn: z.string().trim().max(120).nullable().optional(),
    unit: stockUnitSchema.optional(),
    lowStockThreshold: optionalQtySchema,
    unitCost: optionalCostSchema,
    isBulk: z.boolean().optional(),
    active: z.boolean().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
  })
  .strict()

const positiveQtySchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, 'Invalid quantity')
  .refine((v) => {
    const n = parseQty(v)
    return n != null && n > 0
  }, 'Quantity must be greater than 0')

export const stockMovementBodySchema = z
  .object({
    type: z.enum(['purchase', 'adjust_in', 'adjust_out']),
    quantity: positiveQtySchema,
    reason: z.string().trim().max(200).nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
    /** Optional; only applied when type is purchase (updates StockItem.unitCost). */
    unitCost: optionalCostSchema,
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.type === 'adjust_out' && !(val.reason && val.reason.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message: 'Reason is required for stock out',
      })
    }
  })
