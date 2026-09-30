import { z } from 'zod'

export const loyaltyCustomerPatchSchema = z
  .object({
    phone: z.string().optional(),
    /** Validated in-route for LOYALTY_ACCOUNT_BALANCE_INVALID. */
    balance: z.string().optional(),
  })
  .strict()

export const loyaltyMergeBodySchema = z
  .object({
    survivorAccountId: z.string().trim().min(1),
    duplicateAccountId: z.string().trim().min(1),
  })
  .strict()

const BALANCE_RE = /^\d+(\.\d{1,4})?$/

/**
 * @param {string} raw
 * @returns {boolean}
 */
export function isValidLoyaltyBalanceString(raw) {
  const trimmed = String(raw ?? '').trim()
  if (!BALANCE_RE.test(trimmed)) return false
  const n = Number.parseFloat(trimmed)
  return Number.isFinite(n) && n >= 0
}
