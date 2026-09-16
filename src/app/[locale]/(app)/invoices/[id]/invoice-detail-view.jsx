'use client'

import { useMutation } from '@tanstack/react-query'
import { Ban, ExternalLink, Pencil, Printer, Send, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { toast } from 'sonner'

import { InvoiceCancelConfirmModal } from '@/components/invoices/invoice-cancel-confirm-modal'
import { SoftDeleteConfirmModal } from '@/components/invoices/soft-delete-confirm-modal'
import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import { PosThermalReceiptPreview } from '@/components/invoices/pos-thermal-receipt-preview'
import { ZatcaStatusBadge } from '@/components/invoices/zatca-status-badge'
import { PageBackButton } from '@/components/shared/page-back-button'
import { Link, useRouter } from '@/i18n/navigation'
import { AuthApiError, authPost } from '@/lib/api/auth-client'
import { printDocument } from '@/lib/print/print-document'
import { toastPrintResult } from '@/lib/print/toast-print-result'
import { canReportInvoiceToZatca } from '@/lib/invoices/map-invoice-json'
import { formatOrderNumber } from '@/lib/orders/riyadh-order-date'
import {
  canEditOrCancelInvoice,
  canRepairFailedInvoice,
  canSoftDeleteInvoice,
} from '@/lib/notes/can-edit-or-cancel-invoice'
import { canReportNoteToZatca } from '@/lib/notes/map-note-json'

/**
 * @param {{
 *   invoice: {
 *     id: string
 *     invoiceNumber: string
 *     orderNumber?: number | null
 *     status: string
 *     invoiceDate: string
 *     paymentMethod: string
 *     amountTendered: string | null
 *     changeGiven: string | null
 *     subtotal: string
 *     totalVat: string
 *     grandTotal: string
 *     notes: string | null
 *     sellerCompanyNameAr: string
 *     sellerCompanyNameEn: string | null
 *     sellerVatNumber: string
 *     sellerCrNumber: string
 *     sellerAddressAr: string
 *     sellerAddressEn: string | null
 *     qrCode: string | null
 *     zatcaStatus: string | null
 *     zatcaClearedAt: string | null
 *     zatcaLastError: string | null
 *     zatcaReportAttempts: number
 *     staffName: string | null
 *     linkedNotes?: Array<{
 *       id: string
 *       documentNature: 'credit' | 'debit'
 *       noteNumber: string
 *       invoiceNumber: string
 *       invoiceDate: string
 *       reasonAr: string
 *       reasonEn: string | null
 *       referenceInvoiceNumber: string | null
 *       subtotal: string
 *       totalVat: string
 *       grandTotal: string
 *       zatcaStatus: string | null
 *       hasQr: boolean
 *       qrCode: string | null
 *       paymentMethod: string
 *       sellerCompanyNameAr: string
 *       sellerCompanyNameEn: string | null
 *       sellerVatNumber: string
 *       sellerCrNumber: string
 *       staffName: string | null
 *       lines: Array<{
 *         id: string
 *         nameAr: string
 *         nameEn: string | null
 *         quantity: number
 *         unitPrice: string
 *         discount: string
 *         lineTotal: string
 *       }>
 *     }>
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
export function InvoiceDetailView({ invoice, logoUrl = null }) {
  const t = useTranslations('Invoices')
  const tErr = useTranslations('AuthErrors')
  const router = useRouter()
  const [cancelOpen, setCancelOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const zatcaLabels = {
    pending: t('zatcaPending'),
    reported: t('zatcaReported'),
    failed: t('zatcaFailed'),
    cleared: t('zatcaCleared'),
    unknown: t('zatcaUnknown'),
    voided: t('statusVoided'),
  }

  const canEdit = canEditOrCancelInvoice(invoice)
  const canRepair = canRepairFailedInvoice(invoice)
  const canDelete = canSoftDeleteInvoice(invoice)
  const isVoided = invoice.status === 'voided'
  const canReport =
    !isVoided && canReportInvoiceToZatca(invoice.zatcaStatus)
  const canPrint = !isVoided && Boolean(invoice.qrCode?.trim())
  const linkedNotes = invoice.linkedNotes ?? []

  const reportMutation = useMutation({
    mutationFn: () => authPost(`/invoices/${invoice.id}/send`),
    onSuccess: () => {
      toast.success(t('reportSuccess'))
      router.refresh()
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      toast.error(code ? tErr(code) : tErr('generic'))
    },
  })

  const printMutation = useMutation({
    mutationFn: () => printDocument({ invoiceId: invoice.id }),
    onSuccess: (data) => {
      toastPrintResult(t, data)
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      toast.error(code ? tErr(code) : tErr('generic'))
    },
  })

  return (
    <div className="mx-auto max-w-hisabi-container">
      <PageBackButton href="/invoices" label={t('backToList')} />

      <div className="mb-hisabi-xl flex flex-col gap-hisabi-md sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <h1 className="type-headline-xl text-hisabi-on-surface">
            {t('detailTitle', { number: invoice.invoiceNumber })}
          </h1>
          {invoice.orderNumber ? (
            <p className="type-label-md font-bold text-hisabi-teal" dir="ltr">
              {t('orderNumberLabel', {
                number: formatOrderNumber(invoice.orderNumber),
              })}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-hisabi-sm">
            <ZatcaStatusBadge
              status={invoice.zatcaStatus}
              invoiceStatus={invoice.status}
              labels={zatcaLabels}
            />
          </div>
        </div>

        <div className="flex w-full flex-col gap-hisabi-sm sm:w-auto sm:min-w-[12rem]">
          {canEdit || canRepair ? (
            <>
              <Link
                href={`/invoices/${invoice.id}/edit`}
                className="type-label-md flex min-h-hisabi-btn w-full cursor-pointer items-center justify-center gap-hisabi-sm rounded-xl border border-hisabi-outline-variant/60 bg-white px-hisabi-lg py-hisabi-btn font-bold text-hisabi-on-surface transition-colors hover:bg-hisabi-surface-container"
              >
                <Pencil className="size-4 shrink-0" aria-hidden />
                {t('actionEdit')}
              </Link>
              {canEdit ? (
                <AuthSubmitButton
                  type="button"
                  variant="destructive"
                  onClick={() => setCancelOpen(true)}
                >
                  <Ban className="size-4" aria-hidden />
                  {t('actionCancel')}
                </AuthSubmitButton>
              ) : null}
            </>
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
              {t('actionReport')}
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
              {t('actionPrint')}
            </AuthSubmitButton>
          ) : isVoided ? null : (
            <p className="type-body-sm text-hisabi-on-surface-variant">
              {t('printBlockedNoQr')}
            </p>
          )}
        </div>
      </div>

      {invoice.zatcaStatus === 'failed' && invoice.zatcaLastError ? (
        <div
          role="alert"
          className="mb-hisabi-lg rounded-xl border border-hisabi-error/30 bg-hisabi-error/5 px-hisabi-lg py-hisabi-md"
        >
          <p className="type-label-md font-bold text-hisabi-error">
            {t('zatcaErrorTitle')}
          </p>
          <p className="type-body-sm text-hisabi-on-surface mt-1">
            {invoice.zatcaLastError}
          </p>
        </div>
      ) : null}

      <div className="mb-hisabi-xl overflow-hidden rounded-xl border border-hisabi-outline-variant/30 bg-slate-100/80 p-hisabi-lg shadow-sm sm:p-hisabi-xl">
        <p className="type-label-sm text-hisabi-on-surface-variant mb-hisabi-md text-center">
          {t('receiptPreviewHint')}
        </p>
        <PosThermalReceiptPreview invoice={invoice} logoUrl={logoUrl} />
      </div>

      <section className="mb-hisabi-xl">
        <h2 className="type-headline-md text-hisabi-on-surface mb-hisabi-lg font-bold">
          {t('notesGridTitle')}
        </h2>
        {linkedNotes.length === 0 ? (
          <p className="type-body-md text-hisabi-on-surface-variant">
            {t('noNotes')}
          </p>
        ) : (
          <div className="grid gap-hisabi-lg sm:grid-cols-2">
            {linkedNotes.map((note) => (
              <LinkedNoteCard
                key={`${note.documentNature}-${note.id}`}
                note={note}
                logoUrl={logoUrl}
                documentLabel={
                  note.documentNature === 'credit'
                    ? t('noteTypeCredit')
                    : t('noteTypeDebit')
                }
              />
            ))}
          </div>
        )}
      </section>

      <InvoiceCancelConfirmModal
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        invoiceId={invoice.id}
        invoiceNumber={invoice.invoiceNumber}
      />
      <SoftDeleteConfirmModal
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        apiPath={`/invoices/${invoice.id}`}
        documentNumber={invoice.invoiceNumber}
        title={t('deleteConfirmTitle')}
        body={t('deleteConfirmBody', { number: invoice.invoiceNumber })}
        successMessage={t('deleteSuccess')}
        redirectTo="/invoices"
      />
    </div>
  )
}

/**
 * @param {{
 *   note: NonNullable<Parameters<typeof InvoiceDetailView>[0]['invoice']['linkedNotes']>[number]
 *   logoUrl: string | null
 *   documentLabel: string
 * }} props
 */
function LinkedNoteCard({ note, logoUrl, documentLabel }) {
  const t = useTranslations('Invoices')
  const tErr = useTranslations('AuthErrors')
  const router = useRouter()

  const apiSegment =
    note.documentNature === 'credit' ? 'credit-notes' : 'debit-notes'
  const detailHref = `/invoices/${apiSegment}/${note.id}`

  const canReport = canReportNoteToZatca(note.zatcaStatus)
  const canPrint = Boolean(note.qrCode?.trim())

  const reportMutation = useMutation({
    mutationFn: () => authPost(`/${apiSegment}/${note.id}/send`),
    onSuccess: () => {
      toast.success(t('reportSuccess'))
      router.refresh()
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      toast.error(code ? tErr(code) : tErr('generic'))
    },
  })

  const printMutation = useMutation({
    mutationFn: () =>
      printDocument({
        noteId: note.id,
        noteType: note.documentNature,
      }),
    onSuccess: (data) => {
      toastPrintResult(t, data)
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      toast.error(code ? tErr(code) : tErr('generic'))
    },
  })

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-hisabi-outline-variant/30 bg-slate-100/80 shadow-sm">
      <div className="flex items-center justify-between gap-hisabi-sm border-b border-hisabi-outline-variant/20 bg-white px-hisabi-md py-hisabi-sm">
        <Link
          href={detailHref}
          className="type-label-md text-hisabi-primary inline-flex items-center gap-1 font-bold hover:underline"
        >
          {documentLabel}
          <span dir="ltr">{note.noteNumber}</span>
          <ExternalLink className="size-4 shrink-0" aria-hidden />
        </Link>
      </div>
      <div className="flex-1 p-hisabi-md">
        <PosThermalReceiptPreview
          invoice={note}
          logoUrl={logoUrl}
          documentLabel={documentLabel}
        />
      </div>
      <div className="flex flex-col gap-hisabi-sm border-t border-hisabi-outline-variant/20 bg-white px-hisabi-md py-hisabi-md">
        {canReport ? (
          <AuthSubmitButton
            type="button"
            pending={reportMutation.isPending}
            onClick={() => reportMutation.mutate()}
          >
            <Send className="size-4" aria-hidden />
            {t('actionReport')}
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
            {t('actionPrint')}
          </AuthSubmitButton>
        ) : null}
      </div>
    </article>
  )
}
