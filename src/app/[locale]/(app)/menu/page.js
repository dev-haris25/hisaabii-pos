import { Suspense } from 'react'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { MenuListView } from './menu-list-view'
import { AppLoader } from '@/components/app-loader'
import { requireAdminAppUser } from '@/lib/auth/require-admin-app-user'
import {
  buildPaginationMeta,
  parseListPagination,
} from '@/lib/list-views/parse-list-pagination'
import { mapMenuCategoryToJson, mapMenuItemToJson, menuItemInclude } from '@/lib/menu/map-menu-json'
import { prisma } from '@/lib/prisma'

export async function generateMetadata({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('Menu')
  return { title: t('metaTitle') }
}

export default async function MenuPage({ params, searchParams }) {
  const { locale } = await params
  setRequestLocale(locale)
  const user = await requireAdminAppUser()

  const sp = searchParams instanceof Promise ? await searchParams : searchParams
  const urlParams = new URLSearchParams()
  for (const [k, v] of Object.entries(sp ?? {})) {
    if (typeof v === 'string') urlParams.set(k, v)
  }
  // Always paginate list page
  if (!urlParams.has('page')) urlParams.set('page', '1')
  if (!urlParams.has('limit')) urlParams.set('limit', '10')

  const search = (urlParams.get('search') ?? '').trim()
  const activeRaw = urlParams.get('active') ?? 'all'
  const activeFilter =
    activeRaw === 'true' || activeRaw === 'false' ? activeRaw : 'all'
  const categoryId = (urlParams.get('categoryId') ?? '').trim()

  /** @type {Record<string, unknown>} */
  const where = { businessProfileId: user.businessProfileId }
  if (activeFilter === 'true') where.active = true
  if (activeFilter === 'false') where.active = false
  if (categoryId) where.categoryId = categoryId
  if (search) {
    where.OR = [
      { nameAr: { contains: search, mode: 'insensitive' } },
      { nameEn: { contains: search, mode: 'insensitive' } },
    ]
  }

  const { page, limit, skip } = parseListPagination(urlParams, {
    defaultLimit: 10,
  })

  const [total, rows, categoryRows] = await Promise.all([
    prisma.menuItem.count({ where }),
    prisma.menuItem.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
      skip,
      take: limit,
      include: menuItemInclude,
    }),
    prisma.menuCategory.findMany({
      where: { businessProfileId: user.businessProfileId, active: true },
      orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
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
      <MenuListView
        items={rows.map(mapMenuItemToJson)}
        categories={categoryRows.map(mapMenuCategoryToJson)}
        pagination={buildPaginationMeta(page, limit, total)}
        filters={{
          search,
          active: activeFilter,
          categoryId,
        }}
      />
    </Suspense>
  )
}
