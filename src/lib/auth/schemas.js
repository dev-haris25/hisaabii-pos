import { z } from 'zod'

import { MAX_COMPANY_LOGO_BYTES } from '@/lib/auth/company-logo'
import { hasNumberOrSpecial } from '@/lib/auth/password-rules'

const logoBase64MaxChars = Math.ceil((MAX_COMPANY_LOGO_BYTES * 4) / 3)

/** Optional CSS hex `#RRGGBB` — empty string / null clears the stored color. */
const optionalBrandHex = z.preprocess((v) => {
  if (v === undefined) return undefined
  if (v == null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}, z.union([z.null(), z.string().regex(/^#[0-9A-Fa-f]{6}$/)]).optional())

/**
 * Optional finite number from JSON number or numeric string; '' / null → null.
 * @param {number} min
 * @param {number} max
 */
function optionalBoundedNumber(min, max) {
  return z.preprocess((v) => {
    if (v === undefined) return undefined
    if (v == null || v === '') return null
    const n = typeof v === 'number' ? v : Number(String(v).trim())
    return Number.isFinite(n) ? n : v
  }, z.union([z.null(), z.number().min(min).max(max)]).optional())
}

/** Optional positive integer meters (app suggests ~100–150; not a DB default). */
const optionalRadiusMeters = z.preprocess((v) => {
  if (v === undefined) return undefined
  if (v == null || v === '') return null
  const n =
    typeof v === 'number' ? v : Number.parseInt(String(v).trim(), 10)
  return Number.isFinite(n) ? n : v
}, z.union([z.null(), z.number().int().min(1).max(50000)]).optional())

export const registerBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(320),
    password: z.string().min(8).max(128),
    confirmPassword: z.string().min(8).max(128),
    termsAccepted: z.literal(true),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'PASSWORD_MISMATCH',
    path: ['confirmPassword'],
  })
  .refine((d) => hasNumberOrSpecial(d.password), {
    message: 'WEAK_PASSWORD',
    path: ['password'],
  })

export const verifyOtpBodySchema = z.object({
  email: z.string().trim().email().max(320),
  otp: z.string().length(6).regex(/^\d+$/),
})

export const loginBodySchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(128),
  remember: z.boolean().optional(),
})

export const forgotPasswordBodySchema = z.object({
  email: z.string().trim().email().max(320),
})

export const resetPasswordBodySchema = z
  .object({
    email: z.string().trim().email().max(320),
    password: z.string().min(8).max(128),
    resetToken: z.string().min(1).optional(),
  })
  .refine((d) => hasNumberOrSpecial(d.password), {
    message: 'WEAK_PASSWORD',
    path: ['password'],
  })

/**
 * Restaurant BusinessProfile create/update for first-run onboarding.
 * No stamp/signature/custom VAT — POS VatPreset is standard|zero|exempt only.
 */
export const businessProfileBodySchema = z
  .object({
    companyNameAr: z.string().trim().min(1).max(500),
    companyNameEn: z.string().trim().max(500).optional().nullable(),
    crNumber: z.string().trim().min(1).max(100),
    vatNumber: z.string().trim().min(1).max(64),
    addressAr: z.string().trim().min(1).max(2000),
    addressEn: z.string().trim().max(2000).optional().nullable(),
    streetAr: z.string().trim().max(200).optional().default(''),
    streetEn: z.string().trim().max(200).optional().default(''),
    districtAr: z.string().trim().max(200).optional().default(''),
    districtEn: z.string().trim().max(200).optional().default(''),
    cityAr: z.string().trim().max(200).optional().default(''),
    cityEn: z.string().trim().max(200).optional().default(''),
    buildingNumber: z.string().trim().max(80).optional().default(''),
    secondaryNumber: z.string().trim().max(80).optional().default(''),
    postalCode: z.string().trim().max(40).optional().default(''),
    shortAddress: z.string().trim().max(300).optional().default(''),
    email: z
      .string()
      .trim()
      .max(320)
      .optional()
      .nullable()
      .refine((v) => !v || z.string().email().safeParse(v).success, {
        message: 'INVALID_EMAIL',
      }),
    phone: z.string().trim().max(40).optional().nullable(),
    defaultVatPreset: z.enum(['standard', 'zero', 'exempt']).optional().default('standard'),
    logoBase64: z.string().max(logoBase64MaxChars).optional().nullable(),
    logoMimeType: z
      .enum(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
      .optional()
      .nullable(),
    preserveLogo: z.boolean().optional(),
    brandPrimaryColor: optionalBrandHex,
    brandSecondaryColor: optionalBrandHex,
    brandAccentColor: optionalBrandHex,
    brandBackgroundColor: optionalBrandHex,
    brandTextColor: optionalBrandHex,
    locationLat: optionalBoundedNumber(-90, 90),
    locationLng: optionalBoundedNumber(-180, 180),
    locationRadiusMeters: optionalRadiusMeters,
  })
  .refine(
    (d) => {
      if (d.preserveLogo === true) return true
      const hasB64 = d.logoBase64 != null && d.logoBase64.length > 0
      const hasMime = d.logoMimeType != null
      if (hasB64 !== hasMime) return false
      return true
    },
    { message: 'LOGO_PAIR', path: ['logoBase64'] },
  )
  .refine(
    (d) =>
      !(
        d.preserveLogo === true &&
        d.logoBase64 != null &&
        d.logoBase64.length > 0
      ),
    { message: 'LOGO_PRESERVE_CONFLICT', path: ['preserveLogo'] },
  )

/** Optional body for `POST /zatca-onboarding/skip` (profile id ignored — single restaurant). */
export const zatcaSkipBodySchema = z.object({
  businessProfileId: z.string().trim().min(1).optional(),
})

/** Sandbox/production onboarding: OTP from Fatoora (sandbox accepts dummy e.g. 123456). */
export const zatcaOnboardBodySchema = z.object({
  otp: z.string().length(6).regex(/^\d+$/),
  businessProfileId: z.string().trim().min(1).optional(),
})
