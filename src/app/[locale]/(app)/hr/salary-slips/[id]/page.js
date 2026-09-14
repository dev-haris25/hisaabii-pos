import { getTranslations, setRequestLocale } from 'next-intl/server'
import { redirect } from 'next/navigation'

import { requireAdminAppUser } from '@/lib/auth/require-admin-app-user'

import { SalarySlipDetailPageClient } from './salary-slip-detail-page-client'

export async function generateMetadata({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('HR')
  return { title: t('metaSalarySlipView') }
}

export default async function Page({ params }) {
  const { locale, id } = await params
  setRequestLocale(locale)

  const user = await requireAdminAppUser()
  if (user?.hasBusinessProfile !== true) {
    redirect('/hr/salary-slips')
  }

  return <SalarySlipDetailPageClient salarySlipId={id} hasBusinessProfile />
}
