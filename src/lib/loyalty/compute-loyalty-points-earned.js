/**
 * Compute loyalty points earned from an amount paid and LoyaltySettings rates.
 *
 * Pure — no Prisma, no async, no side effects.
 *
 * IMPORTANT — caller responsibility: `amountPaid` must be the amount the
 * customer ACTUALLY PAID (post-discount when discounts applied). This
 * function does not inspect coupons, manual %, or loyalty redemption; it
 * only multiplies the number it is given. Checkout / Give-Points callers
 * must pass the correct post-discount total.
 *
 * Formula: (amountPaid / earnRateAmount) * earnRatePoints
 * Misconfigured or zero `earnRateAmount` → `"0.00"` (never divide-by-zero).
 *
 * Math uses `parseMoney` + `decimalStringFromNumber` (2 dp project convention).
 *
 * @param {string | number | null | undefined} amountPaid
 * @param {{
 *   earnRateAmount?: string | number | null
 *   earnRatePoints?: string | number | null
 * } | null | undefined} settings
 * @returns {string} points as a decimal string
 *
 * @example
 * // (a) 47 / 10 * 1 → 4.7 → "4.70"
 * computeLoyaltyPointsEarned('47', { earnRateAmount: '10', earnRatePoints: '1' })
 *
 * // (b) 100 / 1 * 0.1 → 10 → "10.00"
 * computeLoyaltyPointsEarned('100', { earnRateAmount: '1', earnRatePoints: '0.1' })
 *
 * // (c) zero paid
 * computeLoyaltyPointsEarned('0', { earnRateAmount: '10', earnRatePoints: '1' }) // "0.00"
 *
 * // (d) misconfigured rate — no crash
 * computeLoyaltyPointsEarned('47', { earnRateAmount: '0', earnRatePoints: '1' }) // "0.00"
 */
import {
  decimalStringFromNumber,
  parseMoney,
} from '@/lib/invoices/invoice-compute-totals'

/**
 * @param {string | number | null | undefined} amountPaid
 * @param {{
 *   earnRateAmount?: string | number | null
 *   earnRatePoints?: string | number | null
 * } | null | undefined} settings
 * @returns {string}
 */
export function computeLoyaltyPointsEarned(amountPaid, settings) {
  const paid = Math.max(0, parseMoney(amountPaid))
  const rateAmount = parseMoney(settings?.earnRateAmount)
  const ratePoints = parseMoney(settings?.earnRatePoints)

  if (paid === 0 || rateAmount === 0 || !Number.isFinite(rateAmount)) {
    return decimalStringFromNumber(0)
  }

  const points = (paid / rateAmount) * ratePoints
  if (!Number.isFinite(points) || points <= 0) {
    return decimalStringFromNumber(0)
  }

  return decimalStringFromNumber(points)
}
