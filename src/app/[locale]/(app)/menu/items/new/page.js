import { getTranslations, setRequestLocale } from 'next-intl/server'

import { MenuItemFormView } from '../menu-item-form-view'
import { requireAdminAppUser } from '@/lib/auth/require-admin-app-user'

export async function generateMetadata({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('Menu')
  return { title: t('itemNewTitle') }
}

export default async function NewMenuItemPage({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  await requireAdminAppUser()

  return <MenuItemFormView mode="create" />
}
