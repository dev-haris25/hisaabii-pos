import { getTranslations, setRequestLocale } from 'next-intl/server'

import { requireAdminAppUser } from '@/lib/auth/require-admin-app-user'

import { EmployeeDetailPageClient } from './employee-detail-page-client'

export async function generateMetadata({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('HR')
  return { title: t('metaEmployeeDetail') }
}

export default async function Page({ params }) {
  const { id } = await params
  const user = await requireAdminAppUser()
  return (
    <EmployeeDetailPageClient
      employeeId={id}
      hasBusinessProfile={user?.hasBusinessProfile === true}
    />
  )
}
