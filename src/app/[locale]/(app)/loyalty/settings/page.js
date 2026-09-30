import { createMongoAbility } from '@casl/ability'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { redirect } from 'next/navigation'

import { LoyaltySettingsView } from '../loyalty-settings-view'
import { requireAdminAppUser } from '@/lib/auth/require-admin-app-user'
import { hasFullAccess } from '@/lib/rbac/ability-utils'

export async function generateMetadata({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('Loyalty')
  return { title: t('settingsMetaTitle') }
}

/**
 * @param {{ params: Promise<{ locale: string }> }} props
 */
export default async function LoyaltySettingsPage({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const user = await requireAdminAppUser()

  const ability = createMongoAbility(user.abilityRules ?? [])
  if (!hasFullAccess(ability) && !ability.can('read', 'Loyalty')) {
    redirect(`/${locale}`)
  }

  return <LoyaltySettingsView />
}
