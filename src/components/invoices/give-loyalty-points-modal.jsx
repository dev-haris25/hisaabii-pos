'use client'

import { Gift } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useId, useRef, useState } from 'react'

import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import { RequiredMark } from '@/components/ui/required-mark'
import { AuthApiError, authPost } from '@/lib/api/auth-client'
import { normalizeLoyaltyPhone } from '@/lib/loyalty/normalize-loyalty-phone'
import { cn } from '@/lib/utils'

const fieldClass =
  'type-body-md text-hisabi-on-surface placeholder:text-hisabi-outline/70 w-full rounded-lg border border-hisabi-outline-variant bg-hisabi-surface-container-lowest px-hisabi-md py-3 outline-none transition-shadow focus:border-hisabi-primary focus:ring-1 focus:ring-hisabi-primary/15'
const fieldInvalidClass =
  'border-hisabi-error focus:border-hisabi-error focus:ring-hisabi-error/25'

/**
 * Lightweight phone-entry dialog for awarding loyalty points on a completed invoice.
 *
 * @param {{
 *   open: boolean
 *   onOpenChange: (open: boolean) => void
 *   invoiceId: string | null
 *   invoiceNumber?: string | null
 *   onSuccess?: (result: Record<string, unknown>) => void
 * }} props
 */
export function GiveLoyaltyPointsModal({
  open,
  onOpenChange,
  invoiceId,
  invoiceNumber,
  onSuccess,
}) {
  const t = useTranslations('Invoices')
  const tErr = useTranslations('AuthErrors')
  const titleId = useId()
  const descId = useId()
  const ref = useRef(/** @type {HTMLDialogElement | null} */ (null))

  const [phone, setPhone] = useState('')
  const [phoneError, setPhoneError] = useState('')
  const [formError, setFormError] = useState('')
  const [pending, setPending] = useState(false)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      d.showModal()
      setPhone('')
      setPhoneError('')
      setFormError('')
    } else if (!open && d.open) {
      d.close()
    }
  }, [open])

  useEffect(() => {
    const d = ref.current
    if (!d) return
    function onClose() {
      onOpenChange(false)
    }
    d.addEventListener('close', onClose)
    return () => d.removeEventListener('close', onClose)
  }, [onOpenChange])

  function handleBackdropMouseDown(e) {
    if (e.target === e.currentTarget && !pending) {
      onOpenChange(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!invoiceId || pending) return
    setFormError('')
    setPhoneError('')

    const normalized = normalizeLoyaltyPhone(phone)
    if (!normalized.valid) {
      setPhoneError(
        normalized.reason === 'invalid_length'
          ? tErr('LOYALTY_PHONE_INVALID_LENGTH')
          : normalized.reason === 'invalid_prefix'
            ? tErr('LOYALTY_PHONE_INVALID_PREFIX')
            : tErr('LOYALTY_PHONE_INVALID'),
      )
      return
    }

    setPending(true)
    try {
      const res = await authPost('/pos/loyalty/give-points', {
        invoiceId,
        phone: normalized.normalized,
      })
      onOpenChange(false)
      onSuccess?.(res ?? {})
    } catch (err) {
      const code = err instanceof AuthApiError ? err.code : undefined
      const message = code ? tErr(code) : tErr('generic')
      if (
        code === 'LOYALTY_PHONE_INVALID_LENGTH' ||
        code === 'LOYALTY_PHONE_INVALID_PREFIX' ||
        code === 'LOYALTY_PHONE_INVALID' ||
        code === 'LOYALTY_ACCOUNT_PHONE_INVALID'
      ) {
        setPhoneError(message)
      } else {
        setFormError(message)
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={descId}
      className={cn(
        'fixed inset-0 z-[100] m-0 max-h-none max-w-none',
        'h-full w-full border-0 bg-transparent p-0',
        'backdrop:bg-hisabi-primary/50 backdrop:backdrop-blur-sm',
      )}
    >
      <div
        className="flex h-full min-h-0 w-full items-center justify-center bg-hisabi-on-primary-fixed/80 p-hisabi-margin-mobile sm:p-hisabi-margin-desktop"
        onMouseDown={handleBackdropMouseDown}
      >
        <div
          className="w-full max-w-[var(--width-hisabi-overlay-md)] overflow-hidden rounded-xl border border-hisabi-outline-variant/50 bg-hisabi-surface-container-lowest shadow-hisabi-2"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="h-1 w-full shrink-0 bg-hisabi-secondary" aria-hidden />
          <form
            noValidate
            onSubmit={(e) => void handleSubmit(e)}
            className="space-y-hisabi-lg p-hisabi-lg sm:p-hisabi-xl"
          >
            <div className="flex items-start gap-hisabi-md">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-hisabi-secondary-container text-hisabi-secondary">
                <Gift className="size-5" aria-hidden />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <h2
                  id={titleId}
                  className="type-headline-md text-hisabi-on-surface"
                >
                  {t('givePointsTitle')}
                </h2>
                <p
                  id={descId}
                  className="type-body-md text-hisabi-on-surface-variant"
                >
                  {invoiceNumber
                    ? t('givePointsSubtitle', { invoiceNumber })
                    : t('givePointsSubtitleGeneric')}
                </p>
              </div>
            </div>

            {formError ? (
              <p className="type-body-md text-hisabi-error" role="alert">
                {formError}
              </p>
            ) : null}

            <div className="min-w-0 space-y-hisabi-xs">
              <label
                htmlFor="give-loyalty-phone"
                className="type-label-md text-hisabi-on-surface-variant flex items-center gap-1"
              >
                {t('givePointsPhoneLabel')}
                <RequiredMark />
              </label>
              <input
                id="give-loyalty-phone"
                className={cn(fieldClass, phoneError && fieldInvalidClass)}
                dir="ltr"
                inputMode="tel"
                autoComplete="tel"
                autoFocus
                value={phone}
                placeholder={t('givePointsPhonePlaceholder')}
                aria-invalid={phoneError ? true : undefined}
                disabled={pending}
                onChange={(e) => {
                  setPhone(e.target.value)
                  setPhoneError('')
                  setFormError('')
                }}
              />
              {phoneError ? (
                <p className="type-body-sm text-hisabi-error" role="alert">
                  {phoneError}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col-reverse gap-hisabi-md min-[425px]:grid min-[425px]:grid-cols-2">
              <button
                type="button"
                disabled={pending}
                className="type-label-md border-hisabi-outline text-hisabi-on-surface-variant hover:bg-hisabi-surface-container-low inline-flex min-h-hisabi-btn w-full cursor-pointer items-center justify-center rounded-xl border-2 px-hisabi-lg font-semibold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => onOpenChange(false)}
              >
                {t('cancel')}
              </button>
              <AuthSubmitButton
                type="submit"
                pending={pending}
                disabled={pending}
                className="min-h-hisabi-btn w-full"
              >
                {t('givePointsSubmit')}
              </AuthSubmitButton>
            </div>
          </form>
        </div>
      </div>
    </dialog>
  )
}
