import { prisma } from '@/lib/prisma'

/** @typedef {import('@/generated/prisma').LoyaltySettings} LoyaltySettings */

/**
 * First-create defaults for required rate strings (no Prisma @default).
 * Product choice — flagged in the Step 7 implementation log:
 * - earn: 10 SAR → 1 point (common starting earn curve)
 * - redeem: 1 point → 1 SAR (1:1, matches redeem worked examples)
 * - enabled: false (safe until admin opts in)
 */
export const LOYALTY_SETTINGS_CREATE_DEFAULTS = Object.freeze({
  enabled: false,
  earnRateAmount: '10',
  earnRatePoints: '1',
  redeemRatePoints: '1',
  redeemRateAmount: '1',
})

/**
 * @param {string} businessProfileId
 * @param {import('@/generated/prisma').Prisma.TransactionClient | typeof prisma} [db]
 * @returns {Promise<LoyaltySettings>}
 */
export async function getOrCreateLoyaltySettings(businessProfileId, db = prisma) {
  const existing = await db.loyaltySettings.findUnique({
    where: { businessProfileId },
  })
  if (existing) return existing
  return db.loyaltySettings.create({
    data: {
      businessProfileId,
      ...LOYALTY_SETTINGS_CREATE_DEFAULTS,
    },
  })
}
