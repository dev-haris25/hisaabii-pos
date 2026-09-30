/**
 * Loyalty redeem eligibility / amount-validation gates (pure).
 *
 * VAT-inclusive min-order: callers pass a total produced by Coupons'
 * `orderVatInclusiveSubtotalFromLines` — this module does not reimplement
 * VAT math (same basis as the Coupons min-order fix).
 */

import { parseMoney } from '@/lib/invoices/invoice-compute-totals'

/**
 * @typedef {{
 *   eligible: true
 * } | {
 *   eligible: false
 *   reason: 'below_min_balance'
 * }} LoyaltyBalanceEligibility
 */

/**
 * @typedef {{
 *   eligible: true
 * } | {
 *   eligible: false
 *   reason: 'below_min_order'
 * }} LoyaltyMinOrderEligibility
 */

/**
 * @typedef {{
 *   valid: true
 * } | {
 *   valid: false
 *   reason: 'invalid_amount' | 'not_positive' | 'exceeds_ceiling'
 *   limitingFactor?: string
 *   maxAllowed?: string
 * }} LoyaltyRedeemAmountValidation
 */

/**
 * One-time gate after the phone modal: balance vs `minBalanceToRedeem`.
 * Null / blank min → always eligible on this dimension.
 *
 * @param {{ balance?: string | number | null } | null | undefined} account
 * @param {{ minBalanceToRedeem?: string | number | null } | null | undefined} settings
 * @returns {LoyaltyBalanceEligibility}
 */
export function checkLoyaltyRedeemEligibility(account, settings) {
  const minRaw = settings?.minBalanceToRedeem
  if (minRaw == null || String(minRaw).trim() === '') {
    return { eligible: true }
  }

  const balance = parseMoney(account?.balance)
  const minBalance = parseMoney(minRaw)

  if (balance + 1e-9 < minBalance) {
    return { eligible: false, reason: 'below_min_balance' }
  }

  return { eligible: true }
}

/**
 * Min order gate for redeem — VAT-INCLUSIVE total vs `minOrderValueToRedeem`.
 * Null / blank min → always eligible on this dimension.
 *
 * `cartVatInclusiveTotal` must come from
 * `orderVatInclusiveSubtotalFromLines` (Coupons helper) — do not invent a
 * parallel VAT sum.
 *
 * @param {string | number | null | undefined} cartVatInclusiveTotal
 * @param {{ minOrderValueToRedeem?: string | number | null } | null | undefined} settings
 * @returns {LoyaltyMinOrderEligibility}
 */
export function checkLoyaltyMinOrderValue(cartVatInclusiveTotal, settings) {
  const minRaw = settings?.minOrderValueToRedeem
  if (minRaw == null || String(minRaw).trim() === '') {
    return { eligible: true }
  }

  const total = parseMoney(cartVatInclusiveTotal)
  const minOrder = parseMoney(minRaw)

  if (total + 1e-9 < minOrder) {
    return { eligible: false, reason: 'below_min_order' }
  }

  return { eligible: true }
}

/**
 * Live-validation of a typed redeem amount against ceilings from
 * `computeLoyaltyRedeemCeilings`.
 *
 * @param {string | number | null | undefined} requestedPoints
 * @param {{
 *   effectiveCeiling?: string | number | null
 *   limitingFactor?: string | null
 * } | null | undefined} ceilings
 * @returns {LoyaltyRedeemAmountValidation}
 */
export function validateLoyaltyRedeemAmount(requestedPoints, ceilings) {
  if (requestedPoints == null || String(requestedPoints).trim() === '') {
    return { valid: false, reason: 'invalid_amount' }
  }

  const raw = String(requestedPoints).replace(/,/g, '').trim()
  if (!/^-?\d+(\.\d+)?$/.test(raw)) {
    return { valid: false, reason: 'invalid_amount' }
  }

  const requested = Number.parseFloat(raw)
  if (!Number.isFinite(requested)) {
    return { valid: false, reason: 'invalid_amount' }
  }

  if (requested <= 0) {
    return { valid: false, reason: 'not_positive' }
  }

  const maxAllowed = ceilings?.effectiveCeiling ?? '0.00'
  const max = parseMoney(maxAllowed)

  if (requested > max + 1e-9) {
    return {
      valid: false,
      reason: 'exceeds_ceiling',
      limitingFactor: String(ceilings?.limitingFactor ?? 'balance'),
      maxAllowed: String(maxAllowed),
    }
  }

  return { valid: true }
}
