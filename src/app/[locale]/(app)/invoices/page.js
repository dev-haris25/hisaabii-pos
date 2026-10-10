import { Suspense } from 'react'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { InvoicesListView } from './invoices-list-view'
import { AppLoader } from '@/components/app-loader'
import { cashierDocumentWindowStart } from '@/lib/auth/cashier-document-window'
import { requireInvoiceAppUser } from '@/lib/auth/require-invoice-app-user'
import { sessionNeedsCashierDocumentWindow } from '@/lib/auth/require-invoice-restaurant'
import { mapInvoiceListItemToJson } from '@/lib/invoices/map-invoice-json'
import {
  buildPaginationMeta,
  parseListPagination,
} from '@/lib/list-views/parse-list-pagination'
import { primaryKitchenOrderInclude } from '@/lib/orders/primary-kitchen-order'
import { restaurantLogoPreviewUrl } from '@/lib/print/load-receipt-logo'
import { prisma } from '@/lib/prisma'

export async function generateMetadata({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('Invoices')
  return { title: t('metaTitle') }
}

export default async function InvoicesPage({ params, searchParams }) {
  const { locale } = await params
  setRequestLocale(locale)
  const user = await requireInvoiceAppUser()
  const isCashier = sessionNeedsCashierDocumentWindow(user)

  const sp = searchParams instanceof Promise ? await searchParams : searchParams
  const urlParams = new URLSearchParams()
  for (const [k, v] of Object.entries(sp ?? {})) {
    if (typeof v === 'string') urlParams.set(k, v)
  }
  if (!urlParams.has('page')) urlParams.set('page', '1')
  if (!urlParams.has('limit')) urlParams.set('limit', '10')

  const search = (urlParams.get('search') ?? '').trim()
  const zatcaRaw = (urlParams.get('zatca') ?? 'all').trim()
  const zatcaFilter = ['pending', 'reported', 'failed', 'cleared'].includes(
    zatcaRaw,
  )
    ? zatcaRaw
    : 'all'
  const paymentRaw = (urlParams.get('payment') ?? 'all').trim()
  const paymentFilter =
    paymentRaw === 'cash' || paymentRaw === 'card' ? paymentRaw : 'all'

  /** @type {Record<string, unknown>} */
  const where = {
    businessProfileId: user.businessProfileId,
    deletedAt: null,
  }
  if (isCashier) {
    where.invoiceDate = { gte: cashierDocumentWindowStart() }
  }
  if (paymentFilter !== 'all') where.paymentMethod = paymentFilter
  if (zatcaFilter === 'pending') {
    where.OR = [{ zatcaStatus: 'pending' }, { zatcaStatus: null }]
  } else if (zatcaFilter !== 'all') {
    where.zatcaStatus = zatcaFilter
  }
  if (search) {
    const orderNum = Number.parseInt(
      search.replace(/^(#|ord-)/i, ''),
      10,
    )
    where.AND = [
      {
        OR: [
          { invoiceNumber: { contains: search, mode: 'insensitive' } },
          {
            createdByStaff: {
              name: { contains: search, mode: 'insensitive' },
            },
          },
            ...(Number.isFinite(orderNum)
            ? [{ kitchenOrders: { some: { orderNumber: orderNum } } }]
            : []),
        ],
      },
    ]
  }

  const { page, limit, skip } = parseListPagination(urlParams, {
    defaultLimit: 10,
  })

  const [total, rows, profile, loyaltySettings] = await Promise.all([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where,
      orderBy: [{ invoiceDate: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: limit,
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        invoiceDate: true,
        paymentMethod: true,
        grandTotal: true,
        totalVat: true,
        subtotal: true,
        zatcaStatus: true,
        zatcaLastError: true,
        qrCode: true,
        cryptographicStamp: true,
        loyaltyPointsAwarded: true,
        createdByStaff: { select: { id: true, name: true } },
        kitchenOrders: primaryKitchenOrderInclude(),
        creditNotes: {
          where: { deletedAt: null },
          orderBy: { noteDate: 'asc' },
          select: { id: true, creditNoteNumber: true },
        },
        debitNotes: {
          where: { deletedAt: null },
          orderBy: { noteDate: 'asc' },
          select: { id: true, debitNoteNumber: true },
        },
      },
    }),
    prisma.businessProfile.findUnique({
      where: { id: user.businessProfileId },
      select: { id: true, logoStoragePath: true, updatedAt: true },
    }),
    prisma.loyaltySettings.findUnique({
      where: { businessProfileId: user.businessProfileId },
      select: { enabled: true },
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
      <InvoicesListView
        invoices={rows.map(mapInvoiceListItemToJson)}
        pagination={buildPaginationMeta(page, limit, total)}
        filters={{
          search,
          zatca: zatcaFilter,
          payment: paymentFilter,
        }}
        logoUrl={restaurantLogoPreviewUrl(profile)}
        cashierWindowOnly={isCashier}
        loyaltyEnabled={loyaltySettings?.enabled === true}
      />
    </Suspense>
  )
}
