import { parseMoney } from '@/lib/invoices/invoice-compute-totals'

/**
 * Empty / missing cap = no limit. `0` means no discount allowed.
 *
 * @param {unknown} cap
 * @returns {number | null} SAR cap, or null when unlimited
 */
export function parseDiscountCap(cap) {
  if (cap == null) return null
  const raw = String(cap).trim()
  if (raw === '') return null
  const n = parseMoney(raw)
  return Number.isFinite(n) ? n : null
}

/**
 * @param {unknown} discount
 * @param {unknown} cap
 */
export function isDiscountWithinCap(discount, cap) {
  const limit = parseDiscountCap(cap)
  if (limit == null) return true
  return parseMoney(discount ?? '0') <= limit + 1e-9
}
