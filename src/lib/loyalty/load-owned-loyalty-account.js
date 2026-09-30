import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { prisma } from '@/lib/prisma'

/**
 * Active loyalty account owned by the restaurant, or null.
 *
 * @param {string} businessProfileId
 * @param {string} id
 * @param {import('@/generated/prisma').Prisma.TransactionClient | typeof prisma} [db]
 */
export async function loadOwnedLoyaltyAccount(
  businessProfileId,
  id,
  db = prisma,
) {
  return db.loyaltyAccount.findFirst({
    where: { id, businessProfileId, ...WHERE_NOT_DELETED },
  })
}
