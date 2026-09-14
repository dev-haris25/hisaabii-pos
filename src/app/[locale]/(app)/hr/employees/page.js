import { getTranslations, setRequestLocale } from 'next-intl/server'

import { requireAdminAppUser } from '@/lib/auth/require-admin-app-user'

import { EmployeesListView } from './employees-list-view'

export async function generateMetadata({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('HR')
  return { title: t('metaEmployees') }
}

export default async function Page({ params }) {
  await params
  const user = await requireAdminAppUser()
  return <EmployeesListView hasBusinessProfile={user?.hasBusinessProfile === true} />
}
