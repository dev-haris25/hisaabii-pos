import { z } from 'zod'

/** Same cart line shape as `checkoutLineSchema` in checkout-pos-sale.js. */
export const posCouponValidateLineSchema = z.object({
  menuItemId: z.string().trim().min(1),
  quantity: z.number().int().min(1).max(999),
  variantOptionIds: z.array(z.string().trim().min(1)).max(40).optional().default([]),
  customizationIds: z.array(z.string().trim().min(1)).max(40).optional().default([]),
  lineNote: z.string().trim().max(300).optional().nullable(),
})

export const posCouponValidateBodySchema = z.object({
  code: z.string().trim().min(1).max(64),
  lines: z.array(posCouponValidateLineSchema).min(1).max(100),
})
