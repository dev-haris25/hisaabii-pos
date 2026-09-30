import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { prisma } from '@/lib/prisma'

/**
 * Normalize a typed coupon code for lookup (trim + uppercase).
 * @param {unknown} rawCode
 * @returns {string}
 */
export function normalizeCouponCodeInput(rawCode) {
  return String(rawCode ?? '')
    .trim()
    .toUpperCase()
}

/**
 * Resolve a typed code to its coupon (SHARED on Coupon, or UNIQUE_BATCH via CouponCode).
 * Lookup only — does not check active, dates, or usage limits.
 * Soft-deleted coupons (and their batch codes) never resolve.
 * Pass `db` to run inside an interactive transaction.
 *
 * @param {string} businessProfileId
 * @param {unknown} rawCode
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient | typeof prisma} [db]
 * @returns {Promise<{
 *   coupon: import('@/generated/prisma/client').Coupon
 *   couponCode: import('@/generated/prisma/client').CouponCode | null
 * } | null>}
 */
export async function resolveCouponCode(
  businessProfileId,
  rawCode,
  db = prisma,
) {
  const code = normalizeCouponCodeInput(rawCode)
  if (!code) return null

  const shared = await db.coupon.findFirst({
    where: {
      businessProfileId,
      code,
      ...WHERE_NOT_DELETED,
    },
  })
  if (shared) {
    return { coupon: shared, couponCode: null }
  }

  const batchRow = await db.couponCode.findFirst({
    where: {
      businessProfileId,
      code,
      coupon: WHERE_NOT_DELETED,
    },
    include: { coupon: true },
  })
  if (batchRow) {
    const { coupon, ...couponCode } = batchRow
    return { coupon, couponCode }
  }

  return null
}
