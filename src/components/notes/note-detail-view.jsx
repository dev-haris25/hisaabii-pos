'use client'

import { useMutation } from '@tanstack/react-query'
import { ExternalLink, Pencil, Printer, Send, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { toast } from 'sonner'

import { SoftDeleteConfirmModal } from '@/components/invoices/soft-delete-confirm-modal'
import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import { PosThermalReceiptPreview } from '@/components/invoices/pos-thermal-receipt-preview'
import { ZatcaStatusBadge } from '@/components/invoices/zatca-status-badge'
import { PageBackButton } from '@/components/shared/page-back-button'
import { Link, useRouter } from '@/i18n/navigation'
import { AuthApiError, authPost } from '@/lib/api/auth-client'
import { toastPrintResult } from '@/lib/print/toast-print-result'
import {
  canRepairFailedNote,
  canSoftDeleteNote,
} from '@/lib/notes/can-repair-failed-note'
import { canReportNoteToZatca } from '@/lib/notes/map-note-json'

/**
 * @param {{
 *   documentNature: 'credit' | 'debit'
 *   note: {
 *     id: string
 *     noteNumber: string
 *     invoiceNumber: string
 *     invoiceDate: string
 *     invoiceId: string | null
 *     referenceInvoiceNumber: string | null
 *     reasonAr: string
 *     reasonEn: string | null
 *     subtotal: string
 *     totalVat: string
 *     grandTotal: string
 *     sellerCompanyNameAr: string
 *     sellerCompanyNameEn: string | null
 *     sellerVatNumber: string
 *     sellerCrNumber: string
 *     sellerAddressAr: string
 *     sellerAddressEn: string | null
 *     qrCode: string | null
 *     zatcaStatus: string | null
 *     zatcaLastError: string | null
 *     staffName: string | null
 *     lines: Array<{
 *       id: string
 *       nameAr: string
 *       nameEn: string | null
 *       quantity: number
 *       unitPrice: string
 *       discount: string
 *       vatAmount: string
 *       lineTotal: string
 *     }>
 *   }
 *   logoUrl?: string | null
 * }} props
 */
export function NoteDetailView({ documentNature, note, logoUrl = null }) {
  const ns = documentNature === 'credit' ? 'CreditNotes' : 'DebitNotes'
  const t = useTranslations(ns)
  const tInv = useTranslations('Invoices')
  const tErr = useTranslations('AuthErrors')
  const router = useRouter()
  const [deleteOpen, setDeleteOpen] = useState(false)

  const apiSegment = documentNature === 'credit' ? 'credit-notes' : 'debit-notes'
  const listHref =
    documentNature === 'credit'
      ? '/invoices/credit-notes'
      : '/invoices/debit-notes'

  const documentLabel =
    documentNature === 'credit' ? tInv('noteTypeCredit') : tInv('noteTypeDebit')

  const zatcaLabels = {
    pending: tInv('zatcaPending'),
    reported: tInv('zatcaReported'),
    failed: tInv('zatcaFailed'),
    cleared: tInv('zatcaCleared'),
    unknown: tInv('zatcaUnknown'),
  }

  const canReport = canReportNoteToZatca(note.zatcaStatus)
  const canPrint = Boolean(note.qrCode?.trim())
  const canRepair = canRepairFailedNote(note)
  const canDelete = canSoftDeleteNote(note)

  const reportMutation = useMutation({
    mutationFn: () => authPost(`/${apiSegment}/${note.id}/send`),
    onSuccess: () => {
      toast.success(tInv('reportSuccess'))
      router.refresh()
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      toast.error(code ? tErr(code) : tErr('generic'))
    },
  })

  const printMutation = useMutation({
    mutationFn: () =>
      authPost('/pos/print', { noteId: note.id, noteType: documentNature }),
    onSuccess: (data) => {
      toastPrintResult(tInv, data)
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      toast.error(code ? tErr(code) : tErr('generic'))
    },
  })

  return (
    <div className="mx-auto max-w-hisabi-container">
      <PageBackButton href={listHref} label={t('backToList')} />

      <div className="mb-hisabi-xl flex flex-col gap-hisabi-md sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <h1 className="type-headline-xl text-hisabi-on-surface">
            {t('detailTitle', { number: note.noteNumber })}
          </h1>
          <div className="flex flex-wrap items-center gap-hisabi-sm">
            <ZatcaStatusBadge status={note.zatcaStatus} labels={zatcaLabels} />
          </div>
          {note.invoiceId ? (
            <Link
              href={`/invoices/${note.invoiceId}`}
              className="type-label-md text-hisabi-primary inline-flex items-center gap-1 font-semibold hover:underline"
            >
              {t('linkOriginalInvoice', {
                number: note.referenceInvoiceNumber ?? '',
              })}
              <ExternalLink className="size-4 shrink-0" aria-hidden />
            </Link>
          ) : null}
        </div>

        <div className="flex w-full flex-col gap-hisabi-sm sm:w-auto sm:min-w-[12rem]">
          {canRepair ? (
            <Link
              href={`${listHref}/${note.id}/edit`}
              className="type-label-md flex min-h-hisabi-btn w-full cursor-pointer items-center justify-center gap-hisabi-sm rounded-xl border border-hisabi-outline-variant/60 bg-white px-hisabi-lg py-hisabi-btn font-bold text-hisabi-on-surface transition-colors hover:bg-hisabi-surface-container"
            >
              <Pencil className="size-4 shrink-0" aria-hidden />
              {t('actionEdit')}
            </Link>
          ) : null}
          {canDelete ? (
            <AuthSubmitButton
              type="button"
              variant="destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="size-4" aria-hidden />
              {t('actionDelete')}
            </AuthSubmitButton>
          ) : null}
          {canReport ? (
            <AuthSubmitButton
              type="button"
              pending={reportMutation.isPending}
              onClick={() => reportMutation.mutate()}
            >
              <Send className="size-4" aria-hidden />
              {tInv('actionReport')}
            </AuthSubmitButton>
          ) : null}
          {canPrint ? (
            <AuthSubmitButton
              type="button"
              variant="secondary"
              pending={printMutation.isPending}
              onClick={() => printMutation.mutate()}
            >
              <Printer className="size-4" aria-hidden />
              {tInv('actionPrint')}
            </AuthSubmitButton>
          ) : !canRepair ? (
            <p className="type-body-sm text-hisabi-on-surface-variant">
              {tInv('printBlockedNoQr')}
            </p>
          ) : null}
        </div>
      </div>

      {note.zatcaStatus === 'failed' && note.zatcaLastError ? (
        <div
          role="alert"
          className="mb-hisabi-lg rounded-xl border border-hisabi-error/30 bg-hisabi-error/5 px-hisabi-lg py-hisabi-md"
        >
          <p className="type-label-md font-bold text-hisabi-error">
            {tInv('zatcaErrorTitle')}
          </p>
          <p className="type-body-sm text-hisabi-on-surface mt-1">
            {note.zatcaLastError}
          </p>
        </div>
      ) : null}

      <div className="mb-hisabi-xl overflow-hidden rounded-xl border border-hisabi-outline-variant/30 bg-slate-100/80 p-hisabi-lg shadow-sm sm:p-hisabi-xl">
        <p className="type-label-sm text-hisabi-on-surface-variant mb-hisabi-md text-center">
          {tInv('receiptPreviewHint')}
        </p>
        <PosThermalReceiptPreview
          invoice={note}
          logoUrl={logoUrl}
          documentLabel={documentLabel}
        />
      </div>

      <SoftDeleteConfirmModal
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        apiPath={`/${apiSegment}/${note.id}`}
        documentNumber={note.noteNumber}
        title={t('deleteConfirmTitle')}
        body={t('deleteConfirmBody', { number: note.noteNumber })}
        successMessage={t('deleteSuccess')}
        redirectTo={listHref}
      />
    </div>
  )
}
