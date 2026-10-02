import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { prisma } from '@/lib/prisma'

/**
 * True when the restaurant has at least one non-deleted floor table.
 *
 * @param {string | null | undefined} businessProfileId
 * @returns {Promise<boolean>}
 */
export async function restaurantHasActiveTables(businessProfileId) {
  const id = typeof businessProfileId === 'string' ? businessProfileId.trim() : ''
  if (!id) return false
  const count = await prisma.table.count({
    where: {
      businessProfileId: id,
      ...WHERE_NOT_DELETED,
    },
  })
  return count > 0
}
