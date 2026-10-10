import { z } from 'zod'

const moneyString = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^\d+(\.\d{1,4})?$/, 'INVALID_PRICE')

const optionalImageBase64 = z.preprocess(
  (v) => (v == null || String(v).trim() === '' ? undefined : String(v)),
  z.string().min(1).optional(),
)

const optionalImageMime = z.preprocess(
  (v) =>
    v == null || String(v).trim() === '' ? undefined : String(v).trim(),
  z.string().optional(),
)

export const menuCategoryBodySchema = z.object({
  nameAr: z.string().trim().min(1).max(200),
  nameEn: z.string().trim().max(200).optional().nullable(),
  sortOrder: z.number().int().min(0).max(9999).optional().default(0),
  active: z.boolean().optional().default(true),
})

const optionalCalories = z.preprocess((v) => {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : v
  const s = String(v).trim()
  if (!s) return null
  const n = Number.parseInt(s, 10)
  return Number.isFinite(n) ? n : v
}, z.number().int().min(0).max(999999).nullable().optional())

const optionalPersistedId = z.string().trim().min(1).max(64).optional()

const variantOptionBodySchema = z.object({
  /** Existing option id — omit for new options (reconcile update-in-place). */
  id: optionalPersistedId,
  nameAr: z.string().trim().min(1).max(200),
  nameEn: z.string().trim().max(200).optional().nullable(),
  priceChange: moneyString,
  calories: optionalCalories,
  isDefault: z.boolean().optional().default(false),
})

const variantGroupBodySchema = z.object({
  /** Existing group id — omit for new groups (reconcile update-in-place). */
  id: optionalPersistedId,
  nameAr: z.string().trim().min(1).max(200),
  nameEn: z.string().trim().max(200).optional().nullable(),
  options: z.array(variantOptionBodySchema).min(1).max(40),
})

const customizationBodySchema = z.object({
  nameAr: z.string().trim().min(1).max(200),
  nameEn: z.string().trim().max(200).optional().nullable(),
  priceChange: moneyString,
})

export const menuItemBodySchema = z.object({
  nameAr: z.string().trim().min(1).max(200),
  nameEn: z.string().trim().max(200).optional().nullable(),
  price: moneyString,
  vatPreset: z.enum(['standard', 'zero', 'exempt']).optional().default('standard'),
  categoryId: z.string().trim().min(1).optional().nullable(),
  sortOrder: z.number().int().min(0).max(9999).optional().default(0),
  active: z.boolean().optional().default(true),
  loyaltyRedeemable: z.boolean().optional().default(false),
  calories: optionalCalories,
  clearImage: z.coerce.boolean().optional().default(false),
  imageBase64: optionalImageBase64,
  imageMimeType: optionalImageMime,
  variantGroups: z.array(variantGroupBodySchema).max(20).optional(),
  customizations: z.array(customizationBodySchema).max(40).optional(),
  recipe: z
    .union([
      z.null(),
      z.object({
        steps: z.string().trim().max(8000).nullable().optional(),
        stepsAr: z.string().trim().max(8000).nullable().optional(),
        ingredients: z
          .array(
            z.object({
              stockItemId: z.string().trim().min(1),
              quantity: z
                .string()
                .trim()
                .regex(/^\d+(\.\d+)?$/)
                .refine((v) => Number(v) > 0, 'Quantity must be > 0'),
              unit: z.enum(['piece', 'g', 'kg', 'ml', 'l']),
            }),
          )
          .max(40),
      }),
    ])
    .optional(),
})

export const menuItemPatchSchema = menuItemBodySchema.partial()
export const menuCategoryPatchSchema = menuCategoryBodySchema.partial()
