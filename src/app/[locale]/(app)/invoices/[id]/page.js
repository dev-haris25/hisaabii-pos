import { Suspense } from 'react'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'

import { InvoiceDetailView } from './invoice-detail-view'
import { AppLoader } from '@/components/app-loader'
import { isWithinCashierDocumentWindow } from '@/lib/auth/cashier-document-window'
import { requireInvoiceAppUser } from '@/lib/auth/require-invoice-app-user'
import { sessionNeedsCashierDocumentWindow } from '@/lib/auth/require-invoice-restaurant'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { mapInvoiceDetailToJson } from '@/lib/invoices/map-invoice-json'
import { primaryKitchenOrderInclude } from '@/lib/orders/primary-kitchen-order'
import { restaurantLogoPreviewUrl } from '@/lib/print/load-receipt-logo'
import { prisma } from '@/lib/prisma'

export async function generateMetadata({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('Invoices')
  return { title: t('detailMetaTitle') }
}

export default async function InvoiceDetailPage({ params }) {
  const { locale, id } = await params
  setRequestLocale(locale)
  const user = await requireInvoiceAppUser()

  const [invoice, profile] = await Promise.all([
    prisma.invoice.findFirst({
      where: {
        id,
        businessProfileId: user.businessProfileId,
        ...WHERE_NOT_DELETED,
      },
      include: {
        lines: { orderBy: { sortOrder: 'asc' } },
        createdByStaff: { select: { id: true, name: true } },
        kitchenOrders: primaryKitchenOrderInclude(),
        creditNotes: {
          where: WHERE_NOT_DELETED,
          include: {
            lines: { orderBy: { sortOrder: 'asc' } },
            createdByStaff: { select: { id: true, name: true } },
          },
          orderBy: { noteDate: 'asc' },
        },
        debitNotes: {
          where: WHERE_NOT_DELETED,
          include: {
            lines: { orderBy: { sortOrder: 'asc' } },
            createdByStaff: { select: { id: true, name: true } },
          },
          orderBy: { noteDate: 'asc' },
        },
      },
    }),
    prisma.businessProfile.findUnique({
      where: { id: user.businessProfileId },
      select: { id: true, logoStoragePath: true, updatedAt: true },
    }),
  ])
  if (!invoice) notFound()
  if (
    sessionNeedsCashierDocumentWindow(user) &&
    !isWithinCashierDocumentWindow(invoice.invoiceDate)
  ) {
    notFound()
  }

  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-hisabi-xxl">
          <AppLoader />
        </div>
      }
    >
      <InvoiceDetailView
        invoice={mapInvoiceDetailToJson(invoice)}
        logoUrl={restaurantLogoPreviewUrl(profile)}
      />
    </Suspense>
  )
}
