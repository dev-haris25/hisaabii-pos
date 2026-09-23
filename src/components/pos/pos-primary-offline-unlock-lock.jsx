'use client'

import { ShieldAlert } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useId, useRef } from 'react'

import { cn } from '@/lib/utils'

/**
 * Primary till offline, but admin has not unlocked offline checkout yet.
 * Non-dismissible except via Logout / Enable offline mode (admin).
 *
 * @param {{
 *   open: boolean
 *   isAdmin: boolean
 *   unlocking?: boolean
 *   onLogout: () => void
 *   onUnlock?: () => void
 *   error?: string | null
 * }} props
 */
export function PosPrimaryOfflineUnlockLock({
  open,
  isAdmin,
  unlocking = false,
  onLogout,
  onUnlock,
  error = null,
}) {
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
                <ShieldAlert className="size-9" aria-hidden />
              </div>
            </div>
            <h2
              id={titleId}
              className="type-headline-md text-hisabi-on-surface mb-hisabi-sm"
            >
              {t('offlineModeLockedTitle')}
            </h2>
            <p
              id={descId}
              className="type-body-md text-hisabi-on-surface-variant px-hisabi-sm"
            >
              {isAdmin
                ? t('offlineModeLockedAdminBody')
                : t('offlineModeLockedBody')}
            </p>
            {error ? (
              <p className="type-body-sm text-hisabi-error mt-hisabi-sm">
                {error}
              </p>
            ) : null}
            <div className="mt-hisabi-lg flex flex-col gap-hisabi-sm sm:flex-row sm:justify-center">
              {isAdmin ? (
                <button
                  type="button"
                  disabled={unlocking}
                  onClick={() => onUnlock?.()}
                  className="bg-hisabi-primary text-hisabi-on-primary type-label-md rounded-lg px-hisabi-lg py-hisabi-sm font-bold disabled:opacity-60"
                >
                  {unlocking
                    ? t('offlineModeUnlocking')
                    : t('offlineModeEnable')}
                </button>
              ) : null}
              <button
                type="button"
                onClick={onLogout}
                className="type-label-md text-hisabi-on-surface-variant hover:bg-hisabi-surface-container rounded-lg px-hisabi-lg py-hisabi-sm font-bold"
              >
                {t('logout')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </dialog>
  )
}
