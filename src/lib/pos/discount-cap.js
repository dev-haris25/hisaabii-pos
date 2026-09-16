import {
  decimalStringFromNumber,
  parseMoney,
} from '@/lib/invoices/invoice-compute-totals'

export const DISCOUNT_PERCENT_RE = /^\d+(\.\d{1,4})?$/

/**
 * Empty / missing cap = no limit. `0` means no discount allowed.
 *
 * @param {unknown} cap
 * @returns {number | null} percent 0–100, or null when unlimited
 */
export function parseDiscountCap(cap) {
  if (cap == null) return null
  const raw = String(cap).trim()
  if (raw === '') return null
  const n = parseMoney(raw)
  if (!Number.isFinite(n)) return null
  return Math.min(100, Math.max(0, n))
}

/**
 * @param {unknown} value
 */
export function isValidDiscountPercent(value) {
  const raw = String(value ?? '').trim()
  if (!DISCOUNT_PERCENT_RE.test(raw)) return false
  const n = parseMoney(raw)
  return Number.isFinite(n) && n >= 0 && n <= 100 + 1e-9
}

/**
 * @param {unknown} discountPercent
 * @param {unknown} cap
 */
export function isDiscountWithinCap(discountPercent, cap) {
  const limit = parseDiscountCap(cap)
  if (limit == null) return parseMoney(discountPercent ?? '0') <= 100 + 1e-9
  return parseMoney(discountPercent ?? '0') <= limit + 1e-9
}

/**
 * Convert an order-level percent into a SAR amount (2 dp) from line gross.
 *
 * @param {Array<{ quantity: number, unitPrice: string }>} lines
 * @param {string | number | undefined} percent
 */
export function orderDiscountMoneyFromPercent(lines, percent) {
  const totalGross = lines.reduce((sum, line) => {
    const qty = Math.max(0, Math.round(Number(line.quantity)) || 0)
    return sum + qty * parseMoney(line.unitPrice)
  }, 0)
  const p = Math.min(100, Math.max(0, parseMoney(percent)))
  return decimalStringFromNumber(totalGross * (p / 100))
}
