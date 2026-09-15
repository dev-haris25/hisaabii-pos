import { jsonError } from '@/lib/api/json-response'
import { getResolvedActiveBusinessProfile } from '@/lib/auth/active-business-profile'
import { getSessionUser } from '@/lib/auth/get-session-user'
import { getPostAuthLandingPath } from '@/lib/auth/post-auth-landing-path'
import { createMongoAbility } from '@casl/ability'
import { hasFullAccess } from '@/lib/rbac/ability-utils'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'
import { redirect } from 'next/navigation'

/**
 * @param {'kitchen'} [view]
 */
export async function requireKitchenQueuePageUser(view = 'kitchen') {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  if (!user.hasBusinessProfile || !user.active) redirect('/login')

  const ability = createMongoAbility(user.abilityRules ?? [])
  const ok =
    hasFullAccess(ability) ||
    (view === 'kitchen' && ability.can('read', 'KitchenBoard'))

  if (!ok) redirect(getPostAuthLandingPath(user))
  return user
}

/**
 * Owner / Admin shortcut to the public customer queue URL.
 */
export async function requireOwnerAdminCustomerQueueShortcut() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  if (!user.hasBusinessProfile || !user.active) {
    redirect(getPostAuthLandingPath(user))
  }
  const ability = createMongoAbility(user.abilityRules ?? [])
  if (!hasFullAccess(ability) && user.isRestaurantOwner !== true) {
    redirect(getPostAuthLandingPath(user))
  }
  return user
}

/**
 * @param {import('next/server').NextRequest} request
 * @param {'kitchen' | 'update'} mode
 */
export async function requireKitchenQueueApi(request, mode) {
  const auth = await authorizeBusinessRequest({
    request,
    skipPermissionCheck: true,
  })
  if (auth.error) return auth

  const { ability, session, profile } = auth
  const allowed =
    hasFullAccess(ability) ||
    (mode === 'update'
      ? ability.can('update', 'KitchenBoard')
      : ability.can('read', 'KitchenBoard'))

  if (!allowed) {
    return { error: jsonError(403, 'FORBIDDEN', 'Not allowed') }
  }

  const resolved = await getResolvedActiveBusinessProfile(session.id)
  if (!resolved?.onboardingCompletedAt) {
    return {
      error: jsonError(403, 'BUSINESS_PROFILE_REQUIRED', 'Restaurant profile required'),
    }
  }

  return { session, profileId: profile.id, ability }
}
