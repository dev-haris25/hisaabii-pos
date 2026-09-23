import { prisma } from '@/lib/prisma'

/**
 * Reject offline checkout on a non-primary till (defense in depth).
 *
 * @param {string} businessProfileId
 * @param {{
 *   tillId?: string | null
 *   desktopOffline?: boolean
 * }} input
 * @returns {Promise<null | { code: string, message: string }>}
 */
export async function assertOfflineCheckoutAllowed(businessProfileId, input) {
  if (!input.desktopOffline) return null

  const tillId =
    typeof input.tillId === 'string' && input.tillId.trim()
      ? input.tillId.trim()
      : null

  if (!tillId) {
    return {
      code: 'PRIMARY_TILL_REQUIRED',
      message: 'Offline sales require the primary till',
    }
  }

  const profile = await prisma.businessProfile.findUnique({
    where: { id: businessProfileId },
    select: { primaryPosTillId: true },
  })

  const primaryId = profile?.primaryPosTillId ?? null
  if (!primaryId || primaryId !== tillId) {
    return {
      code: 'PRIMARY_TILL_REQUIRED',
      message: 'Only the primary till can take sales while offline',
    }
  }

  const till = await prisma.posTill.findFirst({
    where: { id: tillId, businessProfileId },
    select: { id: true },
  })
  if (!till) {
    return {
      code: 'PRIMARY_TILL_REQUIRED',
      message: 'Till not found for this restaurant',
    }
  }

  return null
}
