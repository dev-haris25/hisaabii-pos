import { getTranslations, setRequestLocale } from 'next-intl/server'

import { StockItemFormView } from '../../../stock-item-form-view'
import { requireAdminAppUser } from '@/lib/auth/require-admin-app-user'

export async function generateMetadata({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('Stock')
  return { title: t('metaEditTitle') }
}

export default async function EditStockItemPage({ params }) {
  const { locale, id } = await params
  setRequestLocale(locale)
  await requireAdminAppUser()

  return <StockItemFormView mode="edit" itemId={id} />
}
