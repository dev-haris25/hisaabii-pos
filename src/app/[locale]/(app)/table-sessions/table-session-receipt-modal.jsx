'use client'

import { useMutation } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import { PosThermalReceiptPreview } from '@/components/invoices/pos-thermal-receipt-preview'
import { useIsHisabiDesktop } from '@/hooks/use-is-hisabi-desktop'
import { printDocument } from '@/lib/print/print-document'
import { receiptActionLabel } from '@/lib/print/receipt-action-label'
import { toastPrintError } from '@/lib/print/toast-print-error'
import { toastPrintResult } from '@/lib/print/toast-print-result'

/**
 * POS-style receipt / print modal for table settle (no Give Loyalty Points).
 *
 * @param {{
 *   invoice: Record<string, unknown>
 *   onClose: () => void
 *   logoUrl?: string | null
 *   staffName?: string
 *   restaurantName?: string
 * }} props
 */
export function TableSessionReceiptModal({
  invoice,
  onClose,
  logoUrl = null,
  staffName = '',
  restaurantName = '',
}) {
  const tPos = useTranslations('Pos')
  const t = useTranslations('TableSessions')
  const desktop = useIsHisabiDesktop()

  const printMutation = useMutation({
    mutationFn: async () => {
      const id = typeof invoice.id === 'string' ? invoice.id : ''
      return printDocument({
        invoiceId: id,
        invoice,
        logoUrl: logoUrl ?? undefined,
      })
    },
    onSuccess: (result) => {
      toastPrintResult(tPos, result)
    },
    onError: (err) => {
      toastPrintError(err)
    },
  })

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-hisabi-md backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="table-settle-receipt-title"
        className="relative flex max-h-[min(92vh,900px)] w-full max-w-[22rem] flex-col overflow-hidden rounded-xl border border-hisabi-outline-variant/30 bg-hisabi-surface-container-lowest shadow-hisabi-2"
      >
        <button
          type="button"
          onClick={onClose}
          className="text-hisabi-outline hover:bg-hisabi-surface-container absolute end-2 top-2 z-10 cursor-pointer rounded-lg p-2 transition-colors"
          aria-label={t('settleReceiptDone')}
        >
          <X className="size-5" aria-hidden />
        </button>

        <div className="min-h-0 flex-1 overflow-y-auto px-hisabi-lg py-hisabi-lg">
          <p
            id="table-settle-receipt-title"
            className="type-label-sm text-hisabi-on-surface-variant mb-hisabi-sm text-center"
          >
            {tPos('successTitle')} — {tPos('receiptPreviewHint')}
          </p>
          <PosThermalReceiptPreview
            invoice={/** @type {any} */ (invoice)}
            logoUrl={logoUrl}
            fallbackStaffName={staffName}
            fallbackSellerName={restaurantName}
          />
        </div>

        <div className="shrink-0 space-y-hisabi-sm border-t border-hisabi-outline-variant/30 bg-hisabi-surface-container-lowest px-hisabi-lg py-hisabi-md">
          {typeof invoice.qrCode === 'string' && invoice.qrCode ? (
            <AuthSubmitButton
              type="button"
              pending={printMutation.isPending}
              onClick={() => printMutation.mutate()}
            >
              {receiptActionLabel(tPos, desktop)}
            </AuthSubmitButton>
          ) : (
            <p className="type-body-sm text-hisabi-on-surface-variant text-center">
              {tPos('printBlockedNoQr')}
            </p>
          )}
          <AuthSubmitButton type="button" variant="secondary" onClick={onClose}>
            {t('settleReceiptDone')}
          </AuthSubmitButton>
        </div>
      </div>
    </div>
  )
}
