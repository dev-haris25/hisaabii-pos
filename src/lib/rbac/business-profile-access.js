import { userCanAccessBusinessProfile } from '@/lib/auth/accessible-business-profiles'
import { hasFullAccess } from '@/lib/rbac/ability-utils'
import { getAbilityForMembership } from '@/lib/rbac/get-ability'

/**
 * What a user may do on one restaurant's profile / ZATCA onboarding, judged by
 * the ability of THAT restaurant's membership — not the active restaurant's.
 * Being a member only makes the restaurant visible; it grants nothing else.
 *
 * @param {string} userId
 * @param {string | null | undefined} businessProfileId
 * @returns {Promise<{ member: boolean, canRead: boolean, canManage: boolean, canDelete: boolean }>}
 */
export async function getBusinessProfileAccess(userId, businessProfileId) {
  if (
    !businessProfileId ||
    !(await userCanAccessBusinessProfile(userId, businessProfileId))
  ) {
    return { member: false, canRead: false, canManage: false, canDelete: false }
  }
  const ability = await getAbilityForMembership(userId, businessProfileId)
  const full = hasFullAccess(ability)
  const canManage = full || ability.can('update', 'BusinessProfile')
  return {
    member: true,
    canRead: canManage || ability.can('read', 'BusinessProfile'),
    canManage,
    canDelete: full || ability.can('delete', 'BusinessProfile'),
  }
}
