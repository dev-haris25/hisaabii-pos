import { prisma } from '@/lib/prisma'

/**
 * Whether Loyalty module is enabled for this restaurant.
 * Uses existing LoyaltySettings.enabled — does not create settings.
 *
 * @param {string} businessProfileId
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient | typeof prisma} [db]
 */
export async function isLoyaltyEnabledForProfile(businessProfileId, db = prisma) {
  const settings = await db.loyaltySettings.findUnique({
    where: { businessProfileId },
    select: { enabled: true },
  })
  return settings?.enabled === true
}

/**
 * @param {string} businessProfileId
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient | typeof prisma} [db]
 */
export async function loadEnabledLoyaltySettings(businessProfileId, db = prisma) {
  const settings = await db.loyaltySettings.findUnique({
    where: { businessProfileId },
  })
  if (!settings || settings.enabled !== true) return null
  return settings
}
