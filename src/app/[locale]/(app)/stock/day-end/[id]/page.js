import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { StockDayEndDetailView } from '../../stock-day-end-detail-view'
import { AppLoader } from '@/components/app-loader'
import { requireAdminAppUser } from '@/lib/auth/require-admin-app-user'
import {
  ensureDayEndDraft,
  mapDayEndReportToJson,
} from '@/lib/stock/day-end-report'
import { prisma } from '@/lib/prisma'

export async function generateMetadata({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('Stock')
  return { title: t('dayEndMetaTitle') }
}

export default async function StockDayEndDetailPage({ params }) {
  const { locale, id } = await params
  setRequestLocale(locale)
  const user = await requireAdminAppUser()

  let report = await prisma.stockDayEndReport.findFirst({
    where: { id, businessProfileId: user.businessProfileId },
    include: { lines: { orderBy: { nameAr: 'asc' } } },
  })
  if (!report) notFound()

  if (report.status === 'draft') {
    report = await ensureDayEndDraft(prisma, {
      businessProfileId: user.businessProfileId,
      reportDate: report.reportDate,
      userId: user.id,
    })
  }

  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-hisabi-xxl">
          <AppLoader />
        </div>
      }
    >
      <StockDayEndDetailView report={mapDayEndReportToJson(report)} />
    </Suspense>
  )
}
