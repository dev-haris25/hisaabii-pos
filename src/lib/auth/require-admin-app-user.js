import { jsonError } from '@/lib/api/json-response'
import { getSessionUser } from '@/lib/auth/get-session-user'
import {
  getPostAuthLandingPath,
  isKitchenOrQueueDisplayUser,
} from '@/lib/auth/post-auth-landing-path'
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

  if (isKitchenOrQueueDisplayUser(user)) {
    redirect(getPostAuthLandingPath(user))
  }

  const ability = createMongoAbility(user.abilityRules ?? [])
  const managesBusiness =
    hasFullAccess(ability) ||
    ability.can('update', 'BusinessProfile') ||
    ability.can('create', 'BusinessProfile')

  // Restaurant list/create must stay reachable while ZATCA is still pending
  // (add-restaurant flow). First-run ZATCA stays on /zatca-onboarding via
  // post-auth landing after /business-profile, not this app-shell gate.
  if (managesBusiness && user.needsBusinessProfileOnboarding) {
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
  if (isKitchenOrQueueDisplayUser(user)) return null
  const ability = createMongoAbility(user.abilityRules ?? [])
  const managesBusiness =
    hasFullAccess(ability) ||
    ability.can('update', 'BusinessProfile') ||
    ability.can('create', 'BusinessProfile')
  if (managesBusiness && user.needsBusinessProfileOnboarding) {
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
