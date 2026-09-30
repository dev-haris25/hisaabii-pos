/**
 * Loyalty customer detail stats — same approach as computeEmployeeBalance:
 * fetch related rows, reduce with parseMoney, return string totals.
 * No Prisma `_sum` (money/points are strings).
 */

import {
  decimalStringFromNumber,
  parseMoney,
} from '@/lib/invoices/invoice-compute-totals'

/**
 * @param {{
 *   invoices: Array<{ grandTotal?: string | number | null }>
 *   transactions: Array<{ type: string, points?: string | number | null }>
 * }} data
 * @returns {{
 *   totalSpend: string
 *   totalPointsEarned: string
 *   totalPointsRedeemed: string
 *   visitCount: number
 * }}
 */
export function computeLoyaltyAccountStats(data) {
  const invoices = Array.isArray(data.invoices) ? data.invoices : []
  const transactions = Array.isArray(data.transactions) ? data.transactions : []

  let totalSpend = 0
  for (const inv of invoices) {
    totalSpend += parseMoney(inv.grandTotal)
  }

  let earned = 0
  let redeemed = 0
  for (const tx of transactions) {
    const pts = parseMoney(tx.points)
    if (tx.type === 'EARN') earned += pts
    else if (tx.type === 'REDEEM') redeemed += pts
  }

  return {
    totalSpend: decimalStringFromNumber(totalSpend),
    totalPointsEarned: decimalStringFromNumber(earned),
    totalPointsRedeemed: decimalStringFromNumber(redeemed),
    visitCount: invoices.length,
  }
}
