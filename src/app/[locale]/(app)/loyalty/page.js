import { createMongoAbility } from '@casl/ability'
import { setRequestLocale } from 'next-intl/server'
import { redirect } from 'next/navigation'

import { requireAdminAppUser } from '@/lib/auth/require-admin-app-user'
import { hasFullAccess } from '@/lib/rbac/ability-utils'

/**
 * Bare `/loyalty` lands on Customers (primary list under the Loyalty group).
 * @param {{ params: Promise<{ locale: string }> }} props
 */
export default async function LoyaltyIndexPage({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const user = await requireAdminAppUser()

  const ability = createMongoAbility(user.abilityRules ?? [])
  if (!hasFullAccess(ability) && !ability.can('read', 'Loyalty')) {
    redirect(`/${locale}`)
  }

  redirect(`/${locale}/loyalty/customers`)
}
