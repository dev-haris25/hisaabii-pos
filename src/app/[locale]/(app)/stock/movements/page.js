import { Suspense } from 'react'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { StockMovementsListView } from '../stock-movements-list-view'
import { AppLoader } from '@/components/app-loader'
import { requireAdminAppUser } from '@/lib/auth/require-admin-app-user'
import {
  buildPaginationMeta,
  parseListPagination,
} from '@/lib/list-views/parse-list-pagination'
import { mapStockMovementToJson } from '@/lib/stock/map-stock-json'
import { prisma } from '@/lib/prisma'

const movementInclude = {
  createdBy: { select: { id: true, name: true } },
  stockItem: { select: { id: true, nameAr: true, nameEn: true } },
}

export async function generateMetadata({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('Stock')
  return { title: t('metaMovementsTitle') }
}

export default async function StockMovementsPage({ params, searchParams }) {
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

  const typeRaw = (urlParams.get('type') ?? 'all').trim()
  const typeFilter =
    typeRaw === 'purchase' ||
    typeRaw === 'adjust_in' ||
    typeRaw === 'adjust_out' ||
    typeRaw === 'opening' ||
    typeRaw === 'recipe_deduct' ||
    typeRaw === 'allotment_issue' ||
    typeRaw === 'allotment_return' ||
    typeRaw === 'kitchen_stock_issue'
      ? typeRaw
      : 'all'

  /** @type {Record<string, unknown>} */
  const where = { businessProfileId: user.businessProfileId }
  if (typeFilter !== 'all') where.type = typeFilter

  const { page, limit, skip } = parseListPagination(urlParams, {
    defaultLimit: 10,
  })

  const [total, rows] = await Promise.all([
    prisma.stockMovement.count({ where }),
    prisma.stockMovement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: movementInclude,
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
      <StockMovementsListView
        movements={rows.map(mapStockMovementToJson)}
        pagination={buildPaginationMeta(page, limit, total)}
        filters={{ type: typeFilter }}
      />
    </Suspense>
  )
}
