import { Suspense } from 'react'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { redirect } from 'next/navigation'

import { BusinessProfileView } from '@/app/[locale]/business-profile/business-profile-view'
import { AppLoader } from '@/components/app-loader'
import { PageBackButton } from '@/components/shared/page-back-button'
import { requireRestaurantOwnerAppUser } from '@/lib/auth/require-admin-app-user'

export async function generateMetadata({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('Restaurants')
  return { title: t('createMetaTitle') }
}

/**
 * Add restaurant inside app shell (Hisabi /organization/create pattern).
 */
export default async function CreateRestaurantPage({ params }) {
  const { locale } = await params
  setRequestLocale(locale)

  const user = await requireRestaurantOwnerAppUser()
  if (!user.hasBusinessProfile) {
    redirect('/business-profile')
  }

  const t = await getTranslations('Restaurants')

  return (
    <div className="mx-auto w-full max-w-hisabi-container">
      <PageBackButton href="/restaurants" label={t('backToList')} />
      <Suspense
        fallback={
          <div className="flex justify-center py-hisabi-xxl">
            <AppLoader />
          </div>
        }
      >
        <BusinessProfileView mode="create" embedded />
      </Suspense>
    </div>
  )
}
