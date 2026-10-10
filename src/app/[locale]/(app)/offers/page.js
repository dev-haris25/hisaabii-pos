import { Suspense } from 'react'
import { createMongoAbility } from '@casl/ability'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { redirect } from 'next/navigation'

import { OffersListView } from './offers-list-view'
import { AppLoader } from '@/components/app-loader'
import { requireAdminAppUser } from '@/lib/auth/require-admin-app-user'
import {
  buildPaginationMeta,
  parseListPagination,
} from '@/lib/list-views/parse-list-pagination'
import {
  OFFER_KIND_FILTERS,
  OFFER_STATUS_FILTERS,
  queryOffersList,
} from '@/lib/offers/query-offers'
import { hasFullAccess } from '@/lib/rbac/ability-utils'

export async function generateMetadata({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('Offers')
  return { title: t('metaTitle') }
}

export default async function OffersPage({ params, searchParams }) {
  const { locale } = await params
  setRequestLocale(locale)
  const user = await requireAdminAppUser()

  const ability = createMongoAbility(user.abilityRules ?? [])
  if (!hasFullAccess(ability) && !ability.can('read', 'Offer')) {
    redirect(`/${locale}`)
  }

  const sp = searchParams instanceof Promise ? await searchParams : searchParams
  const urlParams = new URLSearchParams()
  for (const [k, v] of Object.entries(sp ?? {})) {
    if (typeof v === 'string') urlParams.set(k, v)
  }
  if (!urlParams.has('page')) urlParams.set('page', '1')
  if (!urlParams.has('limit')) urlParams.set('limit', '10')

  const search = (urlParams.get('search') ?? '').trim()
  const kindRaw = (urlParams.get('kind') ?? '').trim()
  const kind = OFFER_KIND_FILTERS.includes(kindRaw) ? kindRaw : ''
  const statusRaw = (urlParams.get('status') ?? '').trim()
  const status = OFFER_STATUS_FILTERS.includes(statusRaw) ? statusRaw : ''

  const { page, limit } = parseListPagination(urlParams, { defaultLimit: 10 })

  const { total, offers } = await queryOffersList({
    businessProfileId: user.businessProfileId,
    search,
    kind,
    status,
    page,
    limit,
  })

  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-hisabi-xxl">
          <AppLoader />
        </div>
      }
    >
      <OffersListView
        offers={offers}
        pagination={buildPaginationMeta(page, limit, total)}
        filters={{ search, kind, status }}
      />
    </Suspense>
  )
}
