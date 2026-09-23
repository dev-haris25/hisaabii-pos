'use client'

import { WifiOff } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useId, useRef } from 'react'

import { cn } from '@/lib/utils'

/**
 * Non-dismissible lock when a non-primary desktop till is offline.
 * No OK / backdrop close — clears only when parent sets open=false (back online).
 *
 * @param {{ open: boolean }} props
 */
export function PosNonPrimaryOfflineLock({ open }) {
  const t = useTranslations('Pos')
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
    if (!open) return undefined
    const d = ref.current
    if (!d) return undefined

    function onCancel(e) {
      e.preventDefault()
    }
    d.addEventListener('cancel', onCancel)
    return () => d.removeEventListener('cancel', onCancel)
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={descId}
      aria-modal="true"
      className={cn(
        'fixed inset-0 z-[110] m-0 max-h-none max-w-none',
        'h-full w-full border-0 bg-transparent p-0',
        'backdrop:bg-hisabi-primary/50 backdrop:backdrop-blur-sm',
      )}
    >
      <div className="flex h-full min-h-0 w-full items-center justify-center bg-hisabi-on-primary-fixed/80 p-hisabi-margin-mobile sm:p-hisabi-margin-desktop">
        <div className="w-full max-w-[var(--width-hisabi-overlay-md)] overflow-hidden rounded-xl border border-hisabi-outline-variant/50 bg-hisabi-surface-container-lowest shadow-hisabi-2">
          <div className="h-1 w-full shrink-0 bg-hisabi-secondary" aria-hidden />
          <div className="px-hisabi-lg pb-hisabi-xl pt-hisabi-lg text-center sm:px-hisabi-xl sm:pt-hisabi-xl">
            <div className="mb-hisabi-lg flex justify-center">
              <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-hisabi-secondary-container text-hisabi-secondary">
                <WifiOff className="size-9" aria-hidden />
              </div>
            </div>
            <h2
              id={titleId}
              className="type-headline-md text-hisabi-on-surface mb-hisabi-sm"
            >
              {t('nonPrimaryOfflineTitle')}
            </h2>
            <p
              id={descId}
              className="type-body-md text-hisabi-on-surface-variant px-hisabi-sm"
            >
              {t('nonPrimaryOfflineBody')}
            </p>
          </div>
        </div>
      </div>
    </dialog>
  )
}
