'use client'

import { Suspense, useEffect, useRef } from 'react'

import { AppLoader } from '@/components/app-loader'
import { ZatcaOnboardingView } from '@/app/[locale]/zatca-onboarding/zatca-onboarding-view'
import { cn } from '@/lib/utils'

/**
 * Full onboarding UI in a native dialog (same view as `/zatca-onboarding`).
 *
 * @param {{
 *   open: boolean
 *   onOpenChange: (open: boolean) => void
 *   businessProfileId?: string | null
 * }} props
 */
export function ZatcaOnboardingModal({
  open,
  onOpenChange,
  businessProfileId = null,
}) {
  const ref = useRef(/** @type {HTMLDialogElement | null} */ (null))

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

  return (
    <dialog
      ref={ref}
      className={cn(
        'fixed inset-0 z-[100] m-0 max-h-none max-w-none',
        'h-full w-full border-0 bg-transparent p-0',
        'backdrop:bg-black/45',
      )}
    >
      <div
        className="flex h-full min-h-0 w-full items-center justify-center bg-black/35 p-hisabi-md"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            onOpenChange(false)
          }
        }}
      >
        <div
          className="flex h-[min(95dvh,56rem)] w-full max-w-[var(--width-hisabi-overlay-5xl)] flex-col overflow-hidden rounded-2xl bg-hisabi-background shadow-hisabi-2 ring-1 ring-hisabi-outline-variant/35"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {open ? (
            <Suspense
              fallback={
                <div className="text-hisabi-on-surface flex flex-1 flex-col items-center justify-center bg-hisabi-background">
                  <AppLoader />
                </div>
              }
            >
              <ZatcaOnboardingView
                variant="modal"
                open={open}
                onRequestClose={() => onOpenChange(false)}
                targetBusinessProfileId={businessProfileId}
              />
            </Suspense>
          ) : null}
        </div>
      </div>
    </dialog>
  )
}
