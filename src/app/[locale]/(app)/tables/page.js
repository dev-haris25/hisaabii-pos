import { Suspense } from 'react'
import { createMongoAbility } from '@casl/ability'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { redirect } from 'next/navigation'

import { TablesListView } from './tables-list-view'
import { AppLoader } from '@/components/app-loader'
import { requireAdminAppUser } from '@/lib/auth/require-admin-app-user'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { mapTableToJson } from '@/lib/e-waiter/map-table-json'
import {
  eWaiterOrderAbsoluteUrl,
} from '@/lib/e-waiter/table-order-url'
import {
  buildPaginationMeta,
  parseListPagination,
} from '@/lib/list-views/parse-list-pagination'
import { prisma } from '@/lib/prisma'
import { hasFullAccess } from '@/lib/rbac/ability-utils'

export async function generateMetadata({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('Tables')
  return { title: t('metaTitle') }
}

export default async function TablesPage({ params, searchParams }) {
  const { locale } = await params
  setRequestLocale(locale)
  const user = await requireAdminAppUser()

  const ability = createMongoAbility(user.abilityRules ?? [])
  if (!hasFullAccess(ability) && !ability.can('read', 'ETable')) {
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
  const statusRaw = (urlParams.get('status') ?? '').trim()
  const statusFilter =
    statusRaw === 'available' || statusRaw === 'occupied' ? statusRaw : ''

  /** @type {Record<string, unknown>} */
  const where = {
    businessProfileId: user.businessProfileId,
    ...WHERE_NOT_DELETED,
  }
  if (statusFilter) where.status = statusFilter
  if (search) {
    where.name = { contains: search, mode: 'insensitive' }
  }

  const { page, limit, skip } = parseListPagination(urlParams, {
    defaultLimit: 10,
  })

  const [total, rows, profile] = await Promise.all([
    prisma.table.count({ where }),
    prisma.table.findMany({
      where,
      orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
      skip,
      take: limit,
    }),
    prisma.businessProfile.findUnique({
      where: { id: user.businessProfileId ?? '' },
      select: { slug: true },
    }),
  ])

  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.trim()?.replace(/\/$/, '') || ''

  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-hisabi-xxl">
          <AppLoader />
        </div>
      }
    >
      <TablesListView
        tables={rows.map((row) =>
          mapTableToJson(row, {
            orderUrl:
              origin && profile?.slug
                ? eWaiterOrderAbsoluteUrl(
                    origin,
                    locale,
                    profile.slug,
                    row.qrToken,
                  )
                : null,
          }),
        )}
        pagination={buildPaginationMeta(page, limit, total)}
        filters={{ search, status: statusFilter || 'all' }}
      />
    </Suspense>
  )
}
