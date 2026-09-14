import { createMongoAbility } from '@casl/ability'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { redirect } from 'next/navigation'

import { SettingsDataPageClient } from './settings-data-page-client'
import { requireAdminAppUser } from '@/lib/auth/require-admin-app-user'
import { hasFullAccess } from '@/lib/rbac/ability-utils'

export async function generateMetadata({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('Settings')
  return { title: t('metaData') }
}

export default async function SettingsDataPage({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const user = await requireAdminAppUser()
  const ability = createMongoAbility(user.abilityRules ?? [])
  if (!hasFullAccess(ability) && !ability.can('read', 'BusinessSettings')) {
    redirect(`/${locale}/settings/profile`)
  }
  return <SettingsDataPageClient />
}
