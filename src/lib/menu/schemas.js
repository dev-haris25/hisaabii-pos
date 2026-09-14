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

export const menuItemBodySchema = z.object({
  nameAr: z.string().trim().min(1).max(200),
  nameEn: z.string().trim().max(200).optional().nullable(),
  price: moneyString,
  vatPreset: z.enum(['standard', 'zero', 'exempt']).optional().default('standard'),
  categoryId: z.string().trim().min(1).optional().nullable(),
  sortOrder: z.number().int().min(0).max(9999).optional().default(0),
  active: z.boolean().optional().default(true),
  clearImage: z.coerce.boolean().optional().default(false),
  imageBase64: optionalImageBase64,
  imageMimeType: optionalImageMime,
})

export const menuItemPatchSchema = menuItemBodySchema.partial()
export const menuCategoryPatchSchema = menuCategoryBodySchema.partial()
