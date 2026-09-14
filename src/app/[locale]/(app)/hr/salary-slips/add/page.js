import { getTranslations, setRequestLocale } from 'next-intl/server'

import { requireAdminAppUser } from '@/lib/auth/require-admin-app-user'

import { AddSalarySlipPageClient } from './add-salary-slip-page-client'

export async function generateMetadata({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('HR')
  return { title: t('metaSalarySlipsAdd') }
}

export default async function Page({ params }) {
  await params
  const user = await requireAdminAppUser()
  return <AddSalarySlipPageClient hasBusinessProfile={user?.hasBusinessProfile === true} />
}
