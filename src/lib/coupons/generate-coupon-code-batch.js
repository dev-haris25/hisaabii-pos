import { allocateUniqueCouponCode } from '@/lib/coupons/allocate-unique-coupon-code'
import { PRISMA_INTERACTIVE_TRANSACTION_OPTIONS } from '@/lib/db/prisma-interactive-transaction-options'
import { prisma } from '@/lib/prisma'

/**
 * Insert batch CouponCode rows using an existing transaction client.
 *
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient} tx
 * @param {string} couponId
 * @param {string} businessProfileId
 * @param {number} quantity
 * @param {number | null | undefined} perCodeUsageLimit
 * @returns {Promise<import('@/generated/prisma/client').CouponCode[]>}
 */
async function insertCouponCodeBatch(
  tx,
  couponId,
  businessProfileId,
  quantity,
  perCodeUsageLimit,
) {
  const count = Math.max(0, Math.round(Number(quantity)) || 0)
  const usageLimit =
    perCodeUsageLimit == null ? null : Math.round(Number(perCodeUsageLimit))

  if (count === 0) return []

  /** @type {Set<string>} */
  const reserved = new Set()
  /** @type {Array<{
   *   couponId: string
   *   businessProfileId: string
   *   code: string
   *   ticketNumber: number
   *   usageLimit: number | null
   * }>} */
  const rows = []

  for (let ticketNumber = 1; ticketNumber <= count; ticketNumber++) {
    const code = await allocateUniqueCouponCode(tx, businessProfileId, reserved)
    reserved.add(code)
    rows.push({
      couponId,
      businessProfileId,
      code,
      ticketNumber,
      usageLimit,
    })
  }

  await tx.couponCode.createMany({ data: rows })

  return tx.couponCode.findMany({
    where: {
      couponId,
      ticketNumber: { gte: 1, lte: count },
    },
    orderBy: { ticketNumber: 'asc' },
  })
}

/**
 * Generate and insert a batch of unique CouponCode rows for a UNIQUE_BATCH coupon.
 * Pass `tx` to join an outer interactive transaction (create-coupon route).
 * Without `tx`, wraps its own transaction.
 * Does not validate a max quantity — that belongs in the API route layer.
 *
 * @param {string} couponId
 * @param {string} businessProfileId
 * @param {number} quantity
 * @param {number | null | undefined} perCodeUsageLimit
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient} [tx]
 * @returns {Promise<import('@/generated/prisma/client').CouponCode[]>}
 */
export async function generateCouponCodeBatch(
  couponId,
  businessProfileId,
  quantity,
  perCodeUsageLimit,
  tx,
) {
  if (tx) {
    return insertCouponCodeBatch(
      tx,
      couponId,
      businessProfileId,
      quantity,
      perCodeUsageLimit,
    )
  }

  return prisma.$transaction(
    (client) =>
      insertCouponCodeBatch(
        client,
        couponId,
        businessProfileId,
        quantity,
        perCodeUsageLimit,
      ),
    PRISMA_INTERACTIVE_TRANSACTION_OPTIONS,
  )
}
