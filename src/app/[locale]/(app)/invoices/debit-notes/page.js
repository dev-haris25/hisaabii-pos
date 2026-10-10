import { Suspense } from 'react'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { DebitNotesListView } from './debit-notes-list-view'
import { AppLoader } from '@/components/app-loader'
import { cashierDocumentWindowStart } from '@/lib/auth/cashier-document-window'
import { requireInvoiceAppUser } from '@/lib/auth/require-invoice-app-user'
import { sessionNeedsCashierDocumentWindow } from '@/lib/auth/require-invoice-restaurant'
import {
  buildPaginationMeta,
  parseListPagination,
} from '@/lib/list-views/parse-list-pagination'
import { mapDebitNoteListItemToJson } from '@/lib/notes/map-note-json'
import { prisma } from '@/lib/prisma'

export async function generateMetadata({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('DebitNotes')
  return { title: t('metaTitle') }
}

export default async function DebitNotesPage({ params, searchParams }) {
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

  /** @type {Record<string, unknown>} */
  const where = {
    businessProfileId: user.businessProfileId,
    deletedAt: null,
  }
  if (isCashier) {
    where.noteDate = { gte: cashierDocumentWindowStart() }
  }
  if (zatcaFilter === 'pending') {
    where.OR = [{ zatcaStatus: 'pending' }, { zatcaStatus: null }]
  } else if (zatcaFilter !== 'all') {
    where.zatcaStatus = zatcaFilter
  }
  if (search) {
    where.AND = [
      {
        OR: [
          { debitNoteNumber: { contains: search, mode: 'insensitive' } },
          { invoiceNumberSnapshot: { contains: search, mode: 'insensitive' } },
        ],
      },
    ]
  }

  const { page, limit, skip } = parseListPagination(urlParams, {
    defaultLimit: 10,
  })

  const [total, rows] = await Promise.all([
    prisma.debitNote.count({ where }),
    prisma.debitNote.findMany({
      where,
      orderBy: [{ noteDate: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: limit,
      select: {
        id: true,
        debitNoteNumber: true,
        noteDate: true,
        invoiceId: true,
        invoiceNumberSnapshot: true,
        reasonAr: true,
        reasonEn: true,
        grandTotal: true,
        totalVat: true,
        subtotal: true,
        zatcaStatus: true,
        zatcaLastError: true,
        qrCode: true,
        cryptographicStamp: true,
        createdByStaff: { select: { id: true, name: true } },
      },
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
      <DebitNotesListView
        notes={rows.map(mapDebitNoteListItemToJson)}
        pagination={buildPaginationMeta(page, limit, total)}
        filters={{ search, zatca: zatcaFilter }}
        cashierWindowOnly={isCashier}
      />
    </Suspense>
  )
}
