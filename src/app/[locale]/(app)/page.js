import { getTranslations, setRequestLocale } from 'next-intl/server'

import { DashboardClient } from './dashboard-client'
import { redirect } from '@/i18n/navigation'
import { requireAdminAppUser } from '@/lib/auth/require-admin-app-user'
import { getAbilityForMembership } from '@/lib/rbac/get-ability'
import {
  canAccessSidebarHref,
  getFirstAccessibleRouteFromAbility,
} from '@/lib/rbac/sidebar-permissions'

export async function generateMetadata({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('Dashboard')
  return { title: t('metaTitle') }
}

export default async function AdminDashboardPage({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const user = await requireAdminAppUser()

  if (user.activeBusinessProfileId) {
    const ability = await getAbilityForMembership(user.id, user.activeBusinessProfileId)
    const sidebarOpts = { isRestaurantOwner: user.isRestaurantOwner === true }
    if (!canAccessSidebarHref(ability, '/', sidebarOpts)) {
      const firstAccessible = getFirstAccessibleRouteFromAbility(
        ability,
        sidebarOpts,
      )
      if (firstAccessible && firstAccessible !== '/') {
        redirect({ href: firstAccessible, locale })
      }
    }
  }

  return (
    <DashboardClient hasBusinessProfile={user.hasBusinessProfile === true} />
  )
}
