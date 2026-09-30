/**
 * Concurrency-safe loyalty balance decrement (Redeem).
 * Mirrors Coupons' updateMany+where guard: only one concurrent spender wins.
 *
 * Balance is a money-string column — Prisma cannot safely `gte` on strings
 * (lexicographic). Pattern: read → check `balance >= points` in JS via
 * parseMoney → updateMany WHERE `balance` equals the read value (optimistic
 * CAS). Concurrent change → 0 rows → caller aborts with
 * LOYALTY_BALANCE_CHANGED_RETRY.
 *
 * Decrement itself is atomic in SQL: SET balance = next computed string.
 */

import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import {
  decimalStringFromNumber,
  parseMoney,
} from '@/lib/invoices/invoice-compute-totals'

/**
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient} tx
 * @param {string} accountId
 * @param {string | number} pointsToRedeem
 * @returns {Promise<boolean>} true only when exactly one row was updated
 */
export async function decrementLoyaltyBalanceGuarded(
  tx,
  accountId,
  pointsToRedeem,
) {
  const pointsN = parseMoney(pointsToRedeem)
  if (!(pointsN > 0) || !Number.isFinite(pointsN)) return false

  const current = await tx.loyaltyAccount.findFirst({
    where: { id: accountId, ...WHERE_NOT_DELETED },
    select: { id: true, balance: true },
  })
  if (!current) return false

  const balanceN = parseMoney(current.balance)
  if (balanceN + 1e-9 < pointsN) return false

  const nextBalance = decimalStringFromNumber(balanceN - pointsN)

  const result = await tx.loyaltyAccount.updateMany({
    where: {
      id: accountId,
      deletedAt: null,
      balance: current.balance,
    },
    data: { balance: nextBalance },
  })
  return result.count === 1
}
