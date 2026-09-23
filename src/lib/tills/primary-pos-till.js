import { prisma } from '@/lib/prisma'

/**
 * Ensure the restaurant has a primary offline till when any tills exist.
 * If unset and exactly one (or more) tills exist, picks the oldest by createdAt.
 *
 * @param {string} businessProfileId
 * @param {import('@/generated/prisma').Prisma.TransactionClient | typeof prisma} [db]
 * @returns {Promise<string | null>} primary till id
 */
export async function ensurePrimaryPosTillId(businessProfileId, db = prisma) {
  const profile = await db.businessProfile.findUnique({
    where: { id: businessProfileId },
    select: { primaryPosTillId: true },
  })
  if (!profile) return null
  if (profile.primaryPosTillId) {
    const stillThere = await db.posTill.findFirst({
      where: {
        id: profile.primaryPosTillId,
        businessProfileId,
      },
      select: { id: true },
    })
    if (stillThere) return stillThere.id
  }

  const oldest = await db.posTill.findFirst({
    where: { businessProfileId },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  if (!oldest) {
    if (profile.primaryPosTillId) {
      await db.businessProfile.update({
        where: { id: businessProfileId },
        data: { primaryPosTillId: null },
      })
    }
    return null
  }

  await db.businessProfile.update({
    where: { id: businessProfileId },
    data: { primaryPosTillId: oldest.id },
  })
  return oldest.id
}

/**
 * Set the restaurant's primary offline till. Caller must authorize.
 * Heartbeat / pendingUploadCount guards live in assertPrimarySwitchAllowed (Step 8);
 * call that before this from the primary API route.
 *
 * @param {string} businessProfileId
 * @param {string} tillId
 * @param {import('@/generated/prisma').Prisma.TransactionClient | typeof prisma} [db]
 */
export async function setPrimaryPosTillId(businessProfileId, tillId, db = prisma) {
  const till = await db.posTill.findFirst({
    where: { id: tillId, businessProfileId },
    select: { id: true },
  })
  if (!till) {
    const err = new Error('TILL_NOT_FOUND')
    err.code = 'TILL_NOT_FOUND'
    throw err
  }

  await db.businessProfile.update({
    where: { id: businessProfileId },
    data: { primaryPosTillId: till.id },
  })
  return till.id
}

/**
 * After deleting a till, clear or reassign primary.
 *
 * @param {string} businessProfileId
 * @param {string} [_deletedTillId]
 * @param {import('@/generated/prisma').Prisma.TransactionClient | typeof prisma} [db]
 */
export async function reassignPrimaryAfterTillDelete(
  businessProfileId,
  _deletedTillId,
  db = prisma,
) {
  return ensurePrimaryPosTillId(businessProfileId, db)
}
