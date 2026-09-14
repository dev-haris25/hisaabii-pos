'use client'

import { AlertTriangle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useId, useRef } from 'react'

import { AuthButtonSpinner } from '@/components/auth/auth-button-spinner'
import { AuthSubmitButton } from '@/components/auth/auth-submit-button'
import { CRM_SHEET_FOOTER_CANCEL_CLASS } from '@/components/crm/crm-sheet-classes'
import { cn } from '@/lib/utils'

const modalGhostBtnClass =
  'type-label-md text-hisabi-on-surface-variant hover:bg-hisabi-surface-container hover:text-hisabi-teal flex min-h-[52px] w-full cursor-pointer items-center justify-center rounded-xl py-4 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hisabi-surface-tint/40 disabled:cursor-not-allowed disabled:opacity-50'

/**
 * @param {{
 *   open: boolean
 *   onOpenChange: (open: boolean) => void
 *   breakdown: {
 *     cap: string
 *     alreadyPaid: string
 *     headroom: string
 *     requested: string
 *     overflow: string
 *   } | null
 *   onChoose: (resolution: 'advance' | 'bonus' | 'force_salary') => void
 *   pendingChoice?: 'advance' | 'bonus' | 'force_salary' | null
 * }} props
 */
export function SalaryOverflowModal({
  open,
  onOpenChange,
  breakdown,
  onChoose,
  pendingChoice = null,
}) {
  const t = useTranslations('HR')
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
    if (e.target === e.currentTarget && !pendingChoice) {
      onOpenChange(false)
    }
  }

  const isPending = Boolean(pendingChoice)

  if (!breakdown) return null

  const rows = [
    ['overflowCap', breakdown.cap],
    ['overflowAlreadyPaid', breakdown.alreadyPaid],
    ['overflowHeadroom', breakdown.headroom],
    ['overflowRequested', breakdown.requested],
    ['overflowAmount', breakdown.overflow],
  ]

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={descId}
      className={cn(
        'fixed inset-0 z-[120] m-0 max-h-none max-w-none',
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
          <div className="px-hisabi-lg pb-hisabi-xl pt-hisabi-lg text-center sm:px-hisabi-xl sm:pt-hisabi-xl">
            <div className="mb-hisabi-lg flex justify-center">
              <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-hisabi-secondary-container text-hisabi-secondary">
                <AlertTriangle className="size-9" strokeWidth={2} aria-hidden />
              </div>
            </div>
            <h2 id={titleId} className="type-headline-md text-hisabi-on-surface mb-hisabi-sm">
              {t('overflowModalTitle')}
            </h2>
            <p id={descId} className="type-body-md text-hisabi-on-surface-variant mb-hisabi-lg px-hisabi-sm">
              {t('overflowModalDescription')}
            </p>

            <dl className="mb-hisabi-xl space-y-hisabi-sm rounded-lg border border-hisabi-outline-variant/30 bg-slate-50/80 p-hisabi-md text-start">
              {rows.map(([labelKey, value]) => (
                <div key={labelKey} className="flex items-center justify-between gap-hisabi-md">
                  <dt className="type-body-sm text-hisabi-on-surface-variant">{t(labelKey)}</dt>
                  <dd className="type-label-md font-mono font-semibold text-hisabi-on-surface" dir="ltr">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="space-y-hisabi-md">
              <AuthSubmitButton
                type="button"
                variant="gold"
                pending={pendingChoice === 'advance'}
                disabled={isPending}
                onClick={() => onChoose('advance')}
              >
                {t('overflowChooseAdvance')}
              </AuthSubmitButton>
              <button
                type="button"
                disabled={isPending}
                aria-busy={pendingChoice === 'bonus' || undefined}
                className={cn(CRM_SHEET_FOOTER_CANCEL_CLASS, 'text-hisabi-on-surface')}
                onClick={() => onChoose('bonus')}
              >
                {pendingChoice === 'bonus' ? (
                  <AuthButtonSpinner />
                ) : (
                  t('overflowChooseBonus')
                )}
              </button>
              <button
                type="button"
                disabled={isPending}
                aria-busy={pendingChoice === 'force_salary' || undefined}
                className={modalGhostBtnClass}
                onClick={() => onChoose('force_salary')}
              >
                {pendingChoice === 'force_salary' ? (
                  <AuthButtonSpinner />
                ) : (
                  t('overflowChooseForceSalary')
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </dialog>
  )
}
