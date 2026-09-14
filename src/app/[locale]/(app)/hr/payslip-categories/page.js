import { getTranslations, setRequestLocale } from 'next-intl/server'

import { requireAdminAppUser } from '@/lib/auth/require-admin-app-user'

import { PayslipCategoriesListView } from './payslip-categories-list-view'

export async function generateMetadata({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('HR')
  return { title: t('metaPayslipCategories') }
}

export default async function Page({ params }) {
  await params
  const user = await requireAdminAppUser()
  return (
    <PayslipCategoriesListView hasBusinessProfile={user?.hasBusinessProfile === true} />
  )
}
