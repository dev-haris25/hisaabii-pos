import { getTranslations, setRequestLocale } from 'next-intl/server'

import { MenuCategoriesView } from './menu-categories-view'
import { requireAdminAppUser } from '@/lib/auth/require-admin-app-user'

export async function generateMetadata({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('Menu')
  return { title: t('categoriesMetaTitle') }
}

export default async function MenuCategoriesPage({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  await requireAdminAppUser()

  return <MenuCategoriesView />
}
