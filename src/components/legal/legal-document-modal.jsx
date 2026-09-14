'use client'

import { X } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'
import { useTranslations } from 'next-intl'

import { cn } from '@/lib/utils'

/**
 * Scrollable modal with the same Privacy / Terms copy as the public pages.
 *
 * @param {{
 *   open: boolean
 *   onOpenChange: (open: boolean) => void
 *   namespace: 'PrivacyPolicy' | 'TermsOfService'
 *   sectionIds: string[]
 * }} props
 */
export function LegalDocumentModal({ open, onOpenChange, namespace, sectionIds }) {
  const t = useTranslations(namespace)
  const ref = useRef(/** @type {HTMLDialogElement | null} */ (null))
  const titleId = useId()
  const bodyId = useId()

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
      aria-describedby={bodyId}
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
          className="flex max-h-[min(90dvh,720px)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-hisabi-outline-variant/50 bg-hisabi-surface-container-lowest shadow-hisabi-2"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="h-1 w-full shrink-0 bg-hisabi-primary-container" aria-hidden />
          <div className="flex shrink-0 items-start justify-between gap-hisabi-md border-b border-hisabi-outline-variant/30 px-hisabi-lg py-hisabi-md sm:px-hisabi-xl">
            <div className="min-w-0">
              <h2 id={titleId} className="type-headline-md text-hisabi-on-surface">
                {t('title')}
              </h2>
              <p className="type-body-sm text-hisabi-on-surface-variant mt-1">
                {t('lastUpdated', { date: t('lastUpdatedDate') })}
              </p>
            </div>
            <button
              type="button"
              className="text-hisabi-on-surface-variant hover:bg-hisabi-surface-container hover:text-hisabi-on-surface -me-1 -mt-1 shrink-0 rounded-lg p-2 transition-colors"
              aria-label={t('close')}
              onClick={() => onOpenChange(false)}
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>

          <div
            id={bodyId}
            className="min-h-0 flex-1 space-y-hisabi-lg overflow-y-auto px-hisabi-lg py-hisabi-lg sm:px-hisabi-xl"
          >
            {sectionIds.map((id) => {
              const paragraphs = t.raw(`sections.${id}.paragraphs`)
              const list =
                Array.isArray(paragraphs) && paragraphs.every((p) => typeof p === 'string')
                  ? paragraphs
                  : []
              return (
                <section key={id} className="space-y-hisabi-sm">
                  <h3 className="type-headline-sm text-hisabi-on-surface">
                    {t(`sections.${id}.title`)}
                  </h3>
                  {list.map((para, i) => (
                    <p
                      key={`${id}-${i}`}
                      className="type-body-sm text-hisabi-on-surface-variant leading-relaxed"
                    >
                      {para}
                    </p>
                  ))}
                </section>
              )
            })}
          </div>
        </div>
      </div>
    </dialog>
  )
}
