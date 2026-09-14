import { jsonError } from '@/lib/api/json-response'
import { getSessionUser } from '@/lib/auth/get-session-user'
import { getPostAuthLandingPath } from '@/lib/auth/post-auth-landing-path'
import { createMongoAbility } from '@casl/ability'
import { hasFullAccess } from '@/lib/rbac/ability-utils'
import { redirect } from 'next/navigation'

/**
 * Gate authenticated pages that need a completed restaurant profile.
 * Fine-grained subject checks belong on APIs / UI via CASL.
 * @returns {Promise<NonNullable<Awaited<ReturnType<typeof getSessionUser>>>>}
 */
export async function requireAdminAppUser() {
  const user = await getSessionUser()
  if (!user) {
    redirect('/login')
  }
  if (!user.hasBusinessProfile || !user.active) {
    redirect(getPostAuthLandingPath(user))
  }

  const ability = createMongoAbility(user.abilityRules ?? [])
  const managesBusiness =
    hasFullAccess(ability) ||
    ability.can('update', 'BusinessProfile') ||
    ability.can('create', 'BusinessProfile')

  if (managesBusiness && (user.needsBusinessProfileOnboarding || user.needsZatcaOnboarding)) {
    redirect(getPostAuthLandingPath(user))
  }

  return user
}

/**
 * For API-style checks from RSC that should return null instead of redirect.
 */
export async function getAdminAppUserOrNull() {
  const user = await getSessionUser()
  if (!user) return null
  if (!user.hasBusinessProfile || !user.active) return null
  const ability = createMongoAbility(user.abilityRules ?? [])
  const managesBusiness =
    hasFullAccess(ability) ||
    ability.can('update', 'BusinessProfile') ||
    ability.can('create', 'BusinessProfile')
  if (managesBusiness && (user.needsBusinessProfileOnboarding || user.needsZatcaOnboarding)) {
    return null
  }
  return user
}

export function adminForbidden() {
  return jsonError(403, 'FORBIDDEN', 'Not allowed')
}

/**
 * Restaurant list/create pages — owners only.
 * @returns {Promise<NonNullable<Awaited<ReturnType<typeof getSessionUser>>>>}
 */
export async function requireRestaurantOwnerAppUser() {
  const user = await requireAdminAppUser()
  if (user.isRestaurantOwner !== true) {
    redirect('/')
  }
  return user
}
