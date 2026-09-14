import { jsonError } from '@/lib/api/json-response'
import { getResolvedActiveBusinessProfile } from '@/lib/auth/active-business-profile'
import { getSessionUser } from '@/lib/auth/get-session-user'
import { getPostAuthLandingPath } from '@/lib/auth/post-auth-landing-path'
import { createMongoAbility } from '@casl/ability'
import { hasFullAccess } from '@/lib/rbac/ability-utils'
import { redirect } from 'next/navigation'

/**
 * Any login-capable user with Pos read/create access.
 */
export async function requirePosAppUser() {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  if (!user.hasBusinessProfile || !user.active) {
    redirect('/login')
  }

  const ability = createMongoAbility(user.abilityRules ?? [])
  if (!hasFullAccess(ability) && !ability.can('read', 'Pos') && !ability.can('create', 'Pos')) {
    redirect(getPostAuthLandingPath(user))
  }

  // Owners/managers still need ZATCA onboarding when applicable
  if (
    (hasFullAccess(ability) || ability.can('update', 'BusinessProfile')) &&
    (user.needsBusinessProfileOnboarding || user.needsZatcaOnboarding)
  ) {
    redirect(getPostAuthLandingPath(user))
  }

  return user
}

/**
 * API auth for POS routes.
 * @returns {Promise<
 *   | { error: Response }
 *   | { session: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>, profileId: string }
 * >}
 */
export async function requirePosRestaurant() {
  const session = await getSessionUser()
  if (!session) {
    return { error: jsonError(401, 'UNAUTHORIZED', 'Sign in required') }
  }
  if (!session.active) {
    return { error: jsonError(403, 'ACCOUNT_DISABLED', 'Account is disabled') }
  }

  const ability = createMongoAbility(session.abilityRules ?? [])
  if (!hasFullAccess(ability) && !ability.can('create', 'Pos') && !ability.can('read', 'Pos')) {
    return { error: jsonError(403, 'FORBIDDEN', 'Not allowed') }
  }

  const profile = await getResolvedActiveBusinessProfile(session.id)
  if (!profile?.onboardingCompletedAt) {
    return {
      error: jsonError(403, 'BUSINESS_PROFILE_REQUIRED', 'Restaurant profile required'),
    }
  }
  if (
    (hasFullAccess(ability) || ability.can('update', 'BusinessProfile')) &&
    session.needsZatcaOnboarding
  ) {
    return {
      error: jsonError(403, 'ZATCA_NOT_ONBOARDED', 'Complete ZATCA onboarding first'),
    }
  }
  return { session, profileId: profile.id }
}
