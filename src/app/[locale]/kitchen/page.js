import { createMongoAbility } from '@casl/ability'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { KitchenBoardView } from '@/components/orders/kitchen-board-view'
import { requireKitchenQueuePageUser } from '@/lib/auth/require-kitchen-app-user'
import { prisma } from '@/lib/prisma'
import { hasFullAccess } from '@/lib/rbac/ability-utils'

export async function generateMetadata({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('KitchenQueue')
  return { title: t('kitchenMetaTitle') }
}

export default async function KitchenPage({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const user = await requireKitchenQueuePageUser('kitchen')
  const ability = createMongoAbility(user.abilityRules ?? [])

  let restaurantName = ''
  if (user.businessProfileId) {
    const profile = await prisma.businessProfile.findUnique({
      where: { id: user.businessProfileId },
      select: { companyNameAr: true, companyNameEn: true },
    })
    if (profile) {
      restaurantName =
        locale === 'ar'
          ? profile.companyNameAr
          : profile.companyNameEn?.trim() || profile.companyNameAr
    }
  }

  return (
    <KitchenBoardView
      staffName={user.name}
      restaurantName={restaurantName}
      showGoToDashboard={hasFullAccess(ability) || user.isRestaurantOwner === true}
    />
  )
}
