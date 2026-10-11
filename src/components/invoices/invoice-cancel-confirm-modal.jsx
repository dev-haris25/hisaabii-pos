'use client'

import { useMutation } from '@tanstack/react-query'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { HisabiStatusModal } from '@/components/hisabi-status-modal'
import { useRouter } from '@/i18n/navigation'
import { AuthApiError, authPost } from '@/lib/api/auth-client'

/**
 * Confirm invoice cancellation (full-reversal credit note, server-prefilled reason).
 * Uses HisabiStatusModal warning styling (gold accent) — same as Hisabi invoice
 * cancel / deactivate. Soft-delete uses error (red) instead.
 *
 * @param {{
 *   open: boolean
 *   onOpenChange: (open: boolean) => void
 *   invoiceId: string
 *   invoiceNumber: string
 * }} props
 */
export function InvoiceCancelConfirmModal({
  open,
  onOpenChange,
  invoiceId,
  invoiceNumber,
}) {
  const t = useTranslations('Invoices')
  const tErr = useTranslations('AuthErrors')
  const locale = useLocale()
  const router = useRouter()

  const cancelMutation = useMutation({
    mutationFn: () => authPost(`/invoices/${invoiceId}/cancel`),
    onSuccess: () => {
      toast.success(t('cancelSuccess'))
      router.refresh()
      onOpenChange(false)
    },
    onError: (err) => {
      // Translated message for the code (rules.md §5), never the raw server text.
      const code = err instanceof AuthApiError ? err.code : undefined
      toast.error(code && tErr.has(code) ? tErr(code) : tErr('generic'))
      // Note may still have been created as failed — refresh so it appears in lists.
      router.refresh()
    },
  })

  const pending = cancelMutation.isPending

  return (
    <HisabiStatusModal
      open={open}
      onOpenChange={(next) => {
        if (pending) return
        onOpenChange(next)
      }}
      variant="warning"
      title={t('cancelConfirmTitle')}
      description={
        <div className="space-y-hisabi-md text-start">
          <p className="type-body-md text-hisabi-on-surface-variant text-center">
            {t('cancelConfirmBody', { number: invoiceNumber })}
          </p>
          <div className="rounded-xl border border-hisabi-outline-variant/40 bg-hisabi-surface-container-low px-hisabi-lg py-hisabi-md">
            <p className="type-label-sm text-hisabi-on-surface-variant mb-hisabi-xs">
              {t('cancelReasonLabel')}
            </p>
            <p className="type-body-md text-hisabi-on-surface">
              {t('cancelDefaultReasonAr')}
            </p>
            {locale === 'en' ? (
              <p className="type-body-sm text-hisabi-on-surface-variant mt-hisabi-sm">
                {t('cancelDefaultReasonEn')}
              </p>
            ) : null}
          </div>
        </div>
      }
      primaryLabel={t('cancelConfirmPrimary')}
      onPrimary={() => cancelMutation.mutate()}
      primaryPending={pending}
      secondaryLabel={t('close')}
    />
  )
}
