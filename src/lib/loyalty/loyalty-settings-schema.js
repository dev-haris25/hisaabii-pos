import { z } from 'zod'

/** Same money-string pattern as menu / coupons (`/^\d+(\.\d{1,4})?$/`). */
export const LOYALTY_MONEY_STRING_RE = /^\d+(\.\d{1,4})?$/

export const loyaltySettingsPatchSchema = z
  .object({
    enabled: z.boolean().optional(),
    earnRateAmount: z.string().optional(),
    earnRatePoints: z.string().optional(),
    redeemRatePoints: z.string().optional(),
    redeemRateAmount: z.string().optional(),
    minBalanceToRedeem: z.union([z.string(), z.null()]).optional(),
    maxPointsPerOrder: z.union([z.string(), z.null()]).optional(),
    minOrderValueToRedeem: z.union([z.string(), z.null()]).optional(),
  })
  .strict()

/**
 * @param {string | null | undefined} raw
 * @returns {boolean}
 */
function isBlank(raw) {
  return raw == null || String(raw).trim() === ''
}

/**
 * @param {string} raw
 * @returns {boolean}
 */
function isPositiveMoneyString(raw) {
  if (!LOYALTY_MONEY_STRING_RE.test(raw)) return false
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) && n > 0
}

/**
 * @param {string} raw
 * @returns {boolean}
 */
function isNonNegativeMoneyString(raw) {
  if (!LOYALTY_MONEY_STRING_RE.test(raw)) return false
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) && n >= 0
}

/**
 * Domain validation after Zod shape check — specific LOYALTY_* codes.
 *
 * @param {z.infer<typeof loyaltySettingsPatchSchema>} d
 * @returns {{ code: string, message: string } | null}
 */
export function validateLoyaltySettingsPatch(d) {
  /** @type {Array<{ key: keyof typeof d, requiredCode: string, invalidCode: string, label: string }>} */
  const requiredPositiveRates = [
    {
      key: 'earnRateAmount',
      requiredCode: 'LOYALTY_EARN_RATE_AMOUNT_REQUIRED',
      invalidCode: 'LOYALTY_EARN_RATE_AMOUNT_INVALID',
      label: 'Earn rate amount',
    },
    {
      key: 'earnRatePoints',
      requiredCode: 'LOYALTY_EARN_RATE_POINTS_REQUIRED',
      invalidCode: 'LOYALTY_EARN_RATE_POINTS_INVALID',
      label: 'Earn rate points',
    },
    {
      key: 'redeemRatePoints',
      requiredCode: 'LOYALTY_REDEEM_RATE_POINTS_REQUIRED',
      invalidCode: 'LOYALTY_REDEEM_RATE_POINTS_INVALID',
      label: 'Redeem rate points',
    },
    {
      key: 'redeemRateAmount',
      requiredCode: 'LOYALTY_REDEEM_RATE_AMOUNT_REQUIRED',
      invalidCode: 'LOYALTY_REDEEM_RATE_AMOUNT_INVALID',
      label: 'Redeem rate amount',
    },
  ]

  for (const field of requiredPositiveRates) {
    if (d[field.key] === undefined) continue
    const raw = String(/** @type {string} */ (d[field.key])).trim()
    if (isBlank(raw)) {
      return {
        code: field.requiredCode,
        message: `${field.label} is required`,
      }
    }
    if (!isPositiveMoneyString(raw)) {
      return {
        code: field.invalidCode,
        message: `${field.label} must be a positive amount (up to 4 decimal places)`,
      }
    }
  }

  /** @type {Array<{ key: keyof typeof d, code: string, label: string }>} */
  const optionalLimits = [
    {
      key: 'minBalanceToRedeem',
      code: 'LOYALTY_MIN_BALANCE_TO_REDEEM_INVALID',
      label: 'Minimum balance to redeem',
    },
    {
      key: 'maxPointsPerOrder',
      code: 'LOYALTY_MAX_POINTS_PER_ORDER_INVALID',
      label: 'Max points per order',
    },
    {
      key: 'minOrderValueToRedeem',
      code: 'LOYALTY_MIN_ORDER_VALUE_TO_REDEEM_INVALID',
      label: 'Minimum order value to redeem',
    },
  ]

  for (const field of optionalLimits) {
    if (d[field.key] === undefined) continue
    const value = d[field.key]
    if (value == null || String(value).trim() === '') continue
    const raw = String(value).trim()
    if (!isNonNegativeMoneyString(raw)) {
      return {
        code: field.code,
        message: `${field.label} must be a valid amount (up to 4 decimal places), or null to clear`,
      }
    }
  }

  return null
}

/**
 * Build Prisma update data from a validated patch body (partial).
 *
 * @param {z.infer<typeof loyaltySettingsPatchSchema>} d
 * @returns {Record<string, unknown>}
 */
export function loyaltySettingsPatchToData(d) {
  /** @type {Record<string, unknown>} */
  const data = {}

  if (d.enabled !== undefined) data.enabled = d.enabled

  if (d.earnRateAmount !== undefined) {
    data.earnRateAmount = String(d.earnRateAmount).trim()
  }
  if (d.earnRatePoints !== undefined) {
    data.earnRatePoints = String(d.earnRatePoints).trim()
  }
  if (d.redeemRatePoints !== undefined) {
    data.redeemRatePoints = String(d.redeemRatePoints).trim()
  }
  if (d.redeemRateAmount !== undefined) {
    data.redeemRateAmount = String(d.redeemRateAmount).trim()
  }

  if (d.minBalanceToRedeem !== undefined) {
    const raw =
      d.minBalanceToRedeem == null ? '' : String(d.minBalanceToRedeem).trim()
    data.minBalanceToRedeem = raw === '' ? null : raw
  }
  if (d.maxPointsPerOrder !== undefined) {
    const raw =
      d.maxPointsPerOrder == null ? '' : String(d.maxPointsPerOrder).trim()
    data.maxPointsPerOrder = raw === '' ? null : raw
  }
  if (d.minOrderValueToRedeem !== undefined) {
    const raw =
      d.minOrderValueToRedeem == null
        ? ''
        : String(d.minOrderValueToRedeem).trim()
    data.minOrderValueToRedeem = raw === '' ? null : raw
  }

  return data
}
