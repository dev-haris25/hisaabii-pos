/**
 * Pure coupon order-discount math (PERCENTAGE / FIXED_AMOUNT only).
 * Produces the same money shape as the manual discount path, then reuses
 * `allocateOrderDiscount` for the proportional per-line VAT-aware split.
 * BOGO / COMBO are intentionally unsupported here.
 */

import {
  allocateOrderDiscount,
  computeLineAmounts,
  decimalStringFromNumber,
  parseMoney,
} from '@/lib/invoices/invoice-compute-totals'

/** @typedef {'PERCENTAGE' | 'FIXED_AMOUNT' | 'BOGO' | 'COMBO' | string} CouponDiscountKindInput */

/**
 * @typedef {{
 *   discountKind: CouponDiscountKindInput
 *   discountValue?: string | number | null
 *   maxDiscountCap?: string | number | null
 *   minOrderAmount?: string | number | null
 * }} CouponDiscountFields
 */

/**
 * @typedef {{
 *   eligible: true
 *   discountAmount: string
 * } | {
 *   eligible: false
 *   reason: 'below_min_order' | 'unsupported_kind' | 'invalid_value'
 *   discountAmount: '0.00'
 * }} CouponDiscountAmountResult
 */

/**
 * @typedef {CouponDiscountAmountResult & {
 *   lineDiscounts?: string[]
 * }} CouponOrderDiscountResult
 */

/**
 * Cart subtotal ex-VAT from lines — same per-line gross rounding as
 * `allocateOrderDiscount` so discount % / fixed caps agree with allocation.
 *
 * @param {Array<{ quantity: number, unitPrice: string }>} lines
 * @returns {string}
 */
export function orderSubtotalFromLines(lines) {
  let total = 0
  for (const line of lines) {
    const qty = Math.max(0, Math.round(Number(line.quantity)) || 0)
    const gross = Math.round(qty * parseMoney(line.unitPrice) * 100) / 100
    total += gross
  }
  return decimalStringFromNumber(Math.round(total * 100) / 100)
}

/**
 * Pre-discount VAT-inclusive cart total — sum of each line’s
 * `(qty × unitPrice) + VAT on that gross` with discount forced to 0.
 * Reuses `computeLineAmounts` (same `vatRateFraction` as `computeInvoiceTotals`:
 * `vatPercentForPreset`) so the min-order gate matches invoice VAT math.
 *
 * @param {Array<{ quantity: number, unitPrice: string, vatPreset?: string }>} lines
 * @returns {string}
 */
export function orderVatInclusiveSubtotalFromLines(lines) {
  let total = 0
  for (const line of lines) {
    const a = computeLineAmounts({
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discount: '0.00',
      vatPreset: line.vatPreset ?? 'standard',
    })
    total += a.lineTotal
  }
  return decimalStringFromNumber(Math.round(total * 100) / 100)
}

/**
 * Raw coupon discount amount from coupon fields + cart totals.
 * Does not allocate across lines — use `applyCouponOrderDiscount` for that.
 *
 * - `vatInclusiveTotal` — pre-discount VAT-inclusive total for `minOrderAmount`
 * - `exVatSubtotal` — ex-VAT gross for PERCENTAGE / FIXED_AMOUNT / cap math
 *
 * Below-min returns `below_min_order` (not a silent zero).
 *
 * @param {CouponDiscountFields} coupon
 * @param {{
 *   vatInclusiveTotal: string | number | undefined
 *   exVatSubtotal: string | number | undefined
 * }} totals
 * @returns {CouponDiscountAmountResult}
 */
export function computeCouponDiscountAmount(coupon, totals) {
  const vatInclusive = Math.max(0, parseMoney(totals?.vatInclusiveTotal))
  const exVat = Math.max(0, parseMoney(totals?.exVatSubtotal))
  const minOrder = Math.max(0, parseMoney(coupon?.minOrderAmount ?? '0'))

  if (vatInclusive + 1e-9 < minOrder) {
    return { eligible: false, reason: 'below_min_order', discountAmount: '0.00' }
  }

  const kind = String(coupon?.discountKind ?? '')
  if (kind === 'BOGO' || kind === 'COMBO') {
    return { eligible: false, reason: 'unsupported_kind', discountAmount: '0.00' }
  }
  if (kind !== 'PERCENTAGE' && kind !== 'FIXED_AMOUNT') {
    return { eligible: false, reason: 'unsupported_kind', discountAmount: '0.00' }
  }

  const rawValue = coupon?.discountValue
  if (rawValue == null || String(rawValue).trim() === '') {
    return { eligible: false, reason: 'invalid_value', discountAmount: '0.00' }
  }

  if (kind === 'PERCENTAGE') {
    // Mirror orderDiscountMoneyFromPercent: clamp % then (ex-VAT subtotal * p) / 100.
    const p = Math.min(100, Math.max(0, parseMoney(rawValue)))
    let amount = exVat * (p / 100)

    const capRaw = coupon?.maxDiscountCap
    if (capRaw != null && String(capRaw).trim() !== '') {
      const cap = Math.max(0, parseMoney(capRaw))
      amount = Math.min(amount, cap)
    }

    amount = Math.min(Math.max(0, amount), exVat)
    return { eligible: true, discountAmount: decimalStringFromNumber(amount) }
  }

  // FIXED_AMOUNT — never exceeds ex-VAT subtotal (same ceiling allocateOrderDiscount applies).
  const fixed = Math.max(0, parseMoney(rawValue))
  const amount = Math.min(fixed, exVat)
  return { eligible: true, discountAmount: decimalStringFromNumber(amount) }
}

/**
 * Compute coupon order discount and split it across lines via existing
 * `allocateOrderDiscount` (unchanged manual path). Coupon and manual discount
 * share `InvoiceLine.discount` — caller must not apply both at once.
 *
 * @param {Array<{ quantity: number, unitPrice: string, vatPreset?: string }>} lines
 * @param {CouponDiscountFields} coupon
 * @returns {CouponOrderDiscountResult}
 */
export function applyCouponOrderDiscount(lines, coupon) {
  const list = Array.isArray(lines) ? lines : []
  const exVatSubtotal = orderSubtotalFromLines(list)
  const vatInclusiveTotal = orderVatInclusiveSubtotalFromLines(list)
  const amountResult = computeCouponDiscountAmount(coupon, {
    vatInclusiveTotal,
    exVatSubtotal,
  })
  if (!amountResult.eligible) {
    return {
      ...amountResult,
      lineDiscounts: list.map(() => '0.00'),
    }
  }

  return {
    eligible: true,
    discountAmount: amountResult.discountAmount,
    lineDiscounts: allocateOrderDiscount(list, amountResult.discountAmount),
  }
}
