import { Suspense } from 'react'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'

import { AppLoader } from '@/components/app-loader'
import { NoteEditView } from '@/components/notes/note-edit-view'
import { isWithinCashierDocumentWindow } from '@/lib/auth/cashier-document-window'
import { requireInvoiceAppUser } from '@/lib/auth/require-invoice-app-user'
import { sessionNeedsCashierDocumentWindow } from '@/lib/auth/require-invoice-restaurant'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { canRepairFailedNote } from '@/lib/notes/can-repair-failed-note'
import { mapCreditNoteDetailToJson } from '@/lib/notes/map-note-json'
import { prisma } from '@/lib/prisma'

export async function generateMetadata({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('CreditNotes')
  return { title: t('editMetaTitle') }
}

export default async function CreditNoteEditPage({ params }) {
  const { locale, id } = await params
  setRequestLocale(locale)
  const user = await requireInvoiceAppUser()

  const note = await prisma.creditNote.findFirst({
    where: {
      id,
      businessProfileId: user.businessProfileId,
      ...WHERE_NOT_DELETED,
    },
    include: {
      lines: { orderBy: { sortOrder: 'asc' } },
      createdByStaff: { select: { id: true, name: true } },
    },
  })
  if (!note || !canRepairFailedNote(note)) notFound()
  if (
    sessionNeedsCashierDocumentWindow(user) &&
    !isWithinCashierDocumentWindow(note.noteDate)
  ) {
    notFound()
  }

  const noteJson = mapCreditNoteDetailToJson(note)
  const cartSeed = note.lines.map((line) => ({
    key: line.id,
    nameAr: line.nameAr,
    nameEn: line.nameEn,
    quantity: line.quantity,
    unitPrice: String(line.unitPrice),
    vatPreset: line.vatPreset,
    imageUrl: null,
  }))

  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-hisabi-xxl">
          <AppLoader />
        </div>
      }
    >
      <NoteEditView
        documentNature="credit"
        note={noteJson}
        cartSeed={cartSeed}
        // Credit-note lines are linked to invoice lines: reason-only repair.
        linesLocked
        categories={[]}
        menuItems={[]}
      />
    </Suspense>
  )
}
