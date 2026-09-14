import { getTranslations, setRequestLocale } from 'next-intl/server'

import { PosCheckoutView } from './pos-checkout-view'
import { isCashierOnlyUser } from '@/lib/auth/post-auth-landing-path'
import { requirePosAppUser } from '@/lib/auth/require-pos-app-user'
import { restaurantLogoPreviewUrl } from '@/lib/print/load-receipt-logo'
import { prisma } from '@/lib/prisma'

export async function generateMetadata({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('Pos')
  return { title: t('metaTitle') }
}

export default async function PosPage({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const user = await requirePosAppUser()
  const returnToInvoices = isCashierOnlyUser(user)

  let restaurantName = ''
  let restaurantLogoUrl = /** @type {string | null} */ (null)
  if (user.businessProfileId) {
    const profile = await prisma.businessProfile.findUnique({
      where: { id: user.businessProfileId },
      select: {
        id: true,
        companyNameAr: true,
        companyNameEn: true,
        logoStoragePath: true,
        updatedAt: true,
      },
    })
    if (profile) {
      restaurantName =
        locale === 'ar'
          ? profile.companyNameAr
          : profile.companyNameEn?.trim() || profile.companyNameAr
      restaurantLogoUrl = restaurantLogoPreviewUrl(profile)
    }
  }

  return (
    <PosCheckoutView
      staffName={user.name}
      restaurantName={restaurantName}
      restaurantLogoUrl={restaurantLogoUrl}
      returnToInvoices={returnToInvoices}
    />
  )
}
