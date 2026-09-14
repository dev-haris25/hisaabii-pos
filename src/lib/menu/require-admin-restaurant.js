import { getResolvedActiveBusinessProfile } from '@/lib/auth/active-business-profile'
import { getSessionUser } from '@/lib/auth/get-session-user'
import { jsonError } from '@/lib/api/json-response'
import { createMongoAbility } from '@casl/ability'
import { hasFullAccess } from '@/lib/rbac/ability-utils'

/**
 * Session with menu management permission + linked restaurant profile.
 * @returns {Promise<
 *   | { error: import('next/server').NextResponse }
 *   | { session: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>, profileId: string }
 * >}
 */
export async function requireAdminRestaurant() {
  const session = await getSessionUser()
  if (!session) {
    return { error: jsonError(401, 'UNAUTHORIZED', 'Not signed in') }
  }

  const ability = createMongoAbility(session.abilityRules ?? [])
  const canManage =
    hasFullAccess(ability) ||
    ability.can('create', 'MenuItem') ||
    ability.can('update', 'MenuItem') ||
    ability.can('update', 'BusinessSettings') ||
    ability.can('create', 'BusinessProfile')

  if (!canManage) {
    return { error: jsonError(403, 'FORBIDDEN', 'Not allowed') }
  }

  const profile = await getResolvedActiveBusinessProfile(session.id)
  if (!profile?.onboardingCompletedAt) {
    return {
      error: jsonError(
        400,
        'BUSINESS_PROFILE_REQUIRED',
        'Complete restaurant profile first',
      ),
    }
  }
  return { session, profileId: profile.id }
}
