import {
  computeLineAmounts,
  decimalStringFromNumber,
  parseMoney,
} from '@/lib/invoices/invoice-compute-totals'
import { pointsToRedeemMoney } from '@/lib/loyalty/compute-loyalty-redeem-ceilings'

/**
 * Staff settle preview: VAT-inclusive gross, loyalty discount money, net due.
 *
 * @param {Array<Record<string, unknown>>} lines
 * @param {string | null | undefined} requestedRedeemPoints
 * @param {{
 *   redeemRatePoints?: string | number | null
 *   redeemRateAmount?: string | number | null
 * } | null | undefined} loyaltySettings
 */
export function estimateTableSessionBilling(
  lines,
  requestedRedeemPoints,
  loyaltySettings,
) {
  let gross = 0
  const list = Array.isArray(lines) ? lines : []
  for (const line of list) {
    gross += computeLineAmounts({
      quantity: Number(line.quantity) || 0,
      unitPrice: String(line.unitPrice ?? '0'),
      vatPreset: String(line.vatPreset ?? 'standard'),
    }).lineTotal
  }

  const totalInclVat = decimalStringFromNumber(gross)
  const redeemRaw =
    requestedRedeemPoints != null && String(requestedRedeemPoints).trim() !== ''
      ? String(requestedRedeemPoints).trim()
      : null

  let loyaltyDiscountMoney = '0.00'
  if (redeemRaw && loyaltySettings) {
    const discount = parseMoney(
      pointsToRedeemMoney(redeemRaw, loyaltySettings),
    )
    loyaltyDiscountMoney = decimalStringFromNumber(
      Math.min(Math.max(0, discount), Math.max(0, gross)),
    )
  }

  const dueInclVat = decimalStringFromNumber(
    Math.max(0, gross - parseMoney(loyaltyDiscountMoney)),
  )

  return {
    totalInclVat,
    loyaltyRedeemPoints: redeemRaw,
    loyaltyDiscountMoney,
    dueInclVat,
  }
}
