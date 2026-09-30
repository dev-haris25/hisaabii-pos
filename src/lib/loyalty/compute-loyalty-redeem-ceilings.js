/**
 * Loyalty redeem value + ceiling math (pure — no Prisma / async / side effects).
 *
 * Cart money summing reuses Coupons helpers:
 * - `orderSubtotalFromLines` — ex-VAT gross (same basis as coupon order discounts)
 *
 * Points ↔ money uses LoyaltySettings redeem rates:
 *   points = money * (redeemRatePoints / redeemRateAmount)
 */

import { orderSubtotalFromLines } from '@/lib/coupons/coupon-order-discount'
import {
  allocateOrderDiscount,
  decimalStringFromNumber,
  parseMoney,
} from '@/lib/invoices/invoice-compute-totals'

/**
 * @typedef {{
 *   menuItemId?: string | null
 *   quantity: number
 *   unitPrice: string
 * }} LoyaltyRedeemCartLine
 */

/**
 * Settings bag for redeem ceilings. `redeemableMenuItemIds` is caller-assembled
 * from MenuItems with `loyaltyRedeemable` — empty/null means no item restriction.
 *
 * @typedef {{
 *   redeemRatePoints?: string | number | null
 *   redeemRateAmount?: string | number | null
 *   maxPointsPerOrder?: string | number | null
 *   redeemableMenuItemIds?: string[] | null
 * }} LoyaltyRedeemSettings
 */

/**
 * @typedef {{
 *   balanceCeiling: string
 *   perOrderCeiling: string | null
 *   redeemableValueCeiling: string
 *   effectiveCeiling: string
 *   limitingFactor: 'balance' | 'per_order_max' | 'redeemable_value'
 * }} LoyaltyRedeemCeilings
 */

/**
 * Whether settings carry an item restriction list (non-empty id array).
 *
 * @param {LoyaltyRedeemSettings | null | undefined} settings
 * @returns {boolean}
 */
function hasRedeemableItemRestriction(settings) {
  const ids = settings?.redeemableMenuItemIds
  return Array.isArray(ids) && ids.length > 0
}

/**
 * Convert redeemable money value → points via redeem rates.
 * Misconfigured / zero `redeemRateAmount` → `"0.00"`.
 *
 * @param {string | number} moneyValue
 * @param {LoyaltyRedeemSettings | null | undefined} settings
 * @returns {string}
 */
export function moneyToRedeemPoints(moneyValue, settings) {
  const money = Math.max(0, parseMoney(moneyValue))
  const rateAmount = parseMoney(settings?.redeemRateAmount)
  const ratePoints = parseMoney(settings?.redeemRatePoints)

  if (money === 0 || rateAmount === 0 || !Number.isFinite(rateAmount)) {
    return decimalStringFromNumber(0)
  }

  const points = (money / rateAmount) * ratePoints
  if (!Number.isFinite(points) || points <= 0) {
    return decimalStringFromNumber(0)
  }

  return decimalStringFromNumber(points)
}

/**
 * Convert redeem points → money discount via redeem rates.
 * Misconfigured / zero `redeemRatePoints` → `"0.00"`.
 *
 * Formula: money = points * (redeemRateAmount / redeemRatePoints)
 *
 * @param {string | number} pointsValue
 * @param {LoyaltyRedeemSettings | null | undefined} settings
 * @returns {string}
 */
export function pointsToRedeemMoney(pointsValue, settings) {
  const points = Math.max(0, parseMoney(pointsValue))
  const rateAmount = parseMoney(settings?.redeemRateAmount)
  const ratePoints = parseMoney(settings?.redeemRatePoints)

  if (points === 0 || ratePoints === 0 || !Number.isFinite(ratePoints)) {
    return decimalStringFromNumber(0)
  }

  const money = (points / ratePoints) * rateAmount
  if (!Number.isFinite(money) || money <= 0) {
    return decimalStringFromNumber(0)
  }

  return decimalStringFromNumber(money)
}

/**
 * Allocate a loyalty money discount across cart lines.
 * - No item restriction → `allocateOrderDiscount` over the full cart.
 * - Restriction configured → only redeemable lines get a share; others `"0.00"`.
 *
 * @param {LoyaltyRedeemCartLine[]} cartLines
 * @param {string | number} discountMoney
 * @param {string[] | null | undefined} redeemableMenuItemIds
 * @returns {string[]}
 */
