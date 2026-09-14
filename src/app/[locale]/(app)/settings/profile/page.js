import { getTranslations, setRequestLocale } from 'next-intl/server'

import { SettingsProfilePageClient } from './settings-profile-page-client'
import { requireAdminAppUser } from '@/lib/auth/require-admin-app-user'

export async function generateMetadata({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('Settings')
  return { title: t('metaProfile') }
}

export default async function SettingsProfilePage({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  await requireAdminAppUser()
  return <SettingsProfilePageClient />
}
