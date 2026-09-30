import { randomInt } from 'node:crypto'

/** Ambiguous 0/O, 1/I/L excluded for printed-ticket readability. */
export const COUPON_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export const COUPON_CODE_LENGTH = 8

/** Same retry budget as createUniqueSlug (restaurant slug allocation). */
const MAX_ALLOC_ATTEMPTS = 12

/**
 * @returns {string} 8-char uppercase code from COUPON_CODE_ALPHABET
 */
export function generateCouponCodeString() {
  let out = ''
  for (let i = 0; i < COUPON_CODE_LENGTH; i++) {
    out += COUPON_CODE_ALPHABET[randomInt(COUPON_CODE_ALPHABET.length)]
  }
  return out
}

/**
 * Allocate one code unused on Coupon.code and CouponCode.code for this business.
 * Also skips codes already reserved in the caller (`reserved`, e.g. in-batch Set).
 *
 * Shared primitive for Shared Code generation and UNIQUE_BATCH batch generation.
 *
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient | typeof import('@/lib/prisma').prisma} db
 * @param {string} businessProfileId
 * @param {Set<string>} [reserved]
 * @returns {Promise<string>}
 */
export async function allocateUniqueCouponCode(
  db,
  businessProfileId,
  reserved = new Set(),
) {
  for (let i = 0; i < MAX_ALLOC_ATTEMPTS; i++) {
    const code = generateCouponCodeString()
    if (reserved.has(code)) continue

    const [sharedHit, batchHit] = await Promise.all([
      db.coupon.findUnique({
        where: {
          businessProfileId_code: { businessProfileId, code },
        },
        select: { id: true },
      }),
      db.couponCode.findUnique({
        where: {
          businessProfileId_code: { businessProfileId, code },
        },
        select: { id: true },
      }),
    ])

    if (!sharedHit && !batchHit) return code
  }
  throw new Error('Could not allocate coupon code')
}
