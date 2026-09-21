import { getTranslations, setRequestLocale } from 'next-intl/server'

import { StockItemDetailView } from '../../stock-item-detail-view'
import { requireAdminAppUser } from '@/lib/auth/require-admin-app-user'

export async function generateMetadata({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('Stock')
  return { title: t('metaItemDetailTitle') }
}

export default async function StockItemDetailPage({ params }) {
  const { locale, id } = await params
  setRequestLocale(locale)
  await requireAdminAppUser()

  return <StockItemDetailView itemId={id} />
}
