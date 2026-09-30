import { z } from 'zod'

/** Same money-string pattern as menu item prices (`src/lib/menu/schemas.js`). */
export const couponMoneyString = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^\d+(\.\d{1,4})?$/)

export const optionalCouponMoneyString = z
  .union([z.literal(''), z.null(), couponMoneyString])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined
    if (v == null || v === '') return null
    return v
  })

const couponItemRuleSchema = z.object({
  ruleType: z.enum(['BUY', 'GET', 'COMBO_ITEM']),
  menuItemId: z.string().trim().min(1),
  quantity: z.number().int().min(1).max(999),
  discountPercent: optionalCouponMoneyString,
  sortOrder: z.number().int().min(0).max(9999).optional().default(0),
  variantOptionIds: z
    .array(z.string().trim().min(1))
    .max(40)
    .optional()
    .default([]),
})

const optionalInstant = z
  .union([z.string().trim().min(1), z.null()])
  .optional()
  .transform((v, ctx) => {
    if (v === undefined) return undefined
    if (v == null || v === '') return null
    const d = new Date(v)
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: 'custom', message: 'INVALID_DATE' })
      return z.NEVER
    }
    return d
  })

export const couponBodySchema = z.object({
  nameAr: z.string().trim().min(1).max(200),
  nameEn: z.string().trim().max(200).optional().nullable(),
  codeType: z.enum(['SHARED', 'UNIQUE_BATCH']),
  /** Manual SHARED code — mutually exclusive with generateCode. */
  code: z.string().trim().min(1).max(64).optional().nullable(),
  /** System-generate SHARED code — mutually exclusive with code. */
  generateCode: z.boolean().optional(),
  batchSize: z.number().int().min(1).optional().nullable(),
  perCodeUsageLimit: z.number().int().min(1).max(1_000_000).optional().nullable(),
  discountKind: z.enum(['PERCENTAGE', 'FIXED_AMOUNT', 'BOGO', 'COMBO']),
  discountValue: optionalCouponMoneyString,
  maxDiscountCap: optionalCouponMoneyString,
  minOrderAmount: couponMoneyString.optional().default('0'),
  totalUsageLimit: z.number().int().min(1).max(1_000_000).optional().nullable(),
  startDate: optionalInstant,
  expiresAt: optionalInstant,
  active: z.boolean().optional().default(true),
  itemRules: z.array(couponItemRuleSchema).max(40).optional().default([]),
})

/**
 * PATCH body — structural fields (codeType, discountKind, code, batchSize,
 * generateCode, perCodeUsageLimit) are rejected in the route with
 * COUPON_STRUCTURAL_FIELD_LOCKED if present.
 */
export const couponPatchSchema = z
  .object({
    nameAr: z.string().trim().min(1).max(200).optional(),
    nameEn: z.string().trim().max(200).optional().nullable(),
    discountValue: optionalCouponMoneyString,
    maxDiscountCap: optionalCouponMoneyString,
    minOrderAmount: couponMoneyString.optional(),
    totalUsageLimit: z.number().int().min(1).max(1_000_000).optional().nullable(),
    startDate: optionalInstant,
    expiresAt: optionalInstant,
    active: z.boolean().optional(),
    itemRules: z.array(couponItemRuleSchema).max(40).optional(),
  })
  .strict()
