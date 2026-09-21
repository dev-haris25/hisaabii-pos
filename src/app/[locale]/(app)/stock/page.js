import { Suspense } from 'react'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { StockItemsListView } from './stock-items-list-view'
import { AppLoader } from '@/components/app-loader'
import { requireAdminAppUser } from '@/lib/auth/require-admin-app-user'
import {
  buildPaginationMeta,
  parseListPagination,
} from '@/lib/list-views/parse-list-pagination'
import { mapStockItemToJson } from '@/lib/stock/map-stock-json'
import { prisma } from '@/lib/prisma'

export async function generateMetadata({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('Stock')
  return { title: t('metaTitle') }
}

export default async function StockItemsPage({ params, searchParams }) {
  const { locale } = await params
  setRequestLocale(locale)
  const user = await requireAdminAppUser()

  const sp = searchParams instanceof Promise ? await searchParams : searchParams
  const urlParams = new URLSearchParams()
  for (const [k, v] of Object.entries(sp ?? {})) {
    if (typeof v === 'string') urlParams.set(k, v)
  }
  if (!urlParams.has('page')) urlParams.set('page', '1')
  if (!urlParams.has('limit')) urlParams.set('limit', '10')

  const search = (urlParams.get('search') ?? '').trim()

  // Soft-deleted items (active: false) never appear in the stock list.
  /** @type {Record<string, unknown>} */
  const where = { businessProfileId: user.businessProfileId, active: true }
  if (search) {
    where.OR = [
      { nameAr: { contains: search, mode: 'insensitive' } },
      { nameEn: { contains: search, mode: 'insensitive' } },
    ]
  }

  const { page, limit, skip } = parseListPagination(urlParams, {
    defaultLimit: 10,
  })

  const [total, rows] = await Promise.all([
    prisma.stockItem.count({ where }),
    prisma.stockItem.findMany({
      where,
      orderBy: [{ nameAr: 'asc' }, { createdAt: 'asc' }],
      skip,
      take: limit,
    }),
  ])

  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-hisabi-xxl">
          <AppLoader />
        </div>
      }
    >
      <StockItemsListView
        items={rows.map((row) => mapStockItemToJson(row))}
        pagination={buildPaginationMeta(page, limit, total)}
        filters={{
          search,
        }}
      />
    </Suspense>
  )
}
