import { userCanAccessBusinessProfile } from '@/lib/auth/accessible-business-profiles'
import { prisma } from '@/lib/prisma'

/**
 * Resolves the user's active business profile.
 * Backfills `activeBusinessProfileId` when missing but memberships exist.
 * Same resolution path for every login-capable employee (no role special-casing).
 *
 * @param {string} userId
 * @returns {Promise<import('@/generated/prisma/client').BusinessProfile | null>}
 */
export async function getResolvedActiveBusinessProfile(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      activeBusinessProfileId: true,
    },
  })
  if (!user) return null

  if (user.activeBusinessProfileId) {
    const canAccess = await userCanAccessBusinessProfile(
      userId,
      user.activeBusinessProfileId,
    )
    if (canAccess) {
      const profile = await prisma.businessProfile.findUnique({
        where: { id: user.activeBusinessProfileId },
      })
      if (profile) return profile
    }
  }

  const membership = await prisma.businessMembership.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: { businessProfile: true },
  })

  if (membership?.businessProfile) {
    if (user.activeBusinessProfileId !== membership.businessProfileId) {
      await prisma.user.update({
        where: { id: userId },
        data: { activeBusinessProfileId: membership.businessProfileId },
      })
    }
    return membership.businessProfile
  }

  if (user.activeBusinessProfileId) {
    await prisma.user.update({
      where: { id: userId },
      data: { activeBusinessProfileId: null },
    })
  }

  return null
}

/** @param {{ logoStoragePath?: string | null, logoMimeType?: string | null }} row */
export function profileHasStoredLogo(row) {
  return Boolean(String(row?.logoStoragePath ?? '').trim())
}
