import { setRequestLocale } from 'next-intl/server'

import { AdminAppShell } from '@/components/app-shell/admin-app-shell'
import { requireAdminAppUser } from '@/lib/auth/require-admin-app-user'

/**
 * Shared authenticated shell for dashboard, POS, invoices, HR, settings, etc.
 * Page-level gates (e.g. requirePosAppUser) still apply per route.
 */
export default async function AppLayout({ children, params }) {
  const { locale } = await params
  setRequestLocale(locale)

  const user = await requireAdminAppUser()

  return (
    <AdminAppShell
      userName={user.name}
      userEmail={user.email ?? ''}
      hasBusinessProfile={user.hasBusinessProfile === true}
      zatcaOnboardingSkippedEffective={
        user.zatcaOnboardingSkippedEffective === true
      }
      abilityRules={user.abilityRules ?? []}
      accessibleBusinessProfileCount={user.accessibleBusinessProfileCount ?? 1}
      roleName={user.roleName ?? null}
      isRestaurantOwner={user.isRestaurantOwner === true}
    >
      {children}
    </AdminAppShell>
  )
}
