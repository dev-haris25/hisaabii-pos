import { getTranslations, setRequestLocale } from 'next-intl/server'

import { requireAdminAppUser } from '@/lib/auth/require-admin-app-user'

import { SalarySlipsListView } from './salary-slips-list-view'

export async function generateMetadata({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('HR')
  return { title: t('metaSalarySlips') }
}

export default async function Page({ params }) {
  await params
  const user = await requireAdminAppUser()
  return <SalarySlipsListView hasBusinessProfile={user?.hasBusinessProfile === true} />
}
