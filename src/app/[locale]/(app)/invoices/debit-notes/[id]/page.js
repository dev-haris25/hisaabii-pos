import { Suspense } from 'react'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'

import { DebitNoteDetailView } from './debit-note-detail-view'
import { AppLoader } from '@/components/app-loader'
import { isWithinCashierDocumentWindow } from '@/lib/auth/cashier-document-window'
import { requireInvoiceAppUser } from '@/lib/auth/require-invoice-app-user'
import { sessionNeedsCashierDocumentWindow } from '@/lib/auth/require-invoice-restaurant'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { mapDebitNoteDetailToJson } from '@/lib/notes/map-note-json'
import { restaurantLogoPreviewUrl } from '@/lib/print/load-receipt-logo'
import { prisma } from '@/lib/prisma'

export async function generateMetadata({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('DebitNotes')
  return { title: t('detailMetaTitle') }
}

export default async function DebitNoteDetailPage({ params }) {
  const { locale, id } = await params
  setRequestLocale(locale)
  const user = await requireInvoiceAppUser()

  const [note, profile] = await Promise.all([
    prisma.debitNote.findFirst({
      where: {
        id,
        businessProfileId: user.businessProfileId,
        ...WHERE_NOT_DELETED,
      },
      include: {
        lines: { orderBy: { sortOrder: 'asc' } },
        createdByStaff: { select: { id: true, name: true } },
      },
    }),
    prisma.businessProfile.findUnique({
      where: { id: user.businessProfileId },
      select: { id: true, logoStoragePath: true, updatedAt: true },
    }),
  ])
  if (!note) notFound()
  if (
    sessionNeedsCashierDocumentWindow(user) &&
    !isWithinCashierDocumentWindow(note.noteDate)
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
      <DebitNoteDetailView
        note={mapDebitNoteDetailToJson(note)}
        logoUrl={restaurantLogoPreviewUrl(profile)}
      />
    </Suspense>
  )
}
