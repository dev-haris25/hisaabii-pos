/**
 * Concurrency-safe usage increment for SHARED coupons.
 * updateMany with usedCount &lt; totalUsageLimit (or unlimited when null).
 * Returns true only when exactly one row was updated.
 *
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient} tx
 * @param {{ id: string, totalUsageLimit: number | null }} coupon
 * @returns {Promise<boolean>}
 */
export async function incrementSharedCouponUsageGuarded(tx, coupon) {
  /** @type {Record<string, unknown>} */
  const where = { id: coupon.id }
  if (coupon.totalUsageLimit != null) {
    where.usedCount = { lt: coupon.totalUsageLimit }
  }

  const result = await tx.coupon.updateMany({
    where,
    data: { usedCount: { increment: 1 } },
  })
  return result.count === 1
}

/**
 * Concurrency-safe usage increment for a UNIQUE_BATCH CouponCode row.
 *
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient} tx
 * @param {{ id: string, usageLimit: number | null }} couponCode
 * @returns {Promise<boolean>}
 */
export async function incrementBatchCouponCodeUsageGuarded(tx, couponCode) {
  /** @type {Record<string, unknown>} */
  const where = { id: couponCode.id }
  if (couponCode.usageLimit != null) {
    where.usedCount = { lt: couponCode.usageLimit }
  }

  const result = await tx.couponCode.updateMany({
    where,
    data: { usedCount: { increment: 1 } },
  })
  return result.count === 1
}