export function allocateLoyaltyRedeemDiscount(
  cartLines,
  discountMoney,
  redeemableMenuItemIds,
) {
  const list = Array.isArray(cartLines) ? cartLines : []
  if (list.length === 0) return []

  const hasRestriction =
    Array.isArray(redeemableMenuItemIds) && redeemableMenuItemIds.length > 0

  if (!hasRestriction) {
    return allocateOrderDiscount(list, discountMoney)
  }

  const allowed = new Set(redeemableMenuItemIds.map(String))
  /** @type {number[]} */
  const indices = []
  /** @type {LoyaltyRedeemCartLine[]} */
  const subset = []
  for (let i = 0; i < list.length; i++) {
    if (allowed.has(String(list[i]?.menuItemId ?? ''))) {
      indices.push(i)
      subset.push(list[i])
    }
  }

  const partial = allocateOrderDiscount(subset, discountMoney)
  const out = list.map(() => '0.00')
  for (let j = 0; j < indices.length; j++) {
    out[indices[j]] = partial[j] ?? '0.00'
  }
  return out
}

/**
 * Ex-VAT money value of cart lines eligible for point redemption.
 *
 * - No item restriction (`redeemableMenuItemIds` empty/null) → full cart
 *   subtotal via `orderSubtotalFromLines`.
 * - Restriction configured → sum only lines whose `menuItemId` is in the set
 *   (still via `orderSubtotalFromLines` on the filtered list).
 *
 * @param {LoyaltyRedeemCartLine[] | null | undefined} cartLines
 * @param {LoyaltyRedeemSettings | null | undefined} settings
 * @returns {string}
 */
export function computeRedeemableValueInCart(cartLines, settings) {
  const list = Array.isArray(cartLines) ? cartLines : []

  if (!hasRedeemableItemRestriction(settings)) {
    return orderSubtotalFromLines(list)
  }

  const allowed = new Set(
    /** @type {string[]} */ (settings.redeemableMenuItemIds).map(String),
  )
  const eligible = list.filter((line) =>
    allowed.has(String(line?.menuItemId ?? '')),
  )
  return orderSubtotalFromLines(eligible)
}

/**
 * Three redeem ceilings + binding (minimum) factor for POS messaging.
 *
 * Comparisons use `parseMoney` — never raw string `<` / `>`.
 *
 * `cartTotals` is accepted for Step 10/11 callers that already hold invoice
 * totals; redeemable-value math always comes from `cartLines` + settings.
 *
 * @param {{ balance?: string | number | null } | null | undefined} account
 * @param {LoyaltyRedeemSettings | null | undefined} settings
 * @param {LoyaltyRedeemCartLine[] | null | undefined} cartLines
 * @param {unknown} [_cartTotals]
 * @returns {LoyaltyRedeemCeilings}
 */
export function computeLoyaltyRedeemCeilings(
  account,
  settings,
  cartLines,
  _cartTotals,
) {
  const balanceCeiling = decimalStringFromNumber(
    Math.max(0, parseMoney(account?.balance)),
  )

  const maxPerOrderRaw = settings?.maxPointsPerOrder
  const perOrderCeiling =
    maxPerOrderRaw == null || String(maxPerOrderRaw).trim() === ''
      ? null
      : decimalStringFromNumber(Math.max(0, parseMoney(maxPerOrderRaw)))

  const redeemableMoney = computeRedeemableValueInCart(cartLines, settings)
  const redeemableValueCeiling = moneyToRedeemPoints(redeemableMoney, settings)

  /** @type {{ factor: 'balance' | 'per_order_max' | 'redeemable_value', value: number }} */
  let best = {
    factor: 'balance',
    value: parseMoney(balanceCeiling),
  }

  if (perOrderCeiling != null) {
    const n = parseMoney(perOrderCeiling)
    if (n + 1e-9 < best.value) {
      best = { factor: 'per_order_max', value: n }
    }
  }

  {
    const n = parseMoney(redeemableValueCeiling)
    if (n + 1e-9 < best.value) {
      best = { factor: 'redeemable_value', value: n }
    }
  }

  return {
    balanceCeiling,
    perOrderCeiling,
    redeemableValueCeiling,
    effectiveCeiling: decimalStringFromNumber(Math.max(0, best.value)),
    limitingFactor: best.factor,
  }
}
