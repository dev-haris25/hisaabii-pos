import { Suspense } from 'react'
import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'

import { EWaiterMenuView } from '@/components/e-waiter/e-waiter-menu-view'
import {
  mapPublicMenuCategoryToJson,
  mapPublicMenuItemToJson,
  publicBusinessLogoUrl,
  publicMenuItemInclude,
} from '@/lib/e-waiter/map-public-menu'
import {
  isWaiterCallActive,
  mapTableSessionFlagsJson,
} from '@/lib/e-waiter/map-table-session-flags'
import { isLoyaltyEnabledForProfile } from '@/lib/e-waiter/loyalty-enabled'
import { getPublicGeofenceConfig } from '@/lib/e-waiter/assert-within-geofence'
import { resolveEWaiterBrandColors } from '@/lib/e-waiter/resolve-brand-colors'
import { resolvePublicOrderTable } from '@/lib/e-waiter/resolve-public-order-table'
import { loadActiveOffers } from '@/lib/offers/load-active-offers'
import { mapOfferForClient } from '@/lib/offers/map-offer-json'
import { prisma } from '@/lib/prisma'

export async function generateMetadata({ params }) {
  const { locale, slug, qrToken } = await params
  setRequestLocale(locale)

  const resolved = await resolvePublicOrderTable(slug, qrToken)
  if (!resolved) {
    return { title: 'Menu', robots: { index: false, follow: false } }
  }

  const { profile } = resolved
  const name =
    locale === 'ar'
      ? profile.companyNameAr
      : profile.companyNameEn?.trim() || profile.companyNameAr

  return {
    title: name || 'Menu',
    robots: { index: false, follow: false },
  }
}

export default async function PublicEWaiterOrderPage({ params }) {
  const { locale, slug, qrToken } = await params
  setRequestLocale(locale)

  const resolved = await resolvePublicOrderTable(slug, qrToken)
  if (!resolved) notFound()

  const { profile, table } = resolved
  const slugKey = profile.slug

  const [categories, items, openSession, loyaltyEnabled, offers] = await Promise.all([
    prisma.menuCategory.findMany({
      where: { businessProfileId: profile.id, active: true },
      orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
      select: {
        id: true,
        nameAr: true,
        nameEn: true,
        sortOrder: true,
      },
    }),
    prisma.menuItem.findMany({
      where: { businessProfileId: profile.id, active: true },
      orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
      include: publicMenuItemInclude,
    }),
    prisma.tableSession.findFirst({
      where: { tableId: table.id, status: 'open' },
    }),
    isLoyaltyEnabledForProfile(profile.id),
    loadActiveOffers({ businessProfileId: profile.id }),
  ])

  let initialSession = null
  if (openSession) {
    const roundCount = await prisma.kitchenOrder.count({
      where: {
        tableSessionId: openSession.id,
        status: { not: 'cancelled' },
      },
    })
    initialSession = mapTableSessionFlagsJson(openSession, {
      tableName: table.name,
      roundCount,
    })
  }

  const brand = resolveEWaiterBrandColors(profile)
  const restaurantName =
    locale === 'ar'
      ? profile.companyNameAr
      : profile.companyNameEn?.trim() || profile.companyNameAr

  const hasLogo = Boolean(profile.logoStoragePath)
  const themeId = `ew-${profile.id.slice(-8)}`

  return (
    <>
      <style
        // White-label CSS variables (scoped) — not element inline styles.
        dangerouslySetInnerHTML={{
          __html: `.e-waiter-shell[data-ew="${themeId}"]{--e-waiter-primary:${brand.primary};--e-waiter-secondary:${brand.secondary};--e-waiter-accent:${brand.accent};--e-waiter-background:${brand.background};--e-waiter-text:${brand.text};}`,
        }}
      />
      <Suspense fallback={<div className="e-waiter-shell min-h-dvh" data-ew={themeId} />}>
        <EWaiterMenuView
          themeId={themeId}
          locale={locale === 'ar' ? 'ar' : 'en'}
          slug={slugKey}
          qrToken={String(qrToken)}
          restaurantName={restaurantName}
          logoUrl={
            hasLogo ? publicBusinessLogoUrl(slugKey, profile.updatedAt) : null
          }
          tableName={table.name}
          categories={categories.map(mapPublicMenuCategoryToJson)}
          items={items.map((row) => mapPublicMenuItemToJson(row, slugKey))}
          initialSession={initialSession}
          initialWaiterCallActive={isWaiterCallActive(table)}
          loyaltyEnabled={loyaltyEnabled}
          offers={offers.map((o) =>
            mapOfferForClient(o, { audience: 'public', slug: slugKey }),
          )}
          geofence={getPublicGeofenceConfig(profile)}
        />
      </Suspense>
    </>
  )
}
