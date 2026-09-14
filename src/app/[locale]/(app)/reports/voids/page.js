import { getTranslations, setRequestLocale } from 'next-intl/server'

import { getSessionUser } from '@/lib/auth/get-session-user'

import { ReportsModuleClient } from '../reports-module-client'

export async function generateMetadata({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('Reports')
  return { title: t('metaVoids') }
}

export default async function Page({ params }) {
  await params
  const user = await getSessionUser()
  return (
    <ReportsModuleClient
      hasBusinessProfile={user?.hasBusinessProfile === true}
      kind="voids"
    />
  )
}