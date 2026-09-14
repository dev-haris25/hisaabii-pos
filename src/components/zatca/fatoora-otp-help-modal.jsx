'use client'

import { CircleHelp, ExternalLink } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useId, useRef } from 'react'

import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import {
  FATOORA_PORTAL_URL,
  FATOORA_PORTAL_USER_MANUAL_URL,
} from '@/lib/zatca/fatoora-portal'
import { cn } from '@/lib/utils'

const HELP_STEP_KEYS = ['step1', 'step2', 'step3', 'step4', 'step5']

/**
 * @param {{
 *   open: boolean
 *   onOpenChange: (open: boolean) => void
 * }} props
 */
export function FatooraOtpHelpModal({ open, onOpenChange }) {
  const t = useTranslations('ZatcaOnboarding.otpHelp')
  const ref = useRef(/** @type {HTMLDialogElement | null} */ (null))
  const titleId = useId()
  const descId = useId()

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      d.showModal()
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
    if (e.target === e.currentTarget) {
      onOpenChange(false)
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
          className="border-hisabi-outline-variant/50 shadow-hisabi-2 w-full max-w-[var(--width-hisabi-overlay-lg)] overflow-hidden rounded-xl border bg-hisabi-surface-container-lowest"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="bg-hisabi-primary-container h-1 w-full shrink-0" aria-hidden />
          <div className="px-hisabi-lg pb-hisabi-xl pt-hisabi-lg sm:px-hisabi-xl sm:pt-hisabi-xl">
            <div className="mb-hisabi-md flex justify-center">
              <div className="bg-hisabi-primary-container/10 text-hisabi-teal flex size-14 items-center justify-center rounded-full">
                <CircleHelp className="size-8 shrink-0" aria-hidden />
              </div>
            </div>
            <h2
              id={titleId}
              className="type-headline-md text-hisabi-teal mb-hisabi-sm text-center"
            >
              {t('title')}
            </h2>
            <p
              id={descId}
              className="type-body-sm text-hisabi-outline mb-hisabi-lg text-center"
            >
              {t('intro')}
            </p>

            <ol className="mb-hisabi-lg space-y-hisabi-md">
              {HELP_STEP_KEYS.map((key, index) => (
                <li key={key} className="flex gap-hisabi-md text-start">
                  <span
                    className="bg-hisabi-teal-container/15 text-hisabi-teal type-label-md flex size-7 shrink-0 items-center justify-center rounded-full font-bold"
                    aria-hidden
                  >
                    {index + 1}
                  </span>
                  <p className="type-body-sm text-hisabi-on-surface pt-0.5 leading-relaxed">
                    {t(key)}
                  </p>
                </li>
              ))}
            </ol>

            <div className="bg-hisabi-surface-container-low border-hisabi-outline-variant/40 mb-hisabi-lg rounded-lg border p-hisabi-md">
              <p className="type-body-sm text-hisabi-on-surface-variant leading-relaxed">
                {t('otpValidityNote')}
              </p>
            </div>

            <div className="space-y-hisabi-md">
              <AuthSubmitButton
                type="button"
                className="w-full"
                onClick={() => {
                  window.open(FATOORA_PORTAL_URL, '_blank', 'noopener,noreferrer')
                }}
              >
                <span className="flex items-center justify-center gap-hisabi-sm">
                  <ExternalLink className="size-5 shrink-0" aria-hidden />
                  {t('openPortal')}
                </span>
              </AuthSubmitButton>
              <button
                type="button"
                className={cn(
                  'type-label-md text-hisabi-teal hover:text-hisabi-teal-container flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-hisabi-xs underline decoration-hisabi-teal-container/40 underline-offset-4 transition-colors hover:decoration-hisabi-teal',
                )}
                onClick={() => {
                  window.open(
                    FATOORA_PORTAL_USER_MANUAL_URL,
                    '_blank',
                    'noopener,noreferrer',
                  )
                }}
              >
                <ExternalLink className="size-4 shrink-0" aria-hidden />
                {t('viewManual')}
              </button>
              <button
                type="button"
                className={cn(
                  'type-label-md text-hisabi-on-surface-variant flex min-h-[52px] w-full cursor-pointer items-center justify-center rounded-xl py-4 transition-colors',
                  'hover:bg-hisabi-surface-container hover:text-hisabi-teal',
                )}
                onClick={() => onOpenChange(false)}
              >
                {t('close')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </dialog>
  )
}
