'use client'

import { useMutation } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { HisabiStatusModal } from '@/components/hisabi-status-modal'
import { useRouter } from '@/i18n/navigation'
import { AuthApiError, authDelete } from '@/lib/api/auth-client'

/**
 * Confirm soft-delete of a pending or failed invoice or credit/debit note.
 * Uses StatusModal **error** (red accent + destructive CTA) — same as Hisabi
 * hard-delete confirms. Cancel invoice stays **warning** (gold).
 *
 * @param {{
 *   open: boolean
 *   onOpenChange: (open: boolean) => void
 *   apiPath: string
 *   documentNumber: string
 *   successMessage: string
 *   title: string
 *   body: string
 *   redirectTo?: string | null
 * }} props
 */
export function SoftDeleteConfirmModal({
  open,
  onOpenChange,
  apiPath,
  documentNumber: _documentNumber,
  successMessage,
  title,
  body,
  redirectTo = null,
}) {
  const t = useTranslations('Invoices')
  const tErr = useTranslations('AuthErrors')
  const router = useRouter()

  const deleteMutation = useMutation({
    mutationFn: () => authDelete(apiPath),
    onSuccess: () => {
      toast.success(successMessage)
      onOpenChange(false)
      if (redirectTo) {
        router.push(redirectTo)
      }
      router.refresh()
    },
    onError: (err) => {
      const code = err instanceof AuthApiError ? err.code : undefined
      toast.error(code ? tErr(code) : tErr('generic'))
    },
  })

  const pending = deleteMutation.isPending

  return (
    <HisabiStatusModal
      open={open}
      onOpenChange={(next) => {
        if (pending) return
        onOpenChange(next)
      }}
      variant="error"
      title={title}
      description={
        <p className="type-body-md text-hisabi-on-surface-variant text-center">
          {body}
        </p>
      }
      primaryLabel={t('deleteConfirmPrimary')}
      onPrimary={() => deleteMutation.mutate()}
      primaryPending={pending}
      secondaryLabel={t('close')}
    />
  )
}
