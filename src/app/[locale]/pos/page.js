import { Suspense } from 'react'
import { createMongoAbility } from '@casl/ability'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { redirect } from 'next/navigation'

import { PosWorkspaceView } from './pos-workspace-view'
import { AbilityProvider } from '@/components/rbac/ability-provider'
import { isCashierOnlyUser } from '@/lib/auth/post-auth-landing-path'
import { requirePosAppUser } from '@/lib/auth/require-pos-app-user'
import { restaurantHasActiveTables } from '@/lib/e-waiter/restaurant-has-active-tables'
import { restaurantLogoPreviewUrl } from '@/lib/print/load-receipt-logo'
import { hasFullAccess } from '@/lib/rbac/ability-utils'
import { prisma } from '@/lib/prisma'

export async function generateMetadata({ params, searchParams }) {
  const { locale } = await params
  setRequestLocale(locale)
  const sp = await searchParams
  const tPos = await getTranslations('Pos')
  const tFloor = await getTranslations('TableSessions')
  if (sp?.tab === 'tables') {
    return { title: tFloor('metaTitle') }
  }
  return { title: tPos('metaTitle') }
}

export default async function PosPage({ params, searchParams }) {
  const { locale } = await params
  setRequestLocale(locale)
  const sp = await searchParams
  const user = await requirePosAppUser()
  const returnToInvoices = isCashierOnlyUser(user)
  const abilityRules = user.abilityRules ?? []
  const ability = createMongoAbility(abilityRules)
  const canReadTableSessions =
    hasFullAccess(ability) || ability.can('read', 'TableSession')
  const hasActiveTables = canReadTableSessions
    ? await restaurantHasActiveTables(user.businessProfileId)
    : false
  const canUseTablesTab = canReadTableSessions && hasActiveTables

  if (sp?.tab === 'tables' && !canUseTablesTab) {
    redirect(`/${locale}/pos`)
  }

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
    <AbilityProvider rules={abilityRules}>
      <Suspense
        fallback={
          <div className="bg-hisabi-background min-h-dvh" aria-hidden />
        }
      >
        <PosWorkspaceView
          staffName={user.name}
          restaurantName={restaurantName}
          restaurantLogoUrl={restaurantLogoUrl}
          returnToInvoices={returnToInvoices}
          canUseTablesTab={canUseTablesTab}
        />
      </Suspense>
    </AbilityProvider>
  )
}
