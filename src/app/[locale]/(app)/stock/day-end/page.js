import { Suspense } from 'react'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { StockDayEndListView } from '../stock-day-end-list-view'
import { AppLoader } from '@/components/app-loader'
import { requireAdminAppUser } from '@/lib/auth/require-admin-app-user'
import {
  buildPaginationMeta,
  parseListPagination,
} from '@/lib/list-views/parse-list-pagination'
import { listDayEndReports, mapDayEndReportToJson } from '@/lib/stock/day-end-report'
import { prisma } from '@/lib/prisma'

export async function generateMetadata({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('Stock')
  return { title: t('dayEndMetaTitle') }
}

export default async function StockDayEndPage({ params, searchParams }) {
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

  const fromRaw = (urlParams.get('from') ?? '').trim()
  const toRaw = (urlParams.get('to') ?? '').trim()
  const from = fromRaw ? new Date(`${fromRaw}T00:00:00.000Z`) : null
  const to = toRaw ? new Date(`${toRaw}T00:00:00.000Z`) : null

  const { page, limit, skip } = parseListPagination(urlParams, {
    defaultLimit: 10,
  })

  const { total, reports } = await listDayEndReports(
    prisma,
    user.businessProfileId,
    { skip, take: limit, from, to },
  )

  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-hisabi-xxl">
          <AppLoader />
        </div>
      }
    >
      <StockDayEndListView
        reports={reports.map(mapDayEndReportToJson)}
        pagination={buildPaginationMeta(page, limit, total)}
        filters={{ from: fromRaw, to: toRaw }}
      />
    </Suspense>
  )
}
