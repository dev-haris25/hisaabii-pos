import { getTranslations, setRequestLocale } from 'next-intl/server'

import { requireAdminAppUser } from '@/lib/auth/require-admin-app-user'

import { EditEmployeePageClient } from './edit-employee-page-client'

export async function generateMetadata({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('HR')
  return { title: t('metaEmployeesEdit') }
}

export default async function Page({ params }) {
  const { id } = await params
  const user = await requireAdminAppUser()
  return (
    <EditEmployeePageClient
      employeeId={id}
      hasBusinessProfile={user?.hasBusinessProfile === true}
    />
  )
}
