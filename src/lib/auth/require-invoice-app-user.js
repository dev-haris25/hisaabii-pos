import { getSessionUser } from '@/lib/auth/get-session-user'
import { getPostAuthLandingPath } from '@/lib/auth/post-auth-landing-path'
import { createMongoAbility } from '@casl/ability'
import { hasFullAccess } from '@/lib/rbac/ability-utils'
import { redirect } from 'next/navigation'

/**
 * Any user with Invoice (or note) read access for invoice pages.
 *
 * @returns {Promise<NonNullable<Awaited<ReturnType<typeof getSessionUser>>>>}
 */
export async function requireInvoiceAppUser() {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  if (!user.hasBusinessProfile || !user.active) {
    redirect('/login')
  }

  const ability = createMongoAbility(user.abilityRules ?? [])
  const canInvoice =
    hasFullAccess(ability) ||
    ability.can('read', 'Invoice') ||
    ability.can('read', 'CreditNote') ||
    ability.can('read', 'DebitNote') ||
    ability.can('read', 'Pos')

  if (!canInvoice) {
    redirect(getPostAuthLandingPath(user))
  }

  if (
    (hasFullAccess(ability) || ability.can('update', 'BusinessProfile')) &&
    (user.needsBusinessProfileOnboarding || user.needsZatcaOnboarding)
  ) {
    redirect(getPostAuthLandingPath(user))
  }

  return user
}
