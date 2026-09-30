import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { prisma } from '@/lib/prisma'

/**
 * Whether this business has at least one coupon that would pass
 * `checkCouponEligibility` (plus `deletedAt: null` from resolveCouponCode).
 *
 * Display-only for POS menu — validate/checkout still enforce eligibility.
 *
 * Prisma cannot compare `usedCount` to `totalUsageLimit` / `usageLimit` on
 * the same row in a `where` clause, so date/active/deleted candidates are
 * loaded and the usage-limit check is applied in JS (same `>=` / `<`
 * semantics as `checkCouponEligibility`).
 *
 * @param {string} businessProfileId
 * @param {Date} [now]
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient | typeof prisma} [db]
 * @returns {Promise<boolean>}
 */
export async function businessHasAvailableCoupons(
  businessProfileId,
  now = new Date(),
  db = prisma,
) {
  const candidates = await db.coupon.findMany({
    where: {
      businessProfileId,
      ...WHERE_NOT_DELETED,
      active: true,
      AND: [
        { OR: [{ startDate: null }, { startDate: { lte: now } }] },
        { OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] },
      ],
    },
    select: {
      codeType: true,
      totalUsageLimit: true,
      usedCount: true,
      codes: {
        select: {
          usageLimit: true,
          usedCount: true,
        },
      },
    },
  })

  return candidates.some((coupon) => {
    if (coupon.codeType === 'SHARED') {
      // Mirrors: totalUsageLimit != null && usedCount >= totalUsageLimit → ineligible
      if (coupon.totalUsageLimit == null) return true
      return coupon.usedCount < coupon.totalUsageLimit
    }
    if (coupon.codeType === 'UNIQUE_BATCH') {
      // Mirrors per-code: usageLimit != null && usedCount >= usageLimit → ineligible
      return coupon.codes.some(
        (code) =>
          code.usageLimit == null || code.usedCount < code.usageLimit,
      )
    }
    return false
  })
}
