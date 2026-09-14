import { Suspense } from 'react'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { RestaurantsListView } from './restaurants-list-view'
import { AppLoader } from '@/components/app-loader'
import { requireRestaurantOwnerAppUser } from '@/lib/auth/require-admin-app-user'

export async function generateMetadata({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('Restaurants')
  return { title: t('metaTitle') }
}

export default async function RestaurantsPage({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  await requireRestaurantOwnerAppUser()

  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-hisabi-xxl">
          <AppLoader />
        </div>
      }
    >
      <RestaurantsListView />
    </Suspense>
  )
}
