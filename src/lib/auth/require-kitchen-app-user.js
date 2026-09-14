import { jsonError } from '@/lib/api/json-response'
import { getResolvedActiveBusinessProfile } from '@/lib/auth/active-business-profile'
import { getSessionUser } from '@/lib/auth/get-session-user'
import { getPostAuthLandingPath } from '@/lib/auth/post-auth-landing-path'
import { createMongoAbility } from '@casl/ability'
import { hasFullAccess } from '@/lib/rbac/ability-utils'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'
import { redirect } from 'next/navigation'

/**
 * @param {'kitchen' | 'queue'} view
 */
export async function requireKitchenQueuePageUser(view) {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  if (!user.hasBusinessProfile || !user.active) redirect('/login')

  const ability = createMongoAbility(user.abilityRules ?? [])
  const ok =
    hasFullAccess(ability) ||
    (view === 'kitchen'
      ? ability.can('read', 'KitchenBoard')
      : ability.can('read', 'QueueDisplay'))

  if (!ok) redirect(getPostAuthLandingPath(user))
  return user
}

/**
 * @param {import('next/server').NextRequest} request
 * @param {'kitchen' | 'queue' | 'update'} mode
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
      : mode === 'kitchen'
        ? ability.can('read', 'KitchenBoard')
        : ability.can('read', 'QueueDisplay') ||
          ability.can('read', 'KitchenBoard'))

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
