import { allocateUniqueCouponCode } from '@/lib/coupons/allocate-unique-coupon-code'
import { prisma } from '@/lib/prisma'

/**
 * System-generate one Shared coupon code string for a business.
 * Collision-checked against Coupon.code and CouponCode.code.
 * Does not create a Coupon or CouponCode row — caller persists it.
 * Pass `db` to run inside an outer transaction.
 *
 * @param {string} businessProfileId
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient | typeof prisma} [db]
 * @returns {Promise<string>}
 */
export async function generateSharedCouponCode(businessProfileId, db = prisma) {
  return allocateUniqueCouponCode(db, businessProfileId)
}
