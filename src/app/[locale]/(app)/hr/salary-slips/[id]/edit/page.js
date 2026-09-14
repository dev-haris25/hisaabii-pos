import { getTranslations, setRequestLocale } from 'next-intl/server'

import { requireAdminAppUser } from '@/lib/auth/require-admin-app-user'

import { EditSalarySlipPageClient } from './edit-salary-slip-page-client'

export async function generateMetadata({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('HR')
  return { title: t('metaSalarySlipsEdit') }
}

export default async function Page({ params }) {
  const { id } = await params
  const user = await requireAdminAppUser()
  return (
    <EditSalarySlipPageClient
      salarySlipId={id}
      hasBusinessProfile={user?.hasBusinessProfile === true}
    />
  )
}
